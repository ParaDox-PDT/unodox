import { createGame, type GameState } from "./engine";

export const BOT_NAME_POOL = [
  "Luna", "Milo", "Nova", "Zara", "Leo", "Kira", "Atlas", "Niko",
  "Maya", "Finn", "Iris", "Theo", "Juno", "Arlo", "Sage", "Cleo",
] as const;

export const BOT_THINK_MIN_MS = 900;
export const BOT_THINK_MAX_MS = 3_000;

export function randomBotThinkDelay(random: () => number = Math.random): number {
  const value = Math.min(1, Math.max(0, random()));
  return Math.round(BOT_THINK_MIN_MS + value * (BOT_THINK_MAX_MS - BOT_THINK_MIN_MS));
}

export function pickRandomBotNames(count = 3, random: () => number = Math.random): string[] {
  if (count > BOT_NAME_POOL.length) throw new Error("Not enough bot names.");
  const names = [...BOT_NAME_POOL];
  for (let index = names.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [names[index], names[swapIndex]] = [names[swapIndex], names[index]];
  }
  return names.slice(0, count);
}

export function createOfflineGame(): GameState {
  return createGame(["You", ...pickRandomBotNames(3)]);
}
