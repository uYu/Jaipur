#include <iomanip>
#include "../cpp/jaipur_ai.cpp"
int main() {
  using namespace jaipur;
  std::array<float, BELIEF_STATE_FEATURES + BELIEF_ACTION_FEATURES> x{};
  std::cout << std::setprecision(9);
  while (std::cin >> x[0]) {
    for (size_t i=1;i<x.size();++i) if (!(std::cin >> x[i])) return 2;
    BeliefStateFeatures state{};
    std::copy_n(x.begin(), BELIEF_STATE_FEATURES, state.begin());
    std::cout << belief_policy_forward(x) << ' ' << belief_value_logit(state) << '\n';
  }
}
