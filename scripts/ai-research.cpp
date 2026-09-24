#include <chrono>
#include <string>
#include "../cpp/jaipur_ai.cpp"

using namespace jaipur;

Observation observable(const State& state) {
  Observation o;
  const auto& own = state.players[state.current];
  const auto& other = state.players[1-state.current];
  o.hand = own.hand;
  o.hand_count = own.hand_count;
  o.camels = own.camels;
  o.goods_sum = own.goods;
  o.goods_count = own.goods_count;
  o.opponent_goods_sum = other.goods;
  o.opponent_goods_count = other.goods_count;
  o.opponent_hand_count = other.hand_count;
  o.deck_count = state.deck_count;
  o.discarded = state.discarded;
  o.bonus_count = state.bonus_count;
  int at=0;
  for(int g=0;g<=GOODS;g++)
    for(int n=0;n<state.market[g];n++) o.market[at++]=g;
  o.token_count=state.token_count;
  for(int g=0;g<GOODS;g++)
    for(int n=0;n<state.token_count[g];n++)
      o.tokens[g][n]=state.tokens[g][state.token_start[g]+n];
  return o;
}

void print_action(const Action& action) {
  int32_t encoded[16];
  encode_action(action,encoded);
  std::cout << "[";
  for(int i=0;i<16;i++) std::cout << (i?",":"") << encoded[i];
  std::cout << "]";
}

// Audit sampled worlds, not the saved game's private hand. Check whether each
// rollout policy actually takes an available, immediately winning sale.
void audit_replies(const Observation& o, uint32_t seed, int samples) {
  Rng initial{seed};
  const auto actions = atomic_actions(determinize(o, initial));
  for (const auto& action : actions) {
    int threats=0, first_eight_threats=0, missed[3]={};
    Rng worlds{seed};
    for (int n=0;n<samples;n++) {
      State s=determinize(o,worlds);
      apply_action(s,action);
      if(s.terminal) continue;
      bool threat=false;
      for(const auto& reply:atomic_actions(s)) {
        if(reply.kind!=ActionKind::Sell) continue;
        State end=s; apply_action(end,reply);
        if(end.terminal && (s.current==0?end.value:-end.value)>0) {threat=true;break;}
      }
      if(!threat) continue;
      threats++;
      first_eight_threats += n<8;
      for(int p=0;p<3;p++) {
        Rng rng{seed ^ (uint32_t(n+1)*0x9e3779b9u)};
        auto reply=p==2?neural_action(s,rng,100):policy_action(s,rng,TRAINED_POLICY,p?100:0);
        State end=s;apply_action(end,reply);
        missed[p]+=!(end.terminal && (s.current==0?end.value:-end.value)>0);
      }
    }
    std::cout<<"{\"action\":";print_action(action);
    std::cout<<",\"samples\":"<<samples<<",\"winningReplyWorlds\":"<<threats
      <<",\"firstEightWinningReplyWorlds\":"<<first_eight_threats
      <<",\"missedLinearGreedy\":"<<missed[0]<<",\"missedLinearExplore\":"<<missed[1]
      <<",\"missedNeuralExplore\":"<<missed[2]<<"}"<<std::endl;
  }
}

// Common determinization and per-turn random seeds for every root alternative.
void diagnose(const Observation& observation, uint32_t seed, int samples) {
  Rng worlds{seed};
  const auto actions=atomic_actions(determinize(observation,worlds));
  for(int policy=0;policy<3;policy++) {
    std::cout << "{\"policy\":\"" << (policy==2?"learned":policy?"normal":"random") << "\",\"candidates\":[";
    for(int index=0;index<int(actions.size());index++) {
      double value=0, score=0, bonus=0, split=0, give=0, delay=0;
      int ended=0;
      Rng paired{seed};
      for(int sample=0;sample<samples;sample++) {
        State s=determinize(observation,paired);
        const uint32_t rollout_seed=paired.next();
        apply_action(s,actions[index]);
        bool first_own=true;
        for(int turn=0;turn<256 && !s.terminal;turn++) {
          Rng rng{rollout_seed ^ (uint32_t(turn+1)*0x9e3779b9u)};
          const auto a=policy==2 ? policy_action(s,rng,TRAINED_POLICY,100) :
              policy ? choose_original_hard(observable(s)) : rollout_action(s,rng);
          if(s.current==0) {
            if(first_own) {
              delay += a.kind!=ActionKind::Sell;
              first_own=false;
            }
            split += a.kind==ActionKind::Sell && a.count<s.players[0].hand[a.good];
            if(a.kind==ActionKind::Exchange)
              for(int g=0;g<GOODS;g++) give += a.give[g]>0 && s.players[0].hand[g]>=3;
          }
          apply_action(s,a);
        }
        if(s.terminal) { value+=s.value; ended++; }
        score+=s.players[0].goods+s.players[0].bonuses-
               s.players[1].goods-s.players[1].bonuses;
        bonus+=s.players[0].bonuses;
      }
      if(index) std::cout << ",";
      std::cout << "{\"action\":";
      print_action(actions[index]);
      std::cout << ",\"winScore\":" << .5+value/(2*samples)
        << ",\"scoreDiff\":" << score/samples << ",\"bonus\":" << bonus/samples
        << ",\"splitSales\":" << split/samples << ",\"breakSets\":" << give/samples
        << ",\"firstOwnDoesNotSell\":" << delay/samples << ",\"ended\":" << ended << "}";
    }
    std::cout << "]}" << std::endl;
  }
}

