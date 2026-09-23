#include <cstdint>
#include <iostream>
#include <vector>
#include "../cpp/jaipur_ai.cpp"

using namespace jaipur;

State deal_training(Rng& rng) {
  State s;
  std::vector<int> cards;
  for (int g = 0; g <= GOODS; ++g)
    for (int n = 0; n < CARD_COUNTS[g] - (g == CAMEL ? 3 : 0); ++n)
      cards.push_back(g);
  shuffle(cards, rng);
  for (auto& p : s.players)
    for (int n = 0; n < 5; ++n) {
      const int c = cards.back(); cards.pop_back();
      if (c == CAMEL) ++p.camels;
      else { ++p.hand[c]; ++p.hand_count; }
    }
  s.market[CAMEL] = 3;
  s.deck_count = cards.size();
  std::copy(cards.begin(), cards.end(), s.deck.begin());
  refill(s);
  s.tokens = {{{{7,7,5,5,5}}, {{6,6,5,5,5}}, {{5,5,5,5,5}},
               {{5,3,3,2,2,1,1}}, {{5,3,3,2,2,1,1}},
               {{4,3,2,1,1,1,1,1,1}}}};
  s.token_count = {5,5,5,7,7,9};
  for (int tier = 0; tier < 3; ++tier) {
    std::vector<int> values(BONUS_VALUES[tier].begin(),
                            BONUS_VALUES[tier].begin() + BONUS_TOTALS[tier]);
    shuffle(values, rng);
    std::copy(values.begin(), values.end(), s.bonus[tier].begin());
  }
  s.bonus_count = BONUS_TOTALS;
  s.current = rng.index(2);
  return s;
}

int main(int argc, char** argv) {
  const int games = argc > 1 ? std::stoi(argv[1]) : 10000;
  const uint32_t seed = argc > 2 ? uint32_t(std::stoul(argv[2])) : 20260923;
  if (games < 1) return 2;
  Rng rng{seed};
  int records = 0, finished = 0;
  for (int game = 0; game < games; ++game) {
    State s = deal_training(rng);
    std::vector<std::array<float, NN_FEATURES>> positions;
    for (int turn = 0; turn < 256 && !s.terminal; ++turn) {
      if (turn % 6 == 0) positions.push_back(neural_features(s));
      apply_action(s, policy_action(s, rng, TRAINED_POLICY, 200));
    }
    if (!s.terminal) continue;
    ++finished;
    const auto& a = s.players[0];
    const auto& b = s.players[1];
    const int camel = a.camels == b.camels ? 0 : (a.camels > b.camels ? 5 : -5);
    const float target = float(a.goods + a.bonuses - b.goods - b.bonuses + camel) / 224.0f;
    for (const auto& position : positions) {
      float row[NN_FEATURES + 2];
      for (int i = 0; i < NN_FEATURES; ++i) row[i] = position[i];
      row[NN_FEATURES] = target;
      row[NN_FEATURES + 1] = float(s.value);
      std::cout.write(reinterpret_cast<const char*>(row), sizeof(row));
      ++records;
    }
  }
  std::cerr << "generated games=" << finished << "/" << games
            << " positions=" << records << " seed=" << seed << '\n';
}
