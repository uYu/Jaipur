#include <algorithm>
#include <array>
#include <cmath>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <limits>
#include <numeric>
#include <vector>

namespace jaipur {

constexpr int GOODS = 6;
constexpr int CAMEL = 6;
constexpr int TREES = 8;
constexpr std::array<int, 7> CARD_COUNTS{6, 6, 6, 8, 8, 10, 11};
constexpr std::array<std::array<int, 7>, 3> BONUS_VALUES{{
    {1, 1, 2, 2, 2, 3, 3},
    {4, 4, 5, 5, 6, 6, 0},
    {8, 8, 9, 10, 10, 0, 0},
}};
constexpr std::array<int, 3> BONUS_TOTALS{7, 6, 5};

struct Rng {
  uint32_t value;
  uint32_t next() {
    value = value * 1664525u + 1013904223u;
    return value;
  }
  int index(int limit) {
    return static_cast<int>((static_cast<uint64_t>(next()) * limit) >> 32);
  }
};

template <class T> void shuffle(std::vector<T>& values, Rng& rng) {
  for (int i = static_cast<int>(values.size()) - 1; i > 0; --i)
    std::swap(values[i], values[rng.index(i + 1)]);
}

struct Observation {
  std::array<int, GOODS> hand{};
  int hand_count = 0;
  int camels = 0;
  int goods_sum = 0;
  int goods_count = 0;
  std::vector<int> bonuses;
  int opponent_goods_sum = 0;
  int opponent_goods_count = 0;
  std::array<int, GOODS> known{};
  std::array<int, 5> market{};
  std::array<std::array<int, 9>, GOODS> tokens{};
  std::array<int, GOODS> token_count{};
  std::array<int, 3> bonus_count{};
  std::array<int, GOODS> discarded{};
  int deck_count = 0;
  int opponent_hand_count = 0;
  int turn = 0;
};

struct Player {
  std::array<int, GOODS> hand{};
  int hand_count = 0;
  int camels = 0;
  int goods = 0;
  int bonuses = 0;
  int goods_count = 0;
  int bonus_count = 0;
};

struct State {
  int current = 0;
  std::array<Player, 2> players{};
  std::array<int, 7> market{};
  std::array<int, 55> deck{};
  int deck_count = 0;
  std::array<std::array<int, 9>, GOODS> tokens{};
  std::array<int, GOODS> token_start{};
  std::array<int, GOODS> token_count{};
  std::array<std::array<int, 7>, 3> bonus{};
  std::array<int, 3> bonus_count{};
  std::array<int, GOODS> discarded{};
  bool terminal = false;
  double value = 0;
};

enum class ActionKind : uint8_t { Take, Camels, Sell, Exchange };
struct Action {
  ActionKind kind = ActionKind::Take;
  int good = 0;
  int count = 0;
  std::array<int, GOODS> take{};
  std::array<int, GOODS> give{};
  int camels = 0;
  bool operator==(const Action& other) const {
    return kind == other.kind && good == other.good && count == other.count &&
           take == other.take && give == other.give && camels == other.camels;
  }
};

int sum(const int* values, int count) {
  return std::accumulate(values, values + count, 0);
}

int tier_for(int count) { return std::min(5, count) - 3; }

void finish(State& state) {
  const auto& a = state.players[0];
  const auto& b = state.players[1];
  const int camel = a.camels == b.camels ? -1 : (a.camels > b.camels ? 0 : 1);
  const int score_a = a.goods + a.bonuses + (camel == 0 ? 5 : 0);
  const int score_b = b.goods + b.bonuses + (camel == 1 ? 5 : 0);
  int difference = score_a - score_b;
  if (difference == 0) difference = a.bonus_count - b.bonus_count;
  if (difference == 0) difference = a.goods_count - b.goods_count;
  const double outcome = difference == 0 ? 0 : (difference > 0 ? 1 : -1);
  state.value = outcome;
  state.terminal = true;
}

void refill(State& state) {
  int market_size = sum(state.market.data(), 7);
  while (market_size < 5 && state.deck_count > 0) {
    ++state.market[state.deck[--state.deck_count]];
    ++market_size;
  }
}

void apply_action(State& state, const Action& action) {
  Player& player = state.players[state.current];
  if (action.kind == ActionKind::Take) {
    --state.market[action.good];
    ++player.hand[action.good];
    ++player.hand_count;
    refill(state);
  } else if (action.kind == ActionKind::Camels) {
    player.camels += state.market[CAMEL];
    state.market[CAMEL] = 0;
    refill(state);
  } else if (action.kind == ActionKind::Sell) {
    player.hand[action.good] -= action.count;
    player.hand_count -= action.count;
    state.discarded[action.good] += action.count;
    const int received = std::min(action.count, state.token_count[action.good]);
    for (int i = 0; i < received; ++i)
      player.goods += state.tokens[action.good]
                                  [state.token_start[action.good]++];
    state.token_count[action.good] -= received;
    player.goods_count += received;
    if (action.count >= 3) {
      const int tier = tier_for(action.count);
      if (state.bonus_count[tier] > 0) {
        player.bonuses += state.bonus[tier][--state.bonus_count[tier]];
        ++player.bonus_count;
      }
    }
  } else {
    for (int good = 0; good < GOODS; ++good) {
      player.hand[good] += action.take[good] - action.give[good];
      state.market[good] += action.give[good] - action.take[good];
    }
    const int amount = sum(action.take.data(), GOODS);
    player.hand_count += amount - sum(action.give.data(), GOODS);
    player.camels -= action.camels;
    state.market[CAMEL] += action.camels;
  }
  int empty = 0;
  for (int count : state.token_count) empty += count == 0;
  if (empty >= 3 || sum(state.market.data(), 7) < 5)
    finish(state);
  else
    state.current = 1 - state.current;
}

double herd_value(int camels) {
  return std::min(camels, 4) * 1.25 +
         std::min(std::max(camels - 4, 0), 3) * .3;
}

State determinize(const Observation& observation, Rng& rng) {
  std::vector<int> unknown_goods;
  std::array<int, 7> market_counts{};
  for (int card : observation.market) ++market_counts[card];
  for (int good = 0; good < GOODS; ++good) {
    const int known = observation.hand[good] + market_counts[good] +
                      observation.discarded[good] + observation.known[good];
    for (int i = known; i < CARD_COUNTS[good]; ++i)
      unknown_goods.push_back(good);
  }
  shuffle(unknown_goods, rng);
  State state;
  state.players[0].hand = observation.hand;
  state.players[0].hand_count = observation.hand_count;
  state.players[0].camels = observation.camels;
  state.players[0].goods = observation.goods_sum;
  state.players[0].goods_count = observation.goods_count;
  state.players[0].bonuses =
      std::accumulate(observation.bonuses.begin(), observation.bonuses.end(), 0);
  state.players[0].bonus_count = observation.bonuses.size();
  state.players[1].hand = observation.known;
  int known_count = sum(observation.known.data(), GOODS);
  const int unknown_opponent = observation.opponent_hand_count - known_count;
  int cursor = 0;
  for (; cursor < unknown_opponent; ++cursor)
    ++state.players[1].hand[unknown_goods[cursor]];
  state.players[1].hand_count = observation.opponent_hand_count;
  state.players[1].goods = observation.opponent_goods_sum;
  state.players[1].goods_count = observation.opponent_goods_count;
  state.market = market_counts;
  const int unknown_camels =
      CARD_COUNTS[CAMEL] - observation.camels - market_counts[CAMEL];
  const int total_unknown = unknown_goods.size() + known_count + unknown_camels;
  state.players[1].camels = std::max(
      0, total_unknown - observation.opponent_hand_count - observation.deck_count);
  std::vector<int> deck(unknown_goods.begin() + cursor, unknown_goods.end());
  for (int i = state.players[1].camels; i < unknown_camels; ++i)
    deck.push_back(CAMEL);
  shuffle(deck, rng);
  state.deck_count = deck.size();
  std::copy(deck.begin(), deck.end(), state.deck.begin());
  state.tokens = observation.tokens;
  state.token_count = observation.token_count;
  state.discarded = observation.discarded;

  std::array<std::vector<int>, 3> own_by_tier;
  for (int value : observation.bonuses)
    own_by_tier[value <= 3 ? 0 : (value <= 6 ? 1 : 2)].push_back(value);
  for (int tier = 0; tier < 3; ++tier) {
    std::vector<int> candidates(BONUS_VALUES[tier].begin(),
                                BONUS_VALUES[tier].begin() + BONUS_TOTALS[tier]);
    for (int value : own_by_tier[tier]) {
      auto found = std::find(candidates.begin(), candidates.end(), value);
      if (found != candidates.end()) candidates.erase(found);
    }
    shuffle(candidates, rng);
    const int opponent_count =
        BONUS_TOTALS[tier] - observation.bonus_count[tier] -
        static_cast<int>(own_by_tier[tier].size());
    for (int i = 0; i < opponent_count; ++i) {
      state.players[1].bonuses += candidates[i];
      ++state.players[1].bonus_count;
    }
    state.bonus_count[tier] = candidates.size() - opponent_count;
    for (int i = 0; i < state.bonus_count[tier]; ++i)
      state.bonus[tier][i] = candidates[opponent_count + i];
  }
  return state;
}

uint32_t hash_input(const int32_t* input, int length) {
  uint32_t hash = 2166136261u;
  for (int i = 0; i < length; ++i) {
    uint32_t value = static_cast<uint32_t>(input[i]);
    for (int byte = 0; byte < 4; ++byte) {
      hash ^= value & 255u;
      hash *= 16777619u;
      value >>= 8;
    }
  }
  return hash ? hash : 1;
}

bool parse_observation(const int32_t* input, int length, Observation& out) {
  int cursor = 0;
  auto read = [&]() { return cursor < length ? input[cursor++] : -999999; };
  if (read() != 0x4a4149 || read() != 1) return false;
  for (int& count : out.hand) count = read();
  out.hand_count = sum(out.hand.data(), GOODS);
  out.camels = read();
  out.goods_count = read();
  out.goods_sum = read();
  const int bonus_length = read();
  if (bonus_length < 0 || bonus_length > 18) return false;
  for (int i = 0; i < bonus_length; ++i) out.bonuses.push_back(read());
  out.opponent_goods_count = read();
  out.opponent_goods_sum = read();
  for (int& count : out.known) count = read();
  for (int& card : out.market) card = read();
  for (int good = 0; good < GOODS; ++good) {
    out.token_count[good] = read();
    if (out.token_count[good] < 0 || out.token_count[good] > 9) return false;
    for (int i = 0; i < out.token_count[good]; ++i)
      out.tokens[good][i] = read();
  }
  for (int& count : out.bonus_count) count = read();
  for (int& count : out.discarded) count = read();
  out.deck_count = read();
  out.opponent_hand_count = read();
  out.turn = read();
  return cursor == length;
}

double observation_potential(const Observation& observation,
                             const std::array<int, GOODS>& hand,
                             int hand_count) {
  double value = 0;
  for (int good = 0; good < GOODS; ++good) {
    const int count = hand[good];
    if (!count) continue;
    const int tier = tier_for(count);
    const int bonus = count >= 3 && observation.bonus_count[tier]
                          ? (tier == 0 ? 2 : (tier == 1 ? 5 : 9))
                          : 0;
    const int remaining =
        CARD_COUNTS[good] - observation.discarded[good] - count;
    int token_value = 0;
    for (int i = 0; i < std::min(count, observation.token_count[good]); ++i)
      token_value += observation.tokens[good][i];
    const bool singleton = good < 3 && count == 1;
    value += (token_value + bonus) * .72 *
             (singleton ? (remaining ? .6 : 0) : 1);
    if (count == 2 && good >= 3 && remaining) value += .8;
    if (count == 4 && remaining) value += .8;
  }
  return value - std::max(0, hand_count - 5) * .35;
}

void enumerate_payments(const Observation& observation,
                        const std::array<int, GOODS>& take, int take_total,
                        int good, Action action, std::vector<Action>& out) {
  if (good == GOODS) {
    const int given = sum(action.give.data(), GOODS);
    action.camels = take_total - given;
    if (action.camels < 0 || action.camels > observation.camels ||
        observation.hand_count + action.camels > 7)
      return;
    if (std::find(out.begin(), out.end(), action) == out.end())
      out.push_back(action);
    return;
  }
  if (take[good]) {
    enumerate_payments(observation, take, take_total, good + 1, action, out);
    return;
  }
  for (int count = 0; count <= observation.hand[good]; ++count) {
    action.give[good] = count;
    enumerate_payments(observation, take, take_total, good + 1, action, out);
  }
}

std::vector<Action> observation_actions(const Observation& observation) {
  std::vector<Action> actions;
  std::array<bool, GOODS> seen_take{};
  if (observation.hand_count < 7)
    for (int card : observation.market)
      if (card != CAMEL && !seen_take[card]) {
        seen_take[card] = true;
        Action action;
        action.kind = ActionKind::Take;
        action.good = card;
        actions.push_back(action);
      }
  if (std::find(observation.market.begin(), observation.market.end(), CAMEL) !=
      observation.market.end()) {
    Action action;
    action.kind = ActionKind::Camels;
    actions.push_back(action);
  }
  for (int good = 0; good < GOODS; ++good)
    for (int count = good < 3 ? 2 : 1; count <= observation.hand[good]; ++count) {
      Action action;
      action.kind = ActionKind::Sell;
      action.good = good;
      action.count = count;
      actions.push_back(action);
    }
  for (int mask = 1; mask < 1 << 5; ++mask) {
    Action action;
    action.kind = ActionKind::Exchange;
    bool includes_camel = false;
    int take_total = 0;
    for (int index = 0; index < 5; ++index)
      if (mask & (1 << index)) {
        const int card = observation.market[index];
        includes_camel |= card == CAMEL;
        if (card != CAMEL) ++action.take[card];
        ++take_total;
      }
    if (includes_camel || take_total < 2) continue;
    enumerate_payments(observation, action.take, take_total, 0, action, actions);
  }
  return actions;
}

#include "mcts.hpp"

Action choose_original_hard(const Observation& observation) {
  const auto actions = observation_actions(observation);
  const double before = observation_potential(
      observation, observation.hand, observation.hand_count);
  Rng rng{static_cast<uint32_t>(observation.turn * 7837 +
                                observation.hand_count * 919 +
                                observation.deck_count * 1723)};
  Action best = actions.front();
  double best_score = -std::numeric_limits<double>::infinity();
  for (const Action& action : actions) {
    auto hand = observation.hand;
    int hand_count = observation.hand_count;
    int camels = observation.camels;
    double reward = 0, risk = 0;
    if (action.kind == ActionKind::Take) {
      ++hand[action.good];
      ++hand_count;
    } else if (action.kind == ActionKind::Camels) {
      int amount = 0;
      for (int card : observation.market) amount += card == CAMEL;
      camels += amount;
      risk = amount * (observation.opponent_hand_count < 6 ? .6 : .15);
    } else if (action.kind == ActionKind::Exchange) {
      for (int good = 0; good < GOODS; ++good) {
        hand[good] += action.take[good] - action.give[good];
        hand_count += action.take[good] - action.give[good];
        const int token = observation.token_count[good]
                              ? observation.tokens[good][0]
                              : 0;
        risk += action.give[good] * token * .2;
      }
      camels -= action.camels;
    } else {
      hand[action.good] -= action.count;
      hand_count -= action.count;
      for (int i = 0;
           i < std::min(action.count, observation.token_count[action.good]); ++i)
        reward += observation.tokens[action.good][i];
      if (action.count >= 3 && observation.bonus_count[tier_for(action.count)])
        reward += action.count == 3 ? 2 : (action.count == 4 ? 5 : 9);
      int empty = 0;
      for (int count : observation.token_count) empty += count == 0;
      if (action.count >= observation.token_count[action.good] && empty == 2)
        reward -= observation_potential(observation, hand, hand_count) * .6;
    }
    double score = reward +
                   observation_potential(observation, hand, hand_count) - before +
                   herd_value(camels) - herd_value(observation.camels) - risk;
    if (action.kind == ActionKind::Sell && observation.deck_count < 8)
      score += reward * .25;
    if (action.kind == ActionKind::Take && action.good < 3) score += .45;
    if (action.kind == ActionKind::Exchange) score -= .15;
    if (action.kind == ActionKind::Camels && observation.deck_count < 7)
      score += std::min(camels, 6) * .16;
    score += (rng.next() / 4294967296.0) * .12;
    if (score > best_score) {
      best_score = score;
      best = action;
    }
  }
  return best;
}

void encode_action(const Action& action, int32_t* output) {
  std::fill(output, output + 16, 0);
  if (action.kind == ActionKind::Take) {
    output[0] = 0;
    output[1] = action.good;
  } else if (action.kind == ActionKind::Camels) {
    output[0] = 1;
  } else if (action.kind == ActionKind::Sell) {
    output[0] = 2;
    output[1] = action.good;
    output[2] = action.count;
  } else {
    output[0] = 3;
    output[1] = action.camels;
    for (int good = 0; good < GOODS; ++good) {
      output[2 + good] = action.take[good];
      output[8 + good] = action.give[good];
    }
  }
}

}  // namespace jaipur

