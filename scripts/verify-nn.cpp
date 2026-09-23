#include <iomanip>
#include "../cpp/jaipur_ai.cpp"

int main() {
  std::array<float, jaipur::NN_FEATURES> input{};
  std::cout << std::setprecision(10);
  while (std::cin.read(reinterpret_cast<char*>(input.data()), sizeof(input)))
    std::cout << jaipur::neural_forward(input) << '\n';
}
