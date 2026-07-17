import { describe, expect, it } from "vitest";
import { tapButtonPosition } from "./card-motion";

describe("TAP challenge placement", () => {
  it("is stable for one player and varies between players", () => {
    const first = tapButtonPosition("challenge", "player-a");
    expect(tapButtonPosition("challenge", "player-a")).toEqual(first);
    expect(tapButtonPosition("challenge", "player-b")).not.toEqual(first);
  });
});
