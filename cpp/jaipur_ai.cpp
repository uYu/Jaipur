#include <algorithm>
#include <array>
#include <cmath>
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

enum class StepKind : uint8_t {
  Play,
  StartExchange,
  TakeExchange,
  FinishTake,
  GiveExchange,
  GiveCamel,
  CommitExchange,
};
struct Step {
  StepKind kind = StepKind::Play;
  Action action{};
  int good = 0;
  bool operator==(const Step& other) const {
    return kind == other.kind && good == other.good && action == other.action;
  }
};

struct Draft {
  bool active = false;
  bool paying = false;
  std::array<int, GOODS> take{};
  std::array<int, GOODS> give{};
  int take_total = 0;
  int pay_total = 0;
  int camels = 0;
};
struct Position {
  State game;
  Draft draft;
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
  state.value = outcome + std::tanh((score_a - score_b) / 18.0) * .15;
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

int exchange_capacity(const State& state,
                      const std::array<int, GOODS>& take) {
  const Player& player = state.players[state.current];
  int capacity = std::min(player.camels, 7 - player.hand_count);
  for (int good = 0; good < GOODS; ++good)
    if (!take[good]) capacity += player.hand[good];
  return capacity;
}

std::vector<Step> available_steps(const Position& position) {
  const State& state = position.game;
  if (state.terminal) return {};
  const Player& player = state.players[state.current];
  std::vector<Step> out;
  if (!position.draft.active) {
    if (player.hand_count < 7)
      for (int good = 0; good < GOODS; ++good)
        if (state.market[good]) {
          Action action;
          action.kind = ActionKind::Take;
          action.good = good;
          out.push_back({StepKind::Play, action});
        }
    if (state.market[CAMEL]) {
      Action action;
      action.kind = ActionKind::Camels;
      out.push_back({StepKind::Play, action});
    }
    for (int good = 0; good < GOODS; ++good)
      for (int count = good < 3 ? 2 : 1; count <= player.hand[good]; ++count) {
        Action action;
        action.kind = ActionKind::Sell;
        action.good = good;
        action.count = count;
        out.push_back({StepKind::Play, action});
      }
    const int market_goods = sum(state.market.data(), GOODS);
    std::array<int, GOODS> none{};
    if (market_goods >= 2 && exchange_capacity(state, none) >= 2)
      out.push_back({StepKind::StartExchange});
    return out;
  }
  const Draft& draft = position.draft;
  if (!draft.paying) {
    if (draft.take_total >= 2 &&
        exchange_capacity(state, draft.take) >= draft.take_total)
      out.push_back({StepKind::FinishTake});
    for (int good = 0; good < GOODS; ++good)
      if (draft.take[good] < state.market[good])
        out.push_back({StepKind::TakeExchange, {}, good});
    return out;
  }
  if (draft.pay_total == draft.take_total)
    return {{StepKind::CommitExchange}};
  for (int good = 0; good < GOODS; ++good)
    if (!draft.take[good] && draft.give[good] < player.hand[good])
      out.push_back({StepKind::GiveExchange, {}, good});
  if (draft.camels < player.camels &&
      player.hand_count + draft.camels < 7)
    out.push_back({StepKind::GiveCamel});
  return out;
}

double herd_value(int camels) {
  return std::min(camels, 4) * 1.25 +
         std::min(std::max(camels - 4, 0), 3) * .3;
}

double potential(const State& state, const Player& player) {
  double value = 0;
  for (int good = 0; good < GOODS; ++good) {
    const int count = player.hand[good];
    if (!count) continue;
    int bonus = 0;
    if (count >= 3) {
      const int tier = tier_for(count);
      if (state.bonus_count[tier])
        bonus = state.bonus[tier][state.bonus_count[tier] - 1];
    }
    const int received = std::min(count, state.token_count[good]);
    int token_value = 0;
    for (int i = 0; i < received; ++i)
      token_value += state.tokens[good][state.token_start[good] + i];
    const int remaining = CARD_COUNTS[good] - state.discarded[good] - count;
    const bool singleton = good < 3 && count == 1;
    value += (token_value + bonus) * .72 *
             (singleton ? (remaining ? .6 : 0) : 1);
    if (count == 2 && good >= 3 && remaining) value += .8;
    if (count == 4 && remaining) value += .8;
  }
  return value - std::max(0, player.hand_count - 5) * .35;
}

double acquire_value(const State& state, int good, int player) {
  const int count = state.players[player].hand[good];
  const int token = state.token_count[good]
                        ? state.tokens[good][state.token_start[good]]
                        : 0;
  return token * .45 + count * 1.15 + (good < 3 ? .6 : 0) +
         (count == 2 || count == 4 ? 1.2 : 0);
}

double exchange_prior(const State& state) {
  const Player& player = state.players[state.current];
  std::vector<double> takes, payments;
  for (int good = 0; good < GOODS; ++good)
    for (int i = 0; i < state.market[good]; ++i)
      takes.push_back(acquire_value(state, good, state.current));
  std::sort(takes.begin(), takes.end(), std::greater<>());
  const int camel_capacity = std::min(player.camels, 7 - player.hand_count);
  for (int i = 0; i < camel_capacity; ++i)
    payments.push_back(herd_value(player.camels - i) -
                       herd_value(player.camels - i - 1));
  for (int good = 0; good < GOODS; ++good)
    for (int i = 0; i < player.hand[good]; ++i)
      payments.push_back(acquire_value(state, good, state.current) * .55);
  std::sort(payments.begin(), payments.end());
  double best = -10;
  const int limit = std::min(takes.size(), payments.size());
  double take_sum = 0, payment_sum = 0;
  for (int amount = 1; amount <= limit; ++amount) {
    take_sum += takes[amount - 1];
    payment_sum += payments[amount - 1];
    if (amount >= 2) best = std::max(best, take_sum - payment_sum);
  }
  return best;
}

double step_prior(const Position& position, const Step& step) {
  const State& state = position.game;
  const Player& player = state.players[state.current];
  if (step.kind == StepKind::Play) {
    const Action& action = step.action;
    const double before = potential(state, player);
    if (action.kind == ActionKind::Take) {
      Player after = player;
      ++after.hand[action.good];
      ++after.hand_count;
      return potential(state, after) - before + (action.good < 3 ? .45 : 0);
    }
    if (action.kind == ActionKind::Camels) {
      const int amount = state.market[CAMEL];
      const double risk = amount *
                          (state.players[1 - state.current].hand_count < 6
                               ? .6
                               : .15);
      return herd_value(player.camels + amount) - herd_value(player.camels) -
             risk;
    }
    Player after = player;
    after.hand[action.good] -= action.count;
    after.hand_count -= action.count;
    int immediate = 0;
    const int received = std::min(action.count, state.token_count[action.good]);
    for (int i = 0; i < received; ++i)
      immediate += state.tokens[action.good][state.token_start[action.good] + i];
    int bonus = 0;
    if (action.count >= 3) {
      const int tier = tier_for(action.count);
      if (state.bonus_count[tier])
        bonus = state.bonus[tier][state.bonus_count[tier] - 1];
    }
    return immediate + bonus + potential(state, after) - before;
  }
  if (step.kind == StepKind::StartExchange) return exchange_prior(state);
  if (step.kind == StepKind::TakeExchange)
    return acquire_value(state, step.good, state.current);
  if (step.kind == StepKind::FinishTake) return 1;
  if (step.kind == StepKind::GiveCamel)
    return -.8 - player.camels * .08;
  if (step.kind == StepKind::GiveExchange)
    return -acquire_value(state, step.good, state.current) * .55;
  return 4;
}

bool apply_step(Position& position, const Step& step, Action& completed) {
  if (step.kind == StepKind::Play) {
    completed = step.action;
    apply_action(position.game, completed);
    return true;
  }
  Draft& draft = position.draft;
  if (step.kind == StepKind::StartExchange) {
    draft = {};
    draft.active = true;
  } else if (step.kind == StepKind::TakeExchange) {
    ++draft.take[step.good];
    ++draft.take_total;
  } else if (step.kind == StepKind::FinishTake) {
    draft.paying = true;
  } else if (step.kind == StepKind::GiveExchange) {
    ++draft.give[step.good];
    ++draft.pay_total;
  } else if (step.kind == StepKind::GiveCamel) {
    ++draft.camels;
    ++draft.pay_total;
  } else {
    completed.kind = ActionKind::Exchange;
    completed.take = draft.take;
    completed.give = draft.give;
    completed.camels = draft.camels;
    draft = {};
    apply_action(position.game, completed);
    return true;
  }
  return false;
}

bool complete_draft(Position& position, Action& completed) {
  for (int safety = 0; position.draft.active && safety < 20; ++safety) {
    auto steps = available_steps(position);
    if (steps.empty()) return false;
    Step selected = steps.front();
    if (!position.draft.paying) {
      auto finish = std::find_if(steps.begin(), steps.end(), [](const Step& s) {
        return s.kind == StepKind::FinishTake;
      });
      if (finish != steps.end() && position.draft.take_total >= 2)
        selected = *finish;
      else
        selected = *std::max_element(
            steps.begin(), steps.end(), [&](const Step& a, const Step& b) {
              return step_prior(position, a) < step_prior(position, b);
            });
    } else if (position.draft.pay_total == position.draft.take_total) {
      selected = {StepKind::CommitExchange};
    } else {
      selected = *std::max_element(
          steps.begin(), steps.end(), [&](const Step& a, const Step& b) {
            return step_prior(position, a) < step_prior(position, b);
          });
    }
    if (apply_step(position, selected, completed)) return true;
  }
  return false;
}

double evaluate(const State& state) {
  if (state.terminal) return state.value;
  const double progress = 1 - state.deck_count / 40.0;
  const int camel = state.players[0].camels == state.players[1].camels
                        ? 0
                        : (state.players[0].camels > state.players[1].camels
                               ? 2 + progress * 3
                               : -2 - progress * 3);
  auto banked = [&](int player) {
    return state.players[player].goods + state.players[player].bonuses;
  };
  int empty = 0;
  for (int count : state.token_count) empty += count == 0;
  const double future_weight = .9 - progress * .25 - empty * .08;
  const double score_a = banked(0) + potential(state, state.players[0]) * future_weight;
  const double score_b = banked(1) + potential(state, state.players[1]) * future_weight;
  const int lead = banked(0) - banked(1);
  const Player& player = state.players[state.current];
  bool can_empty = false;
  for (int good = 0; good < GOODS; ++good)
    can_empty |= state.token_count[good] > 0 &&
                 player.hand[good] >= state.token_count[good] &&
                 player.hand[good] >= (good < 3 ? 2 : 1);
  const bool can_drain = state.deck_count == 0 ||
                         state.market[CAMEL] > state.deck_count;
  const bool ahead = state.current == 0 ? lead > 0 : lead < 0;
  const double end_control = ((empty >= 2 && can_empty) || can_drain) && ahead
                                 ? (lead > 0 ? 2.4 : -2.4)
                                 : 0;
  const double tie =
      (state.players[0].bonus_count - state.players[1].bonus_count) * .12 +
      (state.players[0].goods_count - state.players[1].goods_count) * .04;
  return std::tanh((score_a - score_b + camel + tie + end_control) / 20.0);
}

struct Edge {
  Step step;
  double prior = 0;
  int visits = 0;
  double total = 0;
  int child = 0;
};
struct Node {
  int visits = 0;
  std::vector<Edge> edges;
};
struct ActionStat {
  Action action;
  double visits = 0;
  double total = 0;
};

int find_edge(const Node& node, const Step& step) {
  for (int i = 0; i < static_cast<int>(node.edges.size()); ++i)
    if (node.edges[i].step == step) return i;
  return -1;
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

struct TreeResult {
  Node root;
  std::vector<ActionStat> actions;
};

TreeResult search_tree(const State& root_state, int iterations) {
  std::vector<Node> nodes(1);
  std::vector<ActionStat> root_actions;
  nodes.reserve(iterations / 2);
  for (int iteration = 0; iteration < iterations; ++iteration) {
    Position position{root_state, {}};
    int node_index = 0;
    std::vector<int> visited_nodes{0};
    std::vector<std::pair<int, int>> visited_edges;
    Action first_action;
    bool has_first = false;
    for (int depth = 0; depth < 28 && !position.game.terminal; ++depth) {
      auto steps = available_steps(position);
      if (steps.empty()) break;
      std::vector<std::pair<Step, double>> ranked;
      ranked.reserve(steps.size());
      for (const Step& step : steps)
        ranked.push_back({step, step_prior(position, step)});
      std::sort(ranked.begin(), ranked.end(), [](const auto& a, const auto& b) {
        return a.second > b.second;
      });
      const int width = std::min(
          static_cast<int>(ranked.size()),
          4 + static_cast<int>(std::sqrt(nodes[node_index].visits + 1)));
      int selected = -1;
      bool untried = false;
      for (int i = 0; i < width; ++i) {
        if (find_edge(nodes[node_index], ranked[i].first) < 0) {
          const int child = nodes.size();
          nodes.push_back({});
          nodes[node_index].edges.push_back(
              {ranked[i].first, ranked[i].second, 0, 0, child});
          selected = nodes[node_index].edges.size() - 1;
          untried = true;
          break;
        }
      }
      if (selected < 0) {
        const bool maximizing = position.game.current == 0;
        double best = -std::numeric_limits<double>::infinity();
        for (int i = 0; i < width; ++i) {
          const int edge_index = find_edge(nodes[node_index], ranked[i].first);
          const Edge& edge = nodes[node_index].edges[edge_index];
          const double mean = edge.total / std::max(1, edge.visits);
          const double value = (maximizing ? mean : -mean) +
                               .85 * std::sqrt(std::log(nodes[node_index].visits + 2.0) /
                                               std::max(1, edge.visits)) +
                               edge.prior * .025;
          if (value > best) {
            best = value;
            selected = edge_index;
          }
        }
      }
      const int child = nodes[node_index].edges[selected].child;
      Action completed;
      if (apply_step(position, nodes[node_index].edges[selected].step, completed) &&
          !has_first) {
        first_action = completed;
        has_first = true;
      }
      visited_edges.push_back({node_index, selected});
      node_index = child;
      visited_nodes.push_back(node_index);
      if (untried) break;
    }
    if (position.draft.active) {
      Action completed;
      if (complete_draft(position, completed) && !has_first) {
        first_action = completed;
        has_first = true;
      }
    }
    if (!has_first && !position.game.terminal) {
      auto steps = available_steps(position);
      if (!steps.empty()) {
        auto selected = std::max_element(
            steps.begin(), steps.end(), [&](const Step& a, const Step& b) {
              return step_prior(position, a) < step_prior(position, b);
            });
        has_first = apply_step(position, *selected, first_action);
        if (!has_first && position.draft.active)
          has_first = complete_draft(position, first_action);
      }
    }
    const double value = evaluate(position.game);
    for (int index : visited_nodes) ++nodes[index].visits;
    for (const auto& [parent, edge_index] : visited_edges) {
      Edge& edge = nodes[parent].edges[edge_index];
      ++edge.visits;
      edge.total += value;
    }
    if (has_first) {
      auto found = std::find_if(root_actions.begin(), root_actions.end(),
                                [&](const ActionStat& stat) {
                                  return stat.action == first_action;
                                });
      if (found == root_actions.end()) {
        root_actions.push_back({first_action, 1, value});
      } else {
        ++found->visits;
        found->total += value;
      }
    }
  }
  return {std::move(nodes[0]), std::move(root_actions)};
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

int family_key(const Action& action) {
  if (action.kind == ActionKind::Exchange) return -1;
  if (action.kind == ActionKind::Camels) return 10;
  if (action.kind == ActionKind::Take) return 20 + action.good;
  return 100 + action.good * 10 + action.count;
}

Action choose(const Observation& observation, uint32_t seed, int iterations) {
  struct FamilyStat {
    int key;
    double score;
    Action action;
  };
  std::vector<FamilyStat> families;
  std::vector<ActionStat> exchanges;
  Rng rng{seed};
  for (int tree = 0; tree < TREES; ++tree) {
    State state = determinize(observation, rng);
    TreeResult result = search_tree(state, iterations);
    for (const Edge& edge : result.root.edges) {
      Action action;
      if (edge.step.kind == StepKind::StartExchange)
        action.kind = ActionKind::Exchange;
      else if (edge.step.kind == StepKind::Play)
        action = edge.step.action;
      else
        continue;
      const int key = family_key(action);
      auto family = std::find_if(families.begin(), families.end(),
                                 [&](const FamilyStat& item) {
                                   return item.key == key;
                                 });
      if (family == families.end())
        families.push_back(
            {key, edge.visits / static_cast<double>(iterations), action});
      else
        family->score += edge.visits / static_cast<double>(iterations);
    }
    double exchange_visits = 0;
    for (const auto& stat : result.actions)
      if (stat.action.kind == ActionKind::Exchange)
        exchange_visits += stat.visits;
    if (exchange_visits)
      for (const auto& stat : result.actions) {
        if (stat.action.kind != ActionKind::Exchange) continue;
        auto aggregate = std::find_if(exchanges.begin(), exchanges.end(),
                                      [&](const ActionStat& item) {
                                        return item.action == stat.action;
                                      });
        if (aggregate == exchanges.end())
          exchanges.push_back(
              {stat.action, stat.visits / exchange_visits,
               stat.total / exchange_visits});
        else {
          aggregate->visits += stat.visits / exchange_visits;
          aggregate->total += stat.total / exchange_visits;
        }
      }
  }
  if (families.empty()) return {};
  const auto best_family = std::max_element(
      families.begin(), families.end(),
      [](const FamilyStat& a, const FamilyStat& b) { return a.score < b.score; });
  if (best_family->key != -1) return best_family->action;
  if (exchanges.empty()) {
    Position fallback{determinize(observation, rng), {}};
    Action exchange;
    apply_step(fallback, {StepKind::StartExchange}, exchange);
    if (complete_draft(fallback, exchange)) return exchange;
    auto direct = std::max_element(
        families.begin(), families.end(), [](const FamilyStat& a,
                                             const FamilyStat& b) {
          const double score_a = a.key == -1 ? -1 : a.score;
          const double score_b = b.key == -1 ? -1 : b.score;
          return score_a < score_b;
        });
    return direct->action;
  }
  return std::max_element(
             exchanges.begin(), exchanges.end(), [](const ActionStat& a,
                                                     const ActionStat& b) {
               if (a.visits != b.visits) return a.visits < b.visits;
               return a.total / std::max(1.0, a.visits) <
                      b.total / std::max(1.0, b.visits);
             })
      ->action;
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
  const auto action = jaipur::choose(
      observation, jaipur::hash_input(input, length), iterations);
  jaipur::encode_action(action, output);
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
int main() {
  int length = 0;
  if (!(std::cin >> length) || length <= 0) return 2;
  std::vector<int32_t> input(length);
  for (int32_t& value : input) std::cin >> value;
  std::array<int32_t, 16> output{};
  if (!jaipur_choose(input.data(), length, output.data(), 30000)) return 3;
  for (int value : output) std::cout << value << ' ';
  std::cout << '\n';
}
#endif
