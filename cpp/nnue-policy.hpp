// Experimental quantized value network; weights supplied only to research builds.
#include "nnue-features.hpp"
#include JAIPUR_NNUE_WEIGHTS_HEADER

static_assert(NNUE_WEIGHT_FEATURES == NNUE_FEATURES);
static_assert(NNUE_HIDDEN <= 128);

struct NnueAccumulator {
  NnueFeatures features{};
  std::array<int32_t, NNUE_HIDDEN> sums = NNUE_B1;

  NnueAccumulator() = default;
  explicit NnueAccumulator(const NnueFeatures& input) {
    update(input);
  }

  // Copy a parent's accumulator before updating siblings. Integer additions
  // make refresh, update and undo exactly equivalent, without float drift.
  void update(const NnueFeatures& input) {
    for (int feature = 0; feature < NNUE_FEATURES; ++feature) {
      const int delta = int(input[feature]) - int(features[feature]);
      if (!delta) continue;
      const auto* weights = NNUE_W1.data() + feature * NNUE_HIDDEN;
      for (int unit = 0; unit < NNUE_HIDDEN; ++unit)
        sums[unit] += delta * weights[unit];
    }
    features = input;
  }

  double value() const {
    int64_t output = NNUE_B2;
    for (int unit = 0; unit < NNUE_HIDDEN; ++unit)
      output += int64_t(std::clamp(sums[unit], 0, NNUE_ACTIVATION_SCALE)) * NNUE_W2[unit];
    return std::tanh(double(output) / (NNUE_ACTIVATION_SCALE * NNUE_OUTPUT_SCALE));
  }
};

double nnue_child_value(const State& next, int observer,
                        const NnueAccumulator& parent) {
  if (next.terminal) return (observer == 0 ? 1 : -1) * next.value;
  auto child = parent;
  child.update(nnue_features(next, observer));
  return child.value();
}
