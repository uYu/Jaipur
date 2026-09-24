// Included inside namespace jaipur after rollout-policy.hpp.
#ifdef JAIPUR_NN_WEIGHTS_HEADER
#include JAIPUR_NN_WEIGHTS_HEADER
#else
#include "nn-weights.hpp"
#endif

constexpr int NN_FEATURES = POLICY_FEATURES + 20;

std::array<float, NN_FEATURES> neural_features(const State& s) {
  std::array<float, NN_FEATURES> input{};
  const auto base = policy_features(s);
  for (int i = 0; i < POLICY_FEATURES; ++i) input[i] = float(base[i]);
  int at = POLICY_FEATURES;
  for (int g = 0; g < GOODS; ++g) input[at++] = s.market[g] / 5.0f;
  input[at++] = s.market[CAMEL] / 5.0f;
  for (int g = 0; g < GOODS; ++g)
    input[at++] = s.token_count[g] / float(g < 3 ? 5 : (g < 5 ? 7 : 9));
  for (int tier = 0; tier < 3; ++tier)
    input[at++] = s.bonus_count[tier] / float(BONUS_TOTALS[tier]);
  input[at++] = s.deck_count / 40.0f;
  input[at++] = (s.players[0].hand_count - s.players[1].hand_count) / 7.0f;
  input[at++] = s.players[0].hand_count / 7.0f;
  input[at++] = s.players[1].hand_count / 7.0f;
  return input;
}

float neural_forward(const std::array<float, NN_FEATURES>& input) {
#ifdef NN_SYMMETRIC
  float correction = 0;
  const float hand_sum = input[158] + input[159];
#ifdef NN_TRANSPOSED
  std::array<float, NN_HIDDEN> difference{};
  std::array<float, NN_HIDDEN> context = NN_B_PUBLIC;
  for (int i = 0; i < 140; ++i)
    if (input[i] != 0.0f)
      tiny_nn::axpy(difference.data(), NN_W_DIFF.data() + i * NN_HIDDEN,
                    input[i], NN_HIDDEN);
  if (input[157] != 0.0f)
    tiny_nn::axpy(difference.data(), NN_W_DIFF.data() + 140 * NN_HIDDEN,
                  input[157], NN_HIDDEN);
  for (int i = 0; i < 17; ++i)
    if (input[140 + i] != 0.0f)
      tiny_nn::axpy(context.data(), NN_W_PUBLIC.data() + i * NN_HIDDEN,
                    input[140 + i], NN_HIDDEN);
  if (hand_sum != 0.0f)
    tiny_nn::axpy(context.data(), NN_W_PUBLIC.data() + 17 * NN_HIDDEN,
                  hand_sum, NN_HIDDEN);
  for (int unit = 0; unit < NN_HIDDEN; ++unit)
    correction += NN_W2[unit] *
        (std::max(0.0f, context[unit] + difference[unit]) -
         std::max(0.0f, context[unit] - difference[unit]));
#else
  for (int unit = 0; unit < NN_HIDDEN; ++unit) {
    const float* signed_row = NN_W_DIFF.data() + unit * 141;
    const float* public_row = NN_W_PUBLIC.data() + unit * 18;
    const float difference = tiny_nn::dot(signed_row, input.data(), 140)
        + signed_row[140] * input[157];
    const float context = tiny_nn::dot(public_row, input.data() + 140, 17)
        + public_row[17] * hand_sum + NN_B_PUBLIC[unit];
    correction += NN_W2[unit] *
        (std::max(0.0f, context + difference) -
         std::max(0.0f, context - difference));
  }
#endif
  return std::tanh(tiny_nn::dot(NN_BASELINE.data(), input.data(),
                                NN_FEATURES) + correction);
#else
  std::array<float, NN_HIDDEN> hidden{};
  float output = 0;
  tiny_nn::linear_relu(NN_W1.data(), NN_B1.data(), input.data(),
                       hidden.data(), NN_FEATURES, NN_HIDDEN);
  tiny_nn::linear(NN_W2.data(), NN_B2.data(), hidden.data(), &output,
                  NN_HIDDEN, 1);
  return std::tanh(tiny_nn::dot(NN_BASELINE.data(), input.data(),
                                NN_FEATURES) + output);
#endif
}

double neural_value(const State& s) {
  if (s.terminal) return s.value;
  return neural_forward(neural_features(s));
}

Action neural_action(const State& s, Rng& rng, int exploration_per_thousand,
                     const std::chrono::steady_clock::time_point* deadline = nullptr) {
  if (rng.index(1000) < exploration_per_thousand) return rollout_action(s, rng);
  const auto actions = atomic_actions(s);
  Action best = actions.front();
  double value = -std::numeric_limits<double>::infinity();
  int ties = 0;
  for (const auto& action : actions) {
    if (deadline && std::chrono::steady_clock::now() >= *deadline) break;
    State next = s;
    apply_action(next, action);
    const double candidate = (s.current == 0 ? 1 : -1) * neural_value(next);
    if (candidate > value + 1e-8) {
      value = candidate; best = action; ties = 1;
    } else if (std::abs(candidate - value) < 1e-8 && rng.index(++ties) == 0) {
      best = action;
    }
  }
  return best;
}
