#include <array>
#include <cassert>
#include <cmath>
#include <iostream>
#include "../cpp/tiny_nn.h"

int main() {
  std::array<float, 37> a{}, b{};
  for (int i = 0; i < 37; ++i) {
    a[i] = (i - 15) * 0.03125f;
    b[i] = (i % 9 - 4) * 0.0625f;
  }
  for (int length = 0; length <= 37; ++length) {
    float reference = 0;
    for (int i = 0; i < length; ++i) reference += a[i] * b[i];
    assert(std::abs(tiny_nn::dot(a.data(), b.data(), length) - reference) < 1e-5f);
  }
  for (int length = 0; length <= 37; ++length) {
    auto updated = a;
    tiny_nn::axpy(updated.data(), b.data(), 0.375f, length);
    for (int i = 0; i < 37; ++i) {
      const float expected = a[i] + (i < length ? b[i] * 0.375f : 0.0f);
      assert(std::abs(updated[i] - expected) < 1e-6f);
    }
  }
  std::array<float, 3 * 17> weights{};
  std::array<float, 17> input{};
  std::array<float, 3> bias{0.5f, -0.5f, 0.25f};
  std::array<float, 3> output{};
  for (int i = 0; i < 17; ++i) input[i] = a[i];
  for (int i = 0; i < 51; ++i) weights[i] = b[i % 37];
  tiny_nn::linear_relu(weights.data(), bias.data(), input.data(),
                       output.data(), 17, 3);
  for (int row = 0; row < 3; ++row) {
    float expected = bias[row];
    for (int col = 0; col < 17; ++col)
      expected += weights[row * 17 + col] * input[col];
    assert(std::abs(output[row] - std::max(expected, 0.0f)) < 1e-5f);
  }
  std::cout << "tiny_nn " << tiny_nn::backend_name << " passed\n";
}
