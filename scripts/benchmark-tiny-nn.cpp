#include <chrono>
#include <iomanip>
#include <iostream>
#include "../cpp/jaipur_ai.cpp"

using namespace jaipur;

template <class F> double measure(int count, F&& run) {
  volatile float result = 0;
  const auto start = std::chrono::steady_clock::now();
  for (int i = 0; i < count; ++i) result = run(i);
  const auto end = std::chrono::steady_clock::now();
  (void)result;
  return std::chrono::duration<double, std::nano>(end - start).count() / count;
}

int main() {
  constexpr int repetitions = 300000;
  std::array<std::array<float, NN_FEATURES>, 256> inputs{};
  uint32_t seed = uint32_t(std::chrono::steady_clock::now().time_since_epoch().count());
  for (auto& input : inputs)
    for (float& value : input) {
      seed = seed * 1664525u + 1013904223u;
      value = float(int((seed >> 16) % 2001) - 1000) / 1000.0f;
    }
  State state;
  state.deck_count = 25;
  state.market = {1, 0, 1, 1, 1, 0, 1};
  state.players[0].hand = {0, 0, 1, 0, 0, 3};
  state.players[0].hand_count = 4;
  state.players[1].hand = {0, 1, 0, 1, 1, 0};
  state.players[1].hand_count = 3;
  state.players[0].camels = 3;
  state.players[1].camels = 2;
  state.token_count = {5, 5, 5, 7, 7, 9};
  state.bonus_count = BONUS_TOTALS;
  state.tokens[5] = {4,3,2,1,1,1,1,1,1};
  state.tokens[2] = {5,5,5,5,5};
  const auto scalar_dot = [&](const auto& input) {
    float sum = 0;
    for (int j = 0; j < NN_FEATURES; ++j) sum += input[j] * NN_BASELINE[j];
    return sum;
  };
  const double scalar_ns = measure(repetitions, [&](int i) {
    return scalar_dot(inputs[i & 255]);
  });
  const double dot_ns = measure(repetitions, [&](int i) {
    const auto& input = inputs[i & 255];
    return tiny_nn::dot(input.data(), NN_BASELINE.data(), NN_FEATURES);
  });
  const double forward_ns = measure(repetitions, [&](int i) {
    return neural_forward(inputs[i & 255]);
  });
  const double baseline_ns = measure(repetitions, [&](int i) {
    state.current = i & 1;
    state.players[0].goods = i % 83;
    return float(policy_value(state, TRAINED_POLICY));
  });
  const double neural_ns = measure(repetitions, [&](int i) {
    state.current = i & 1;
    state.players[0].goods = i % 83;
    return float(neural_value(state));
  });
  std::cout << std::fixed << std::setprecision(1)
            << "backend=" << tiny_nn::backend_name
            << " width=" << tiny_nn::simd_width
            << " scalar_dot_ns=" << scalar_ns
            << " tiny_dot_ns=" << dot_ns
            << " nn_forward_ns=" << forward_ns
            << " baseline_state_ns=" << baseline_ns
            << " neural_state_ns=" << neural_ns << '\n';
}
