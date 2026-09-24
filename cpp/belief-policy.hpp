// Observation-only encoder. No determinized hand, deck, or bonus token is read.
constexpr int BELIEF_STATE_FEATURES = 142;
constexpr int BELIEF_ACTION_FEATURES = 24;
using BeliefStateFeatures = std::array<float, BELIEF_STATE_FEATURES>;
using BeliefActionFeatures = std::array<float, BELIEF_ACTION_FEATURES>;

BeliefStateFeatures belief_features(const Observation& o) {
  BeliefStateFeatures x{};
  int at = 0;
  for (int v : o.hand) x[at++] = v / 7.f;
  x[at++] = o.goods_sum / 100.f;
  x[at++] = o.opponent_goods_sum / 100.f;
  x[at++] = std::accumulate(o.bonuses.begin(), o.bonuses.end(), 0) / 50.f;
  x[at++] = o.hand_count / 7.f;
  x[at++] = o.opponent_hand_count / 7.f;
  x[at++] = o.camels / 11.f;
  x[at++] = o.deck_count / 40.f;
  x[at++] = o.turn / 100.f;
  std::array<int, 7> market{};
  for (int card : o.market) ++market[card];
  for (int v : market) x[at++] = v / 5.f;
  for (int v : o.token_count) x[at++] = v / 9.f;
  for (int g = 0; g < GOODS; ++g)
    for (int n = 0; n < 9; ++n)
      x[at++] = n < o.token_count[g] ? o.tokens[g][n] / 7.f : 0;
  for (int v : o.bonus_count) x[at++] = v / 7.f;
  for (int v : o.discarded) x[at++] = v / 10.f;
  double total = 0, close = 0;
  for (const auto& world : o.hand_worlds) total += world.weight;
  const bool two_empty = std::count(o.token_count.begin(), o.token_count.end(), 0) >= 2;
  for (const auto& world : o.hand_worlds) {
    const double p = world.weight / total;
    bool can_close = false;
    for (int g = 0; g < GOODS; ++g) {
      x[at + g * 8 + world.hand[g]] += p;
      can_close |= two_empty && o.token_count[g] > 0 &&
          world.hand[g] >= std::max(g < 3 ? 2 : 1, o.token_count[g]);
    }
    if (can_close) close += p;
  }
  at += 48;
  x[at++] = close;
  x[at++] = o.bonuses.size() / 18.f;
  x[at++] = o.goods_count / 38.f;
  x[at++] = o.opponent_goods_count / 38.f;
  return x;
}

BeliefActionFeatures belief_action_features(const Action& a) {
  BeliefActionFeatures x{};
  x[int(a.kind)] = 1;
  for (int g = 0; g < GOODS; ++g) {
    x[4 + g] = a.take[g] / 7.f;
    x[10 + g] = a.give[g] / 7.f;
  }
  x[16] = a.count / 7.f;
  if (a.kind == ActionKind::Take || a.kind == ActionKind::Sell)
    x[17 + a.good] = 1;
  x[23] = a.camels / 7.f;
  return x;
}

#ifdef JAIPUR_BELIEF_WEIGHTS_HEADER
#include JAIPUR_BELIEF_WEIGHTS_HEADER
float belief_policy_forward(const std::array<float, BELIEF_STATE_FEATURES + BELIEF_ACTION_FEATURES>& x) {
  std::array<float, BELIEF_HIDDEN> hidden{};
  tiny_nn::linear_relu(BELIEF_POLICY_W1.data(), BELIEF_POLICY_B1.data(),
                      x.data(), hidden.data(), x.size(), BELIEF_HIDDEN);
  return tiny_nn::dot(BELIEF_POLICY_W2.data(), hidden.data(), BELIEF_HIDDEN)
      + BELIEF_POLICY_B2[0];
}
float belief_value_logit(const BeliefStateFeatures& x) {
  std::array<float, BELIEF_HIDDEN> hidden{};
  tiny_nn::linear_relu(BELIEF_VALUE_W1.data(), BELIEF_VALUE_B1.data(),
                      x.data(), hidden.data(), x.size(), BELIEF_HIDDEN);
  return tiny_nn::dot(BELIEF_VALUE_W2.data(), hidden.data(), BELIEF_HIDDEN)
      + BELIEF_VALUE_B2[0];
}
float belief_policy_logit(const BeliefStateFeatures& state, const Action& action) {
  std::array<float, BELIEF_STATE_FEATURES + BELIEF_ACTION_FEATURES> x{};
  std::copy(state.begin(), state.end(), x.begin());
  const auto a = belief_action_features(action);
  std::copy(a.begin(), a.end(), x.begin() + BELIEF_STATE_FEATURES);
  return belief_policy_forward(x);
}
#endif
