// Included inside namespace jaipur, after the shared rules and observation code.
// Search edges are complete turns. A self-play model supplies a decaying prior
// and rollout policy; backed-up values are always actual terminal outcomes.
struct SearchStats {
  int terminal = 0;
  int truncated = 0;
  int max_depth = 0;
  long long rollout_turns = 0;
};

void atomic_payments(const State& state, int good, int left, Action& action,
                     std::vector<Action>& out) {
  const auto& player = state.players[state.current];
  if (good == GOODS) {
    if (left <= player.camels && player.hand_count + left <= 7) {
      action.camels = left;
      out.push_back(action);
    }
    return;
  }
  const int limit = action.take[good] ? 0 : std::min(left, player.hand[good]);
  for (int count = 0; count <= limit; ++count) {
    action.give[good] = count;
    atomic_payments(state, good + 1, left - count, action, out);
  }
}

void atomic_takes(const State& state, int good, int total, Action& action,
                  std::vector<Action>& out) {
  if (good == GOODS) {
    if (total >= 2) atomic_payments(state, 0, total, action, out);
    return;
  }
  for (int count = 0; count <= state.market[good]; ++count) {
    action.take[good] = count;
    atomic_takes(state, good + 1, total + count, action, out);
  }
}

std::vector<Action> atomic_actions(const State& state) {
  std::vector<Action> out;
  if (state.terminal) return out;
  const auto& player = state.players[state.current];
  for (int good = 0; good < GOODS; ++good) {
    if (player.hand_count < 7 && state.market[good]) {
      Action action;
      action.kind = ActionKind::Take;
      action.good = good;
      out.push_back(action);
    }
    for (int count = good < 3 ? 2 : 1; count <= player.hand[good]; ++count) {
      Action action;
      action.kind = ActionKind::Sell;
      action.good = good;
      action.count = count;
      out.push_back(action);
    }
  }
  if (state.market[CAMEL]) {
    Action action;
    action.kind = ActionKind::Camels;
    out.push_back(action);
  }
  Action exchange;
  exchange.kind = ActionKind::Exchange;
  atomic_takes(state, 0, 0, exchange, out);
  return out;
}

// Random rollout policy: choose an available action category, then a legal move.
// Exchange proposals use card subsets and rejection sampling; no price, set-size
// or hand-potential preferences. All legal moves retain nonzero probability.
Action rollout_action(const State& state, Rng& rng) {
  const auto& player = state.players[state.current];
  std::array<std::array<Action, 7>, 3> categories{};
  std::array<int, 3> category_sizes{};
  std::array<int, 5> market_cards{};
  std::array<int, 7> hand_cards{};
  int market_size = 0, hand_size = 0;
  for (int good = 0; good < GOODS; ++good) {
    for (int i = 0; i < state.market[good]; ++i) market_cards[market_size++] = good;
    for (int i = 0; i < player.hand[good]; ++i) hand_cards[hand_size++] = good;
    if (player.hand_count < 7 && state.market[good]) {
      Action a;
      a.kind = ActionKind::Take;
      a.good = good;
      categories[0][category_sizes[0]++] = a;
    }
    for (int count = good < 3 ? 2 : 1; count <= player.hand[good]; ++count) {
      Action a;
      a.kind = ActionKind::Sell;
      a.good = good;
      a.count = count;
      categories[1][category_sizes[1]++] = a;
    }
  }
  if (state.market[CAMEL]) {
    Action a;
    a.kind = ActionKind::Camels;
    categories[2][category_sizes[2]++] = a;
  }
  std::array<int, 4> kinds{};
  int kind_count = 0;
  for (int i = 0; i < 3; ++i)
    if (category_sizes[i]) kinds[kind_count++] = i;
  if (market_size >= 2 && hand_size + player.camels >= 2) kinds[kind_count++] = 3;
  int kind = kinds[rng.index(kind_count)];
  if (kind == 3) {
    for (int attempt = 0; attempt < 24; ++attempt) {
      Action a;
      a.kind = ActionKind::Exchange;
      int take_total = 0, give_total = 0;
      const int take_mask = 1 + rng.index((1 << market_size) - 1);
      const int give_mask = rng.index(1 << hand_size);
      for (int i = 0; i < market_size; ++i)
        if (take_mask & (1 << i)) { ++a.take[market_cards[i]]; ++take_total; }
      if (take_total < 2) continue;
      for (int i = 0; i < hand_size; ++i)
        if (give_mask & (1 << i)) { ++a.give[hand_cards[i]]; ++give_total; }
      a.camels = take_total - give_total;
      if (a.camels < 0 || a.camels > player.camels ||
          hand_size + a.camels > 7) continue;
      bool overlap = false;
      for (int good = 0; good < GOODS; ++good)
        overlap |= a.take[good] && a.give[good];
      if (!overlap) return a;
    }
    --kind_count;
    if (!kind_count) {
      const auto actions = atomic_actions(state);
      return actions[rng.index(actions.size())];
    }
    kind = kinds[rng.index(kind_count)];
  }
  return categories[kind][rng.index(category_sizes[kind])];
}

#include "rollout-policy.hpp"
#include "rollout-weights.hpp"

double rollout(State& state, Rng& rng, SearchStats& stats, bool learned = false) {
  // Exchanges can cycle indefinitely. A cutoff is recorded separately and
  // contributes neutral value, never a fabricated terminal win or hand score.
  for (int turn = 0; turn < 256 && !state.terminal; ++turn) {
    apply_action(state, learned ? policy_action(state, rng, TRAINED_POLICY, 100)
                               : rollout_action(state, rng));
    ++stats.rollout_turns;
  }
  if (state.terminal) {
    ++stats.terminal;
    return state.value;
  }
  ++stats.truncated;
  return 0;
}

