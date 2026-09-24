// Included inside namespace jaipur, after the shared rules and observation code.
// Search edges are complete turns. A self-play model supplies a decaying prior
// and rollout policy; backed-up values are always actual terminal outcomes.
struct SearchStats {
  long long simulations = 0;
  int terminal = 0;
  int truncated = 0;
  int max_depth = 0;
  long long rollout_turns = 0;
  int tactical_finishes = 0;
};

// Exact only within the current sampled world. This is not a public-information
// win certificate: hidden bonus values and hands still vary between worlds.
bool finish_winning_sale(State& state) {
  if (state.terminal || std::count(state.token_count.begin(), state.token_count.end(), 0) < 2)
    return false;
  const int actor = state.current;
  for (int good=0; good<GOODS; ++good) {
    if (!state.token_count[good]) continue;
    const int first=std::max(good<3?2:1, state.token_count[good]);
    for (int count=first; count<=state.players[actor].hand[good]; ++count) {
      Action action; action.kind=ActionKind::Sell; action.good=good; action.count=count;
      State end=state; apply_action(end,action);
      if (end.terminal && (actor==0?end.value:-end.value)>0) {
        state=end;
        return true;
      }
    }
  }
  return false;
}

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
#include "neural-policy.hpp"
#include "belief-policy.hpp"
#include "rollout-weights.hpp"

struct RolloutResult {
  double outcome = 0;
  double margin = 0;
};

RolloutResult rollout(State& state, Rng& rng, SearchStats& stats,
                      bool learned = false, bool neural = false,
                      const std::chrono::steady_clock::time_point* deadline = nullptr,
                      bool terminal_tactics = false) {
  // Exchanges can cycle indefinitely. A cutoff is recorded separately and
  // contributes neutral value, never a fabricated terminal win or hand score.
  for (int turn = 0; turn < 256 && !state.terminal; ++turn) {
    if (deadline && std::chrono::steady_clock::now() >= *deadline) break;
    if (terminal_tactics && finish_winning_sale(state)) {
      ++stats.tactical_finishes;
      break;
    }
    const auto action = neural ? neural_action(state, rng, 100, deadline) :
                        learned ? policy_action(state, rng, TRAINED_POLICY, 100, deadline)
                                : rollout_action(state, rng);
    if (deadline && std::chrono::steady_clock::now() >= *deadline) break;
    apply_action(state, action);
    ++stats.rollout_turns;
  }
  if (state.terminal) {
    ++stats.terminal;
    return {state.value, state.score_margin};
  }
  ++stats.truncated;
  return {};
}

struct UctEdge {
  Action action;
  int visits = 0;
  double total = 0;
  double margin_total = 0;
  int child = -1;
  double prior = 0;
  int family = -1;
};
// Action factorization inspired by DeltaDou's main move / kicker split.
// Jaipur exchanges share a goal (goods taken) and differ in payment. Sales
// share a good and differ in quantity. Every concrete legal action is retained.
bool same_action_family(const Action& a, const Action& b) {
  if (a.kind != b.kind) return false;
  if (a.kind == ActionKind::Exchange) return a.take == b.take;
  if (a.kind == ActionKind::Camels) return true;
  return a.good == b.good;
}
struct ActionFamily {
  std::vector<int> members;
  int visits = 0;
  double total = 0, prior = 0, member_prior_sum = 0;
};
struct UctNode {
  int visits = 0;
  bool initialized = false;
  std::vector<UctEdge> edges;
  std::vector<ActionFamily> families;
};

void initialize_families(UctNode& node) {
  for (int i=0; i<int(node.edges.size()); ++i) {
    auto& edge=node.edges[i];
    int f=0;
    for (; f<int(node.families.size()); ++f)
      if (same_action_family(edge.action, node.edges[node.families[f].members[0]].action)) break;
    if (f==int(node.families.size())) node.families.push_back({});
    edge.family=f;
    auto& family=node.families[f];
    family.members.push_back(i);
    // A goal does not gain exploration mass just by having more payment variants.
    family.prior=std::max(family.prior, edge.prior);
    family.member_prior_sum+=edge.prior;
  }
  double total=0;
  for (auto& family:node.families) {
    total+=family.prior;
    std::stable_sort(family.members.begin(),family.members.end(),[&](int a,int b) {
      return node.edges[a].prior > node.edges[b].prior;
    });
  }
  for (auto& family:node.families)
    family.prior=total>0?family.prior/total:1.0/node.families.size();
}