extern "C" int jaipur_choose(const int32_t* input, int length, int32_t* output,
                             int iterations) {
  jaipur::Observation observation;
  if (!input || !output || !jaipur::parse_observation(input, length, observation))
    return 0;
  iterations = std::clamp(iterations, 100, 100000);
  const auto decision = jaipur::choose(
      observation, jaipur::hash_input(input, length), iterations);
  jaipur::encode_action(decision.action, output);
  output[16] = 0x4d435453;
  output[17] = jaipur::TREES;
  output[18] = iterations;
  output[19] = jaipur::TREES * iterations;
  output[20] = decision.root_families;
  output[21] = static_cast<int32_t>(
      std::round(std::clamp(decision.selected_support, 0.0, 1.0) * 10000));
  output[22] = decision.exchange_actions;
  output[23] = decision.stats.max_depth;
  output[24] = decision.stats.terminal;
  output[25] = decision.stats.truncated;
  output[26] = static_cast<int32_t>(decision.stats.rollout_turns);
  return 1;
}

extern "C" int jaipur_choose_original(const int32_t* input, int length,
                                      int32_t* output) {
  jaipur::Observation observation;
  if (!input || !output || !jaipur::parse_observation(input, length, observation))
    return 0;
  jaipur::encode_action(jaipur::choose_original_hard(observation), output);
  return 1;
}

#ifdef JAIPUR_CLI
int main(int argc, char** argv) {
  int length = 0;
  if (!(std::cin >> length) || length <= 0) return 2;
  std::vector<int32_t> input(length);
  for (int32_t& value : input) std::cin >> value;
  std::array<int32_t, 27> output{};
  const int iterations = argc > 1 ? std::stoi(argv[1]) : 1000;
  if (!jaipur_choose(input.data(), length, output.data(), iterations)) return 3;
  for (int value : output) std::cout << value << ' ';
  std::cout << '\n';
}
#endif
