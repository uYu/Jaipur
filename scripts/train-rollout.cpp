#include <fstream>
#include <iomanip>
#include "../cpp/jaipur_ai.cpp"
using namespace jaipur;

State deal_training(Rng& rng) {
  State s;
  std::vector<int> cards;
  for(int g=0;g<=GOODS;g++)
    for(int n=0;n<CARD_COUNTS[g]-(g==CAMEL?3:0);n++) cards.push_back(g);
  shuffle(cards,rng);
  for(auto& p:s.players)
    for(int n=0;n<5;n++) {
      const int c=cards.back();cards.pop_back();
      if(c==CAMEL) p.camels++;
      else {p.hand[c]++;p.hand_count++;}
    }
  s.market[CAMEL]=3;
  s.deck_count=cards.size();
  std::copy(cards.begin(),cards.end(),s.deck.begin());
  refill(s);
  s.tokens={{
    {{7,7,5,5,5}},{{6,6,5,5,5}},{{5,5,5,5,5}},
    {{5,3,3,2,2,1,1}},{{5,3,3,2,2,1,1}},{{4,3,2,1,1,1,1,1,1}}
  }};
  s.token_count={5,5,5,7,7,9};
  for(int tier=0;tier<3;tier++) {
    std::vector<int> values(BONUS_VALUES[tier].begin(),BONUS_VALUES[tier].begin()+BONUS_TOTALS[tier]);
    shuffle(values,rng);
    std::copy(values.begin(),values.end(),s.bonus[tier].begin());
  }
  s.bonus_count=BONUS_TOTALS;
  s.current=rng.index(2);
  return s;
}

int main(int argc,char** argv) {
  const int games=argc>1?std::stoi(argv[1]):20000;
  const uint32_t seed=argc>2?uint32_t(std::stoul(argv[2])):20260922;
  const bool margin=argc>3 && std::string(argv[3])=="margin";
  Rng rng{seed};
  PolicyWeights weights{};
  PolicyWeights average{};
  int snapshots=0;
  weights[0]=1;
  int finished=0;
  for(int game=0;game<games;game++) {
    State s=deal_training(rng);
    PolicyWeights eligibility{};
    for(int turn=0;turn<256 && !s.terminal;turn++) {
      const auto features=policy_features(s);
      const double prediction=policy_value(s,weights);
      const auto action=policy_action(s,rng,weights,150);
      apply_action(s,action);
      const auto& a=s.players[0];
      const auto& b=s.players[1];
      const int camel=a.camels==b.camels?0:a.camels>b.camels?5:-5;
      // 224 is the total points in all goods/bonus tokens plus camel majority.
      const double terminal_target=margin?
        (a.goods+a.bonuses-b.goods-b.bonuses+camel)/224.0:s.value;
      const double target=s.terminal?terminal_target:policy_value(s,weights);
      const double error=target-prediction;
      double norm=1;
      for(double x:features) norm+=x*x;
      for(int f=0;f<POLICY_FEATURES;f++) {
        eligibility[f]=.7*eligibility[f]+features[f]*(1-prediction*prediction);
        weights[f]+=.04*error*eligibility[f]/norm;
      }
    }
    finished+=s.terminal;
    if(game>=games/2) {
      for(int f=0;f<POLICY_FEATURES;f++) average[f]+=weights[f];
      snapshots++;
    }
    if((game+1)%10000==0) std::cerr << "self-play " << game+1 << "/" << games << " finished=" << finished << "\n";
  }
  // Stdout is the reproducible weight artifact, copied using apply_patch.
  std::cout << "// TD(lambda) self-play: rounds=" << games << ", seed=" << seed << ", target=" << (margin?"score-margin":"win") << ", averaged last half\n"
            << "constexpr PolicyWeights TRAINED_POLICY = {\n" << std::setprecision(12);
  for(int f=0;f<POLICY_FEATURES;f++) std::cout << average[f]/snapshots << (f+1==POLICY_FEATURES?"":",") << "\n";
  std::cout << "};\n";
}