int family_width(const UctNode& node, const ActionFamily& family) {
  if (node.edges[family.members[0]].action.kind!=ActionKind::Exchange)
    return family.members.size(); // Never hide a sale quantity or immediate end.
  return std::min(int(family.members.size()),1+int(std::sqrt(family.visits)));
}

int select_family_edge(const UctNode& node, int actor, double exploration) {
  int selected_family=-1;
  double best=-std::numeric_limits<double>::infinity();
  const double sign=actor==0?1:-1;
  for (int f=0; f<int(node.families.size()); ++f) {
    const auto& family=node.families[f];
    const double score=sign*family.total/std::max(1,family.visits) +
        exploration*family.prior*std::sqrt(node.visits+1.0)/(family.visits+1);
    if(score>best) {best=score;selected_family=f;}
  }
  if(selected_family<0) return -1;
  const auto& family=node.families[selected_family];
  best=-std::numeric_limits<double>::infinity();
  int selected=-1;
  for(int j=0;j<family_width(node,family);++j) {
    const int i=family.members[j];
    const auto& edge=node.edges[i];
    const double prior=family.member_prior_sum>0?edge.prior/family.member_prior_sum:1.0/family.members.size();
    const double score=sign*edge.total/std::max(1,edge.visits) +
        exploration*prior*std::sqrt(family.visits+1.0)/(edge.visits+1);
    if(score>best) {best=score;selected=i;}
  }
  return selected;
}

struct SearchOptions {
  double exploration = std::sqrt(2.0);
  bool progressive_widening = false;
  int trees = TREES;
  bool learned_rollout = true;
  // Research benchmarks only; zero keeps production decisions reproducible.
  double time_limit_ms = 0;
  bool learned_prior = true;
  bool neural_prior = false;
  bool neural_rollout = false;
  bool neural_root_only = false;
  bool stratified_hands = false;
  double close_risk_weight = 0;
  bool belief_prior = false;
  bool record_root_policy = false;
  bool terminal_tactics = false;
  bool record_root_stats = false;
  bool factor_actions = false;
  const std::vector<std::pair<Action, double>>* root_policy = nullptr;
  double root_policy_mix = .5;
};