int main(int argc,char** argv) {
  const std::string mode=argc>1?argv[1]:"search";
  SearchOptions options;
  options.learned_rollout=false;
  options.learned_prior=false;
  if(argc>2) options.exploration=std::stod(argv[2]);
  if(argc>3) options.progressive_widening=std::stoi(argv[3]);
  if(argc>4) options.trees=std::stoi(argv[4]);
  if(argc>5) options.learned_rollout=std::stoi(argv[5]);
  if(argc>6) options.time_limit_ms=std::stod(argv[6]);
  if(argc>7) options.learned_prior=std::stoi(argv[7]);
  if(argc>8) options.neural_prior=std::stoi(argv[8]);
  if(argc>9) options.neural_rollout=std::stoi(argv[9]);
  if(argc>10) options.neural_root_only=std::stoi(argv[10]);
  if(argc>11) options.stratified_hands=std::stoi(argv[11]);
  if(argc>12) options.close_risk_weight=std::stod(argv[12]);
  if(argc>13) options.belief_prior=std::stoi(argv[13]);
  if(argc>14) options.terminal_tactics=std::stoi(argv[14]);
  if(argc>15) options.factor_actions=std::stoi(argv[15]);
#ifndef JAIPUR_BELIEF_WEIGHTS_HEADER
  if(options.belief_prior) { std::cerr << "Belief weights not compiled\n"; return 3; }
#endif
  options.record_root_policy = mode == "teacher";
  options.record_root_stats = mode == "audit-search";
  int iterations,length;
  while(std::cin >> iterations >> length) {
    double request_budget_ms=options.time_limit_ms;
    if(mode=="search-budgeted" || mode=="search-dmc") std::cin >> request_budget_ms;
    std::vector<int32_t> input(length);
    for(auto& value:input) std::cin >> value;
    Observation o;
    if(!parse_observation(input.data(),length,o)) return 2;
    std::vector<std::pair<Action,double>> external_prior;
    double external_mix=.5;
    if(mode=="search-dmc") {
      int count=0;
      std::cin >> external_mix >> count;
      if(count<=0 || count>100000 || external_mix<0 || external_mix>1) return 4;
      double mass=0;
      for(int i=0;i<count;++i) {
        std::array<double,24> f{};
        for(auto& value:f) std::cin >> value;
        double probability; std::cin >> probability;
        if(!std::cin || !std::isfinite(probability) || probability<0) return 4;
        Action action;
        action.kind=ActionKind(std::max_element(f.begin(),f.begin()+4)-f.begin());
        if(action.kind==ActionKind::Take || action.kind==ActionKind::Sell)
          action.good=std::max_element(f.begin()+17,f.begin()+23)-(f.begin()+17);
        action.count=std::lround(f[16]*7);
        action.camels=std::lround(f[23]*7);
        for(int g=0;g<GOODS;++g) {action.take[g]=std::lround(f[4+g]*7);action.give[g]=std::lround(f[10+g]*7);}
        external_prior.push_back({action,probability});mass+=probability;
      }
      if(std::abs(mass-1)>1e-5) return 4;
      Rng legal_rng{123};
      const auto legal=atomic_actions(determinize(o,legal_rng));
      if(legal.size()!=external_prior.size()) return 4;
      for(const auto& action:legal) {
        int matches=0;
        for(const auto& item:external_prior) matches+=item.first==action;
        if(matches!=1) return 4;
      }
    }
    const auto seed=hash_input(input.data(),length);
    if(mode=="audit-replies") { audit_replies(o,seed,iterations); continue; }
    if(mode=="diagnose") { diagnose(o,seed,iterations); continue; }
    const auto started=std::chrono::steady_clock::now();
    SearchDecision decision;
    if(mode=="normal") decision.action=choose_original_hard(o);
    else {
      auto request_options=options;
      request_options.time_limit_ms=request_budget_ms;
      if(mode=="search-dmc") {
        request_options.root_policy=&external_prior;
        request_options.root_policy_mix=external_mix;
      }
      decision=choose(o,seed,iterations,request_options);
    }
    if(mode=="teacher") {
      const auto features=belief_features(o);
      std::cout << "{\"features\":[";
      for(int i=0;i<BELIEF_STATE_FEATURES;i++) std::cout << (i?",":"") << features[i];
      std::cout << "],\"actions\":[";
      for(size_t i=0;i<decision.root_policy.size();i++) {
        const auto& item=decision.root_policy[i];
        const auto af=belief_action_features(item.first);
        std::cout << (i?",":"") << "{\"features\":[";
        for(int j=0;j<BELIEF_ACTION_FEATURES;j++) std::cout << (j?",":"") << af[j];
        std::cout << "],\"policy\":" << item.second << "}";
      }
      std::cout << "]}" << std::endl;
      continue;
    }
    const double ms=std::chrono::duration<double,std::milli>(
      std::chrono::steady_clock::now()-started).count();
    std::cout << "{\"action\":";
    print_action(decision.action);
    if(options.record_root_stats) {
      std::cout<<",\"root\":[";
      for(size_t i=0;i<decision.root_stats.size();++i) {
        const auto& item=decision.root_stats[i];
        std::cout<<(i?",":"")<<"{\"action\":"; print_action(item.first);
        std::cout<<",\"visitMass\":"<<item.second[0]<<",\"mean\":"<<item.second[1]<<"}";
      }
      std::cout<<"]";
    }
    std::cout << ",\"elapsedMs\":" << ms << ",\"depth\":" << decision.stats.max_depth
      << ",\"simulations\":" << decision.stats.simulations
      << ",\"terminal\":" << decision.stats.terminal
      << ",\"truncated\":" << decision.stats.truncated
      << ",\"tacticalFinishes\":" << decision.stats.tactical_finishes << "}" << std::endl;
  }
}
