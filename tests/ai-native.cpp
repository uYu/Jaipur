#include <cassert>
#include "../cpp/jaipur_ai.cpp"

using namespace jaipur;

Observation observation_of(const State& s) {
  Observation o;
  const auto& p = s.players[s.current];
  o.hand = p.hand;
  o.hand_count = p.hand_count;
  o.camels = p.camels;
  int index = 0;
  for (int good = 0; good <= GOODS; ++good)
    for (int n = 0; n < s.market[good]; ++n) o.market[index++] = good;
  assert(index == 5);
  return o;
}

void check_actions(const State& s, Rng& rng) {
  const auto features=policy_features(s);
  const double reference_value=std::tanh(std::inner_product(
      features.begin(),features.end(),TRAINED_POLICY.begin(),0.0));
  assert(std::abs(policy_value(s,TRAINED_POLICY)-reference_value)<1e-12);
  State swapped=s;
  std::swap(swapped.players[0],swapped.players[1]);
  swapped.current=1-swapped.current;
  assert(std::abs(policy_value(s,TRAINED_POLICY)+policy_value(swapped,TRAINED_POLICY))<1e-12);
  const auto actions = atomic_actions(s);
  const auto reference = observation_actions(observation_of(s));
  assert(!actions.empty());
  assert(actions.size() == reference.size());
  for (const auto& a : actions) {
    assert(std::count(actions.begin(), actions.end(), a) == 1);
    assert(std::find(reference.begin(), reference.end(), a) != reference.end());
    State next = s;
    apply_action(next, a);
    for (const auto& p : next.players) {
      assert(p.hand_count == sum(p.hand.data(), GOODS));
      assert(p.hand_count >= 0 && p.hand_count <= 7);
      assert(p.camels >= 0);
      for (int count : p.hand) assert(count >= 0);
    }
    for (int count : next.market) assert(count >= 0);
    for (int good = 0; good <= GOODS; ++good) {
      int total = next.market[good];
      for (const auto& p : next.players)
        total += good == CAMEL ? p.camels : p.hand[good];
      for (int i = 0; i < next.deck_count; ++i) total += next.deck[i] == good;
      if (good != CAMEL) total += next.discarded[good];
      assert(total == CARD_COUNTS[good]);
    }
  }
  for (int i = 0; i < 50; ++i) {
    const auto a = rollout_action(s, rng);
    assert(std::find(reference.begin(), reference.end(), a) != reference.end());
  }
  for (int i = 0; i < 10; ++i) {
    const auto a = policy_action(s, rng, TRAINED_POLICY, 100);
    assert(std::find(reference.begin(), reference.end(), a) != reference.end());
  }
}

int main() {
  Rng rng{42};
  int positions = 0;
  for (int game = 0; game < 20; ++game) {
    State s;
    std::vector<int> deck;
    for (int good = 0; good <= GOODS; ++good)
      for (int n = 0; n < CARD_COUNTS[good]; ++n) deck.push_back(good);
    shuffle(deck, rng);
    for (auto& p : s.players)
      for (int n = 0; n < 5; ++n) {
        int card = deck.back();
        deck.pop_back();
        if (card == CAMEL) ++p.camels;
        else { ++p.hand[card]; ++p.hand_count; }
      }
    s.deck_count = deck.size();
    std::copy(deck.begin(), deck.end(), s.deck.begin());
    refill(s);
    for (int good = 0; good < GOODS; ++good) {
      s.token_count[good] = good < 3 ? 5 : good < 5 ? 7 : 9;
      s.tokens[good].fill(3);
    }
    s.bonus = BONUS_VALUES;
    s.bonus_count = BONUS_TOTALS;
    for (int turn = 0; turn < 256 && !s.terminal; ++turn) {
      check_actions(s, rng);
      ++positions;
      apply_action(s, rollout_action(s, rng));
    }
    assert(s.terminal);
  }
  // Taking leather would remove the only possible payment; no exchange exists.
  State blocked;
  blocked.market[5] = 2;
  blocked.market[3] = 1;
  blocked.market[CAMEL] = 2;
  blocked.players[0].hand[5] = 2;
  blocked.players[0].hand_count = 2;
  const auto blocked_actions = atomic_actions(blocked);
  assert(std::none_of(blocked_actions.begin(), blocked_actions.end(),
      [](const Action& a) { return a.kind == ActionKind::Exchange; }));
  // Winning terminal sale: the search must use true outcome, not hand potential.
  State s;
  s.market[CAMEL] = 5;
  s.players[0].hand[3] = 1;
  s.players[0].hand_count = 1;
  s.players[0].camels = 6;
  s.players[1].goods = 6;
  for (int good = 2; good < GOODS; ++good) {
    s.token_count[good] = 1;
    s.tokens[good][0] = 5;
  }
  SearchStats stats;
  const auto edges = terminal_tree(s, 1000, rng, stats);
  const auto best = std::max_element(edges.begin(), edges.end(),
      [](const auto& a, const auto& b) { return a.visits < b.visits; });
  assert(best->action.kind == ActionKind::Sell);
  assert(stats.terminal == 1000 && stats.truncated == 0);
  std::cout << positions << " positions: atomic actions match independent enumeration; "
            << "rollouts legal; winning terminal sale found.\n";
}
