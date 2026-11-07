import type { ActionTransition } from "./action-transition.ts";
import type { State, Good } from "./types.ts";

export type NumberFrame = { at: number; state: State };

/** Only the displayed reserves change during travel. Cards, turn and game
 * rules keep using the original board until the transaction is complete. */
export function numberFrames(transition: ActionTransition): NumberFrame[] {
  if (transition.kind !== "action") return [];
  type Change = { at: number; apply: (state: State) => void };
  const changes: Change[] = [];
  const add = (at: number, apply: Change["apply"]) =>
    changes.push({ at: at * transition.duration, apply });
  const actor = transition.action.actor;
  for (const flight of transition.flights) {
    if (flight.layout) continue;
    if (flight.from === "deck")
      add(flight.start, (s) => {
        s.deck.pop();
      });
    if (flight.good === "camel") {
      if (flight.from.endsWith("-herd"))
        add(flight.start, (s) => {
          s.players[flight.from === "your-herd" ? 0 : 1].camels--;
        });
      if (flight.to.endsWith("-herd"))
        add(flight.end, (s) => {
          s.players[flight.to === "your-herd" ? 0 : 1].camels++;
        });
    }
    if (flight.coin !== undefined) {
      if (flight.coinGood)
        add(flight.start, (s) => {
          s.tokens[flight.coinGood as Good].shift();
        });
      else if (flight.from.startsWith("bonus-face-"))
        add(flight.start, (s) => {
          s.bonus[Number(flight.from.slice(11)) as 3 | 4 | 5].pop();
        });
      add(flight.end, (s) => {
        const values = flight.coinGood
          ? s.players[actor].goods
          : s.players[actor].bonuses;
        // A hidden bonus contributes a public token count, never a face value.
        values.push(typeof flight.coin === "number" ? flight.coin : 0);
      });
    }
  }
  const result: NumberFrame[] = [];
  let state = transition.before;
  for (const change of changes.sort((a, b) => a.at - b.at)) {
    const previous = result.at(-1);
    if (!previous || Math.abs(previous.at - change.at) > 0.01) {
      state = {
        ...state,
        deck: [...state.deck],
        tokens: Object.fromEntries(
          Object.entries(state.tokens).map(([g, values]) => [g, [...values]]),
        ) as State["tokens"],
        bonus: {
          3: [...state.bonus[3]],
          4: [...state.bonus[4]],
          5: [...state.bonus[5]],
        },
        players: state.players.map((p) => ({
          ...p,
          goods: [...p.goods],
          bonuses: [...p.bonuses],
        })) as State["players"],
      };
      result.push({ at: change.at, state });
    }
    change.apply(state);
  }
  return result;
}
