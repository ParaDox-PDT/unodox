import { describe, expect, it } from "vitest";
import { cardAssetName, cardLabel, type UnoCard } from "./contracts";

describe("backend card adapter", () => {
  it("maps backend action names to existing card assets", () => {
    const drawTwo: UnoCard = { id: "1", color: "red", type: "draw_two", value: null };
    const wildFour: UnoCard = { id: "2", color: null, type: "wild_draw_four", value: null };
    expect(cardAssetName(drawTwo)).toBe("card_draw2_red.png");
    expect(cardAssetName(wildFour)).toBe("card_wild_draw4_1.png");
    expect(cardLabel(wildFour)).toBe("wild wild draw four");
  });

  it("maps number cards without losing zero", () => {
    expect(cardAssetName({ id: "3", color: "blue", type: "number", value: 0 })).toBe("card_0_blue.png");
  });
});
