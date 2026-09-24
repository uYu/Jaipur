import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const directory = process.argv[2];
const total = Number(process.argv[3]);
if (!directory || !Number.isSafeInteger(total) || total <= 0)
  throw Error("Usage: watch-benchmark-progress.ts directory totalGames");

let last = "";
const poll = () => {
  const gamesPath = join(directory, "matches-games.jsonl");
  const progressPath = join(directory, "progress.json");
  let games: { winner: number }[] = [];
  if (existsSync(gamesPath)) {
    try {
      games = readFileSync(gamesPath, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      return; // A match line is still being appended.
    }
  }
  const completed = games.length;
  const wins = [games.filter((g) => g.winner === 0).length, games.filter((g) => g.winner === 1).length];
  let progress = null;
  if (existsSync(progressPath)) {
    try {
      progress = JSON.parse(readFileSync(progressPath, "utf8"));
    } catch {
      return; // Writer was replacing the snapshot; retry on the next poll.
    }
  }
  const current = progress
    ? `当前种子 ${progress.seed}，候选座位 ${progress.seat}，` +
      `第 ${progress.round} 轮、第 ${progress.turns} 手`
    : "等待首局";
  const score = `，已完赛胜场 ${wins[0]}:${wins[1]}`;
  const message = `[总进度] ${completed}/${total} 场；${current}${score}`;
  if (message !== last) {
    console.log(message);
    last = message;
  }
  if (completed >= total) process.exit(0);
};
poll();
setInterval(poll, 2000);
