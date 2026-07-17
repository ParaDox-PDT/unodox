import { describe, expect, it } from "vitest";
import { BOT_NAME_POOL, BOT_THINK_MAX_MS, BOT_THINK_MIN_MS, createOfflineGame, pickRandomBotNames, randomBotThinkDelay } from "./offline";

describe("offline game setup", () => {
  it("creates one player and exactly three uniquely named bots", () => {
    const game = createOfflineGame();
    expect(game.players).toHaveLength(4);
    expect(game.players[0].name).toBe("You");
    expect(new Set(game.players.slice(1).map(player => player.name)).size).toBe(3);
  });

  it("selects bot names from the configured pool", () => {
    const names = pickRandomBotNames(3, () => 0);
    expect(names).toHaveLength(3);
    expect(names.every(name => BOT_NAME_POOL.includes(name))).toBe(true);
  });

  it("gives every bot action a bounded random thinking delay", () => {
    expect(randomBotThinkDelay(() => 0)).toBe(BOT_THINK_MIN_MS);
    expect(randomBotThinkDelay(() => 0.5)).toBe(1_950);
    expect(randomBotThinkDelay(() => 1)).toBe(BOT_THINK_MAX_MS);
  });
});
