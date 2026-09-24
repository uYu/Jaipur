// Sparse, antisymmetric state features for a self-play-trained rollout policy.
// Features describe counts and exact game payouts; their weights are learned.
constexpr int POLICY_BASE_FEATURES = 70;
constexpr int POLICY_FEATURES = POLICY_BASE_FEATURES * 2;
using PolicyFeatures = std::array<double, POLICY_FEATURES>;
using PolicyWeights = std::array<double, POLICY_FEATURES>;

PolicyFeatures policy_features(const State& s) {
  PolicyFeatures x{};
  x[0] = (s.players[0].goods + s.players[0].bonuses -
          s.players[1].goods - s.players[1].bonuses) / 80.0;
  x[1] = s.current == 0 ? 1 : -1;
  for (int p=0;p<2;p++) {
    const double sign = p==0 ? 1 : -1;
    const auto& player=s.players[p];
    for (int g=0;g<GOODS;g++) {
      const int count=player.hand[g];
      if (!count) continue;
      x[2+g*7+count-1] += sign;
      int cash=0;
      if (count >= (g<3?2:1))
        for(int n=0;n<std::min(count,s.token_count[g]);n++)
          cash+=s.tokens[g][s.token_start[g]+n];
      x[44+g] += sign*cash/30.0;
      if(count>=3 && s.bonus_count[tier_for(count)]) {
        const int tier=tier_for(count);
        // Expected bonus, never the sampled next hidden bonus token.
        const double expected = tier==0 ? 2.0 : tier==1 ? 5.0 : 9.0;
        x[50+g] += sign*expected/10.0;
      }
    }
    if(player.camels) x[55+std::min(player.camels,11)] += sign;
    x[67] += sign*player.bonus_count/18.0;
    x[68] += sign*player.goods_count/38.0;
  }
  x[69] = s.players[0].camels==s.players[1].camels ? 0 :
          s.players[0].camels>s.players[1].camels ? 1 : -1;
  const double progress=1.0-std::min(40,s.deck_count)/40.0;
  for(int i=0;i<POLICY_BASE_FEATURES;i++) x[i+POLICY_BASE_FEATURES]=x[i]*progress;
  return x;
}

double policy_value(const State& s, const PolicyWeights& weights) {
  if(s.terminal) return s.value;
  const double progress=1.0-std::min(40,s.deck_count)/40.0;
  const auto w=[&](int i) { return weights[i]+progress*weights[i+POLICY_BASE_FEATURES]; };
  double value=w(0)*(s.players[0].goods+s.players[0].bonuses-
                    s.players[1].goods-s.players[1].bonuses)/80.0;
  value+=w(1)*(s.current==0?1:-1);
  for(int p=0;p<2;p++) {
    const double sign=p==0?1:-1;
    const auto& player=s.players[p];
    for(int g=0;g<GOODS;g++) {
      const int count=player.hand[g];
      if(!count) continue;
      value+=sign*w(2+g*7+count-1);
      int cash=0;
      if(count>=(g<3?2:1))
        for(int n=0;n<std::min(count,s.token_count[g]);n++)
          cash+=s.tokens[g][s.token_start[g]+n];
      value+=sign*w(44+g)*cash/30.0;
      if(count>=3 && s.bonus_count[tier_for(count)]) {
        const int tier=tier_for(count);
        value+=sign*w(50+g)*(tier==0?2.0:tier==1?5.0:9.0)/10.0;
      }
    }
    if(player.camels) value+=sign*w(55+std::min(player.camels,11));
    value+=sign*w(67)*player.bonus_count/18.0;
    value+=sign*w(68)*player.goods_count/38.0;
  }
  value+=w(69)*(s.players[0].camels==s.players[1].camels?0:
               s.players[0].camels>s.players[1].camels?1:-1);
  return std::tanh(value);
}

Action policy_action(const State& s, Rng& rng, const PolicyWeights& weights,
                     int exploration_per_thousand,
                     const std::chrono::steady_clock::time_point* deadline = nullptr) {
  if (rng.index(1000)<exploration_per_thousand) return rollout_action(s,rng);
  const auto actions=atomic_actions(s);
  Action best=actions.front();
  double value=-std::numeric_limits<double>::infinity();
  int ties=0;
  for(const auto& action:actions) {
    if (deadline && std::chrono::steady_clock::now() >= *deadline) break;
    State next=s;
    apply_action(next,action);
    const double v=(s.current==0?1:-1)*policy_value(next,weights);
    if(v>value+1e-10) { value=v; best=action; ties=1; }
    else if(std::abs(v-value)<1e-10 && rng.index(++ties)==0) best=action;
  }
  return best;
}