std::vector<UctEdge> terminal_tree(const State& root, int iterations,
                                  Rng& rng, SearchStats& stats,
                                  const SearchOptions& options = {}) {
  const auto started=std::chrono::steady_clock::now();
  const auto deadline = started + std::chrono::duration_cast<std::chrono::steady_clock::duration>(
      std::chrono::duration<double, std::milli>(options.time_limit_ms));
  const auto* bounded = options.time_limit_ms > 0 ? &deadline : nullptr;
  std::vector<UctNode> nodes(1);
  nodes.reserve(std::min(iterations, 8192) + 1);
  for (int iteration = 0; iteration < iterations; ++iteration) {
    if(iteration && options.time_limit_ms>0 &&
       std::chrono::duration<double,std::milli>(
         std::chrono::steady_clock::now()-started).count()>=options.time_limit_ms)
      break;
    State state = root;
    ++stats.simulations;
    int node = 0, depth = 0;
    std::vector<std::pair<int, int>> path;
    while (!state.terminal) {
      if (!nodes[node].initialized) {
        auto actions = atomic_actions(state);
        shuffle(actions, rng);
        for (const auto& a : actions) nodes[node].edges.push_back({a});
        const bool use_neural_prior = options.neural_prior &&
            (!options.neural_root_only || node == 0);
        if(options.learned_prior || use_neural_prior) {
          double min_value=1,max_value=-1;
          for(auto& edge:nodes[node].edges) {
            State next=state;
            apply_action(next,edge.action);
            edge.prior=(state.current==0?1:-1)*
                (use_neural_prior ? neural_value(next) : policy_value(next,TRAINED_POLICY));
            min_value=std::min(min_value,edge.prior);
            max_value=std::max(max_value,edge.prior);
          }
          double total=0;
          for(auto& edge:nodes[node].edges) {
            edge.prior=std::exp(4 * (edge.prior-max_value)/
                                std::max(.05,max_value-min_value));
            total+=edge.prior;
          }
          for(auto& edge:nodes[node].edges) edge.prior/=total;
        }
        nodes[node].initialized = true;
        if (node == 0 && options.root_policy) {
          for (auto& edge : nodes[node].edges)
            for (const auto& item : *options.root_policy)
              if (item.first == edge.action) {
                edge.prior = (1-options.root_policy_mix) * edge.prior + options.root_policy_mix * item.second;
                break;
              }
        }
        if (options.factor_actions) initialize_families(nodes[node]);
      }
      int selected = -1;
      double best = -std::numeric_limits<double>::infinity();
      const int width = options.progressive_widening
          ? std::min(int(nodes[node].edges.size()),
                     2 + int(std::sqrt(nodes[node].visits + 1.0)))
          : int(nodes[node].edges.size());
      for (int i = 0; !options.factor_actions && i < width; ++i) {
        const auto& edge = nodes[node].edges[i];
        if (!edge.visits && !options.learned_prior && !options.neural_prior) {
          selected = i; break;
        }
        const double mean = edge.total / std::max(1,edge.visits);
        const double exploration=(options.learned_prior || options.neural_prior)
          ? edge.prior*std::sqrt(nodes[node].visits+1.0)/(1+edge.visits)
          : std::sqrt(std::log(nodes[node].visits+1.0)/edge.visits);
        const double ucb = (state.current == 0 ? mean : -mean) +
            options.exploration * exploration;
        if (ucb > best) { best = ucb; selected = i; }
      }
      if (options.factor_actions)
        selected=select_family_edge(nodes[node],state.current,options.exploration);
      if (selected < 0) break;
      const auto action = nodes[node].edges[selected].action;
      const bool untried = nodes[node].edges[selected].visits == 0;
      apply_action(state, action);
      path.push_back({node, selected});
      ++depth;
      // A winning reply proves this edge loses in this world; spending visits
      // to rediscover it or randomly declining it in rollout biases the edge.
      if (options.terminal_tactics && finish_winning_sale(state)) {
        ++stats.tactical_finishes;
        break;
      }
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
    const auto result = rollout(state, rng, stats, options.learned_rollout,
                                options.neural_rollout, bounded, options.terminal_tactics);
    for (const auto& [parent, index] : path) {
      ++nodes[parent].visits;
      auto& edge = nodes[parent].edges[index];
      ++edge.visits;
      edge.total += result.outcome;
      edge.margin_total += result.margin;
      if (options.factor_actions) {
        auto& family=nodes[parent].families[edge.family];
        ++family.visits;
        family.total+=result.outcome;
      }
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
  std::vector<std::pair<Action, double>> root_policy;
  // Per-tree-normalized visit mass and conditional mean, for diagnosis only.
  std::vector<std::pair<Action, std::array<double, 2>>> root_stats;
};

SearchDecision choose(const Observation& observation, uint32_t seed,
                      int iterations, const SearchOptions& options = {}) {
  const auto decision_started = std::chrono::steady_clock::now();
  Rng sampling{seed}, search{seed ^ 0x9e3779b9u};
  struct Vote { Action action; double visits=0, total=0, margin_total=0, close_loss=0; };
  std::vector<Vote> aggregate;
  SearchStats stats;
  std::vector<std::pair<Action, double>> root_policy;
#ifdef JAIPUR_BELIEF_WEIGHTS_HEADER
  if (options.belief_prior && !observation.hand_worlds.empty()) {
    Rng legal_rng{seed};
    const auto actions = atomic_actions(determinize(observation, legal_rng));
    const auto features = belief_features(observation);
    double maximum = -std::numeric_limits<double>::infinity();
    for (const auto& action : actions) {
      const double logit = belief_policy_logit(features, action);
      root_policy.push_back({action, logit});
      maximum = std::max(maximum, logit);
    }
    double total = 0;
    for (auto& item : root_policy) total += item.second = std::exp(item.second - maximum);
    for (auto& item : root_policy) item.second /= total;
  }
#endif
  const double preparation_ms = std::chrono::duration<double, std::milli>(
      std::chrono::steady_clock::now() - decision_started).count();
  Rng strata{seed ^ 0x85ebca6bu};
  const double offset = double(strata.next()) / 4294967296.0;
  for (int tree = 0; tree < options.trees; ++tree) {
    const double quantile = options.stratified_hands &&
                            !observation.hand_worlds.empty()
        ? (tree + offset) / options.trees : -1;
    const State root = determinize(observation, sampling, quantile);
    auto per_tree=options;
    if (!root_policy.empty()) per_tree.root_policy = &root_policy;
    per_tree.time_limit_ms=options.time_limit_ms > 0
        ? std::max(.01, options.time_limit_ms - preparation_ms) / options.trees : 0;
    const auto edges = terminal_tree(root, iterations, search, stats, per_tree);
    double total_visits=0;
    for(const auto& edge:edges) total_visits+=edge.visits;
    for (const auto& edge : edges) {
      auto found = std::find_if(aggregate.begin(), aggregate.end(),
          [&](const Vote& other) { return other.action == edge.action; });
      if (found == aggregate.end())
        aggregate.push_back({edge.action,edge.visits/total_visits,
                             edge.total/total_visits,
                             edge.margin_total/total_visits});
      else {
        found->visits += edge.visits/total_visits;
        found->total += edge.total/total_visits;
        found->margin_total += edge.margin_total/total_visits;
      }
    }
  }
  if (options.close_risk_weight > 0 && !aggregate.empty() &&
      !observation.hand_worlds.empty() &&
      std::count(observation.token_count.begin(),
                 observation.token_count.end(), 0) >= 2) {
    constexpr int risk_samples = 32;
    Rng risk_rng{seed ^ 0xc2b2ae35u};
    for (int sample = 0; sample < risk_samples; ++sample) {
      State world = determinize(observation, risk_rng,
                                (sample + .5) / risk_samples);
      for (auto& vote : aggregate) {
        State after = world;
        apply_action(after, vote.action);
        if (after.terminal) continue;
        double worst = 0;
        for (int good = 0; good < GOODS; ++good) {
          const int first = std::max(good < 3 ? 2 : 1,
                                     after.token_count[good]);
          for (int count = first; count <= after.players[after.current].hand[good]; ++count) {
            Action reply;
            reply.kind = ActionKind::Sell;
            reply.good = good;
            reply.count = count;
            State ended = after;
            apply_action(ended, reply);
            if (ended.terminal)
              worst = std::max(worst, (1.0 - ended.value) / 2.0);
          }
        }
        vote.close_loss += worst / risk_samples;
      }
    }
  }
  // Pure win/loss search cannot rank moves once every sampled continuation
  // loses. In that case alone, prefer the smaller final point deficit.
  const bool all_lost = !aggregate.empty() && std::all_of(
      aggregate.begin(), aggregate.end(), [](const Vote& vote) {
        return vote.visits > 0 &&
               std::abs(vote.total + vote.visits) < 1e-9;
      });
  const auto best = std::max_element(aggregate.begin(), aggregate.end(),
      [all_lost, &options](const Vote& a, const Vote& b) {
        if (all_lost) {
          const double a_margin = a.margin_total / a.visits;
          const double b_margin = b.margin_total / b.visits;
          if (a_margin != b_margin) return a_margin < b_margin;
        }
        const double a_score = a.visits / options.trees -
            options.close_risk_weight * a.close_loss;
        const double b_score = b.visits / options.trees -
            options.close_risk_weight * b.close_loss;
        if (a_score != b_score) return a_score < b_score;
        return a.total / std::max(1e-12, a.visits) <
               b.total / std::max(1e-12, b.visits);
      });
  if (best == aggregate.end()) return {};
  int exchanges = 0;
  for (const auto& edge : aggregate) exchanges += edge.action.kind == ActionKind::Exchange;
  std::vector<std::pair<Action, double>> targets;
  if (options.record_root_policy)
    for (const auto& vote : aggregate)
      targets.push_back({vote.action, vote.visits / options.trees});
  SearchDecision result{best->action, int(aggregate.size()), exchanges,
          best->visits / options.trees, stats, std::move(targets)};
  if (options.record_root_stats)
    for (const auto& vote : aggregate)
      result.root_stats.push_back({vote.action, {vote.visits/options.trees,
          vote.visits>0?vote.total/vote.visits:0}});
  return result;
}
