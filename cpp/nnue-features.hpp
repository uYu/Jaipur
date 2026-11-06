// Included inside namespace jaipur. Binary features in the observer's frame.
// Never read the other hand/bonus values, either deck order, or bonus order.
constexpr int NNUE_FEATURES = 301;
using NnueFeatures = std::array<uint8_t, NNUE_FEATURES>;

NnueFeatures nnue_features(const State& s, int observer) {
  NnueFeatures x{};
  int at = 0;
  const auto one_hot = [&](int value, int width) {
    x[at + std::clamp(value, 0, width - 1)] = 1;
    at += width;
  };
  const auto bits = [&](int value, int width) {
    for (int bit = 0; bit < width; ++bit) x[at++] = (value >> bit) & 1;
  };
  const auto& own = s.players[observer];
  const auto& other = s.players[1 - observer];
  for (int count : own.hand) one_hot(count, 8);
  for (int count : s.market) one_hot(count, 6);
  for (int count : s.token_count) one_hot(count, 10);
  for (int count : s.bonus_count) one_hot(count, 8);
  one_hot(own.camels, 12);
  one_hot(other.hand_count, 8);
  one_hot(s.deck_count, 41);
  bits(own.goods, 8);
  bits(other.goods, 8);
  bits(own.bonuses, 7);
  bits(own.bonus_count, 5);
  bits(own.goods_count, 6);
  bits(other.goods_count, 6);
  for (int count : s.discarded) bits(count, 4);
  one_hot(s.current == observer ? 0 : 1, 2);
  return x;
}
