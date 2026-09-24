#include <iomanip>
#include <iostream>
#include <vector>
#include "../cpp/jaipur_ai.cpp"

int main() {
  using namespace jaipur;
  std::cout << std::setprecision(9);
  int length;
  while (std::cin >> length) {
    std::vector<int32_t> input(length);
    for (auto& value : input) std::cin >> value;
    Observation observation;
    if (!parse_observation(input.data(), length, observation)) return 2;
    Rng rng{hash_input(input.data(), length)};
    const auto features = neural_features(determinize(observation, rng));
    for (int i = 0; i < NN_FEATURES; ++i)
      std::cout << (i ? " " : "") << features[i];
    std::cout << '\n';
  }
}
