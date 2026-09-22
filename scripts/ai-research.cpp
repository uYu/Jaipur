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
  int iterations,length;
  while(std::cin >> iterations >> length) {
    std::vector<int32_t> input(length);
    for(auto& value:input) std::cin >> value;
    Observation o;
    if(!parse_observation(input.data(),length,o)) return 2;
    const auto seed=hash_input(input.data(),length);
    if(mode=="diagnose") { diagnose(o,seed,iterations); continue; }
    const auto started=std::chrono::steady_clock::now();
    SearchDecision decision;
    if(mode=="normal") decision.action=choose_original_hard(o);
    else decision=choose(o,seed,iterations,options);
    const double ms=std::chrono::duration<double,std::milli>(
      std::chrono::steady_clock::now()-started).count();
    std::cout << "{\"action\":";
    print_action(decision.action);
    std::cout << ",\"elapsedMs\":" << ms << ",\"depth\":" << decision.stats.max_depth
      << ",\"terminal\":" << decision.stats.terminal << "}" << std::endl;
  }
}
