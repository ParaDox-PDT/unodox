export interface CardMotionVariables {
  "--throw-x": string;
  "--throw-y": string;
  "--throw-rotate": string;
}

export function cardThrowVariables(input: { isHuman: boolean; sourceIndex?: number; sourceCount?: number }): CardMotionVariables {
  if (input.isHuman) return { "--throw-x": "0px", "--throw-y": "300px", "--throw-rotate": "12deg" };
  const count = Math.max(input.sourceCount ?? 1, 1);
  const index = Math.max(input.sourceIndex ?? Math.floor(count / 2), 0);
  const centered = index - (count - 1) / 2;
  return {
    "--throw-x": `${Math.round(centered * 230)}px`,
    "--throw-y": "-265px",
    "--throw-rotate": `${Math.round(centered * 8 - 4)}deg`,
  };
}

export function unoButtonPosition(cardId: string | undefined): { left: string; top: string } {
  let hash = 2166136261;
  for (const character of cardId ?? "uno") { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  const horizontal = (hash >>> 0) % 69;
  const vertical = (Math.imul(hash, 1103515245) >>> 0) % 56;
  return {
    left: `clamp(70px, ${14 + horizontal}%, calc(100% - 70px))`,
    top: `clamp(120px, ${18 + vertical}%, calc(100% - 170px))`,
  };
}