struct UctEdge {
  Action action;
  int visits = 0;
  double total = 0;
  int child = -1;
  double prior = 0;
};
struct UctNode {
  int visits = 0;
  bool initialized = false;
  std::vector<UctEdge> edges;
};

struct SearchOptions {
  double exploration = std::sqrt(2.0);
  bool progressive_widening = false;
  int trees = TREES;
  bool learned_rollout = true;
  // Research benchmarks only; zero keeps production decisions reproducible.
  double time_limit_ms = 0;
  bool learned_prior = true;
};

std::vector<UctEdge> terminal_tree(const State& root, int iterations,
                                  Rng& rng, SearchStats& stats,
                                  const SearchOptions& options = {}) {
  const auto started=std::chrono::steady_clock::now();
  std::vector<UctNode> nodes(1);
  nodes.reserve(iterations + 1);
  for (int iteration = 0; iteration < iterations; ++iteration) {
    if(iteration && iteration%16==0 && options.time_limit_ms>0 &&
       std::chrono::duration<double,std::milli>(
         std::chrono::steady_clock::now()-started).count()>=options.time_limit_ms)
      break;
    State state = root;
    int node = 0, depth = 0;
    std::vector<std::pair<int, int>> path;
    while (!state.terminal) {
      if (!nodes[node].initialized) {
        auto actions = atomic_actions(state);
        shuffle(actions, rng);
        for (const auto& a : actions) nodes[node].edges.push_back({a});
        if(options.learned_prior) {
          double min_value=1,max_value=-1;
          for(auto& edge:nodes[node].edges) {
            State next=state;
            apply_action(next,edge.action);
            edge.prior=(state.current==0?1:-1)*policy_value(next,TRAINED_POLICY);
            min_value=std::min(min_value,edge.prior);
            max_value=std::max(max_value,edge.prior);
          }
          double total=0;
          for(auto& edge:nodes[node].edges) {
            edge.prior=std::exp(4*(edge.prior-max_value)/std::max(.05,max_value-min_value));
            total+=edge.prior;
          }
          for(auto& edge:nodes[node].edges) edge.prior/=total;
        }
        nodes[node].initialized = true;
      }
      int selected = -1;
      double best = -std::numeric_limits<double>::infinity();
      const int width = options.progressive_widening
          ? std::min(int(nodes[node].edges.size()),
                     2 + int(std::sqrt(nodes[node].visits + 1.0)))
          : int(nodes[node].edges.size());
      for (int i = 0; i < width; ++i) {
        const auto& edge = nodes[node].edges[i];
        if (!edge.visits && !options.learned_prior) { selected = i; break; }
        const double mean = edge.total / std::max(1,edge.visits);
        const double exploration=options.learned_prior
          ? edge.prior*std::sqrt(nodes[node].visits+1.0)/(1+edge.visits)
          : std::sqrt(std::log(nodes[node].visits+1.0)/edge.visits);
        const double ucb = (state.current == 0 ? mean : -mean) +
            options.exploration * exploration;
        if (ucb > best) { best = ucb; selected = i; }
      }
      if (selected < 0) break;
      const auto action = nodes[node].edges[selected].action;
      const bool untried = nodes[node].edges[selected].visits == 0;
      apply_action(state, action);
      path.push_back({node, selected});
      ++depth;
      if (untried) break;
      int child = nodes[node].edges[selected].child;
      if (child < 0) {
        child = nodes.size();
        nodes.push_back({});
        nodes[node].edges[selected].child = child;
      }
      node = child;
      if (depth >= 128) break;
    }
    stats.max_depth = std::max(stats.max_depth, depth);
    const double value = rollout(state, rng, stats, options.learned_rollout);
    for (const auto& [parent, index] : path) {
      ++nodes[parent].visits;
      auto& edge = nodes[parent].edges[index];
      ++edge.visits;
      edge.total += value;
    }
  }
  return std::move(nodes[0].edges);
}

struct SearchDecision {
  Action action;
  int root_families = 0;
  int exchange_actions = 0;
  double selected_support = 0;
  SearchStats stats;
};

SearchDecision choose(const Observation& observation, uint32_t seed,
                      int iterations, const SearchOptions& options = {}) {
  Rng sampling{seed}, search{seed ^ 0x9e3779b9u};
  struct Vote { Action action; double visits=0, total=0; };
  std::vector<Vote> aggregate;
  SearchStats stats;
  for (int tree = 0; tree < options.trees; ++tree) {
    const State root = determinize(observation, sampling);
    auto per_tree=options;
    per_tree.time_limit_ms=options.time_limit_ms/options.trees;
    const auto edges = terminal_tree(root, iterations, search, stats, per_tree);
    double total_visits=0;
    for(const auto& edge:edges) total_visits+=edge.visits;
    for (const auto& edge : edges) {
      auto found = std::find_if(aggregate.begin(), aggregate.end(),
          [&](const Vote& other) { return other.action == edge.action; });
      if (found == aggregate.end())
        aggregate.push_back({edge.action,edge.visits/total_visits,edge.total/total_visits});
      else { found->visits += edge.visits/total_visits; found->total += edge.total/total_visits; }
    }
  }
  const auto best = std::max_element(aggregate.begin(), aggregate.end(),
      [](const Vote& a, const Vote& b) {
        if (a.visits != b.visits) return a.visits < b.visits;
        return a.total / std::max(1e-12, a.visits) < b.total / std::max(1e-12, b.visits);
      });
  if (best == aggregate.end()) return {};
  int exchanges = 0;
  for (const auto& edge : aggregate) exchanges += edge.action.kind == ActionKind::Exchange;
  return {best->action, int(aggregate.size()), exchanges,
          best->visits / options.trees, stats};
}
