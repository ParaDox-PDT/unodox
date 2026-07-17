export type CardColor = "red" | "yellow" | "green" | "blue";
export type CardValue = `${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | "skip" | "reverse" | "draw2" | "wild" | "wild4";
export type UnoCard = { id: string; color: CardColor | null; value: CardValue };
export type Player = { id: string; name: string; hand: UnoCard[]; hasCalledUno?: boolean };
export type DrawStackType = "drawTwo" | "drawFour" | null;
export type GameStatus = "playing" | "finished";
export type GameState = {
  players: Player[]; drawPile: UnoCard[]; discardPile: UnoCard[]; currentPlayerIndex: number;
  direction: 1 | -1; activeColor: CardColor; pendingDrawCount: number; drawStackType: DrawStackType;
  gameStatus: GameStatus; winnerId: string | null; awaitingColorFor: string | null; hasDrawnCard: boolean;
  selectedComboCards: string[]; unoCallWindow: { targetPlayerId: string; cardId: string } | null;
};

export const COLORS: CardColor[] = ["red", "yellow", "green", "blue"];
const numeric = (card: UnoCard) => /^\d$/.test(card.value);
const clone = <T>(value: T): T => structuredClone(value);

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function createDeck(): UnoCard[] {
  const cards: UnoCard[] = []; let index = 0;
  for (const color of COLORS) {
    cards.push({ id: `card-${index++}`, color, value: "0" });
    for (const value of ["1","2","3","4","5","6","7","8","9","skip","reverse","draw2"] as CardValue[]) for (let copy = 0; copy < 2; copy++) cards.push({ id: `card-${index++}`, color, value });
  }
  for (let copy = 0; copy < 4; copy++) { cards.push({ id: `card-${index++}`, color: null, value: "wild" }); cards.push({ id: `card-${index++}`, color: null, value: "wild4" }); }
  return shuffle(cards);
}
export function getNextPlayerIndex(state: Pick<GameState, "players" | "currentPlayerIndex" | "direction">, steps = 1) {
  return (state.currentPlayerIndex + state.direction * steps + state.players.length * 10) % state.players.length;
}
export function createGame(playerNames = ["You", "Lena", "Milo"]): GameState {
  let deck = createDeck(); let opening = deck.pop()!;
  while (opening.color === null) { deck.unshift(opening); deck = shuffle(deck); opening = deck.pop()!; }
  const players = playerNames.map((name, i) => ({ id: `player-${i}`, name, hand: deck.splice(-7), hasCalledUno: false }));
  return { players, drawPile: deck, discardPile: [opening], currentPlayerIndex: 0, direction: 1, activeColor: opening.color, pendingDrawCount: 0, drawStackType: null, gameStatus: "playing", winnerId: null, awaitingColorFor: null, hasDrawnCard: false, selectedComboCards: [], unoCallWindow: null };
}
export function topCard(state: GameState) { return state.discardPile.at(-1)!; }
export function canPlayCard(card: UnoCard, state: GameState): boolean {
  if (state.gameStatus !== "playing" || state.awaitingColorFor) return false;
  if (state.pendingDrawCount) return state.drawStackType === "drawFour" ? card.value === "wild4" : card.value === "draw2" || card.value === "wild4";
  const top = topCard(state);
  if (card.value === "wild") return true;
  if (card.value === "wild4") {
    const currentHand = state.players[state.currentPlayerIndex]?.hand ?? [];
    return !currentHand.some(held => held.color === state.activeColor);
  }
  return card.color === state.activeColor || card.value === top.value;
}
export function getPlayableCards(state: GameState, playerId: string) {
  const player = state.players[state.currentPlayerIndex];
  return player?.id === playerId ? player.hand.filter(card => canPlayCard(card, state)) : [];
}
function requireTurn(state: GameState, playerId: string) {
  if (state.gameStatus !== "playing") throw new Error("Game is finished.");
  if (state.unoCallWindow) throw new Error("Call UNO before the next move.");
  if (state.awaitingColorFor) throw new Error("Choose a wild card color first.");
  if (state.players[state.currentPlayerIndex]?.id !== playerId) throw new Error("It is not this player's turn.");
}
function refillDrawPile(state: GameState) {
  if (state.drawPile.length || state.discardPile.length < 2) return;
  const top = state.discardPile.pop()!;
  state.drawPile = shuffle(state.discardPile); state.discardPile = [top];
}
function take(state: GameState, amount: number) {
  const cards: UnoCard[] = [];
  while (cards.length < amount) { refillDrawPile(state); const card = state.drawPile.pop(); if (!card) break; cards.push(card); }
  return cards;
}
function advance(state: GameState, steps = 1) { state.currentPlayerIndex = getNextPlayerIndex(state, steps); state.hasDrawnCard = false; }
function finishIfEmpty(state: GameState, player: Player) { if (!player.hand.length) { state.gameStatus = "finished"; state.winnerId = player.id; return true; } return false; }
function applyNonWildEffect(state: GameState, card: UnoCard) {
  if (card.value === "draw2") { state.pendingDrawCount += 2; state.drawStackType = "drawTwo"; advance(state); return; }
  if (card.value === "skip") { advance(state, 2); return; }
  if (card.value === "reverse") { state.direction = state.direction === 1 ? -1 : 1; advance(state, state.players.length === 2 ? 2 : 1); return; }
  advance(state);
}
export function canPlayCards(cards: UnoCard[], state: GameState, playerId: string) {
  if (cards.length < 2 || !cards.every(numeric) || state.pendingDrawCount) return false;
  const player = state.players[state.currentPlayerIndex];
  if (!player || player.id !== playerId || new Set(cards.map(c => c.id)).size !== cards.length) return false;
  if (!cards.every(card => player.hand.some(held => held.id === card.id))) return false;
  return cards.every(card => card.value === cards[0].value) && canPlayCard(cards[0], state);
}
export function playCards(state: GameState, playerId: string, cardIds: string[]): GameState {
  const next = clone(state); requireTurn(next, playerId);
  const player = next.players[next.currentPlayerIndex]; const cards = cardIds.map(id => player.hand.find(card => card.id === id)).filter(Boolean) as UnoCard[];
  if (cards.length !== cardIds.length || !canPlayCards(cards, next, playerId)) throw new Error("Invalid number-card combo.");
  player.hand = player.hand.filter(card => !cardIds.includes(card.id)); next.discardPile.push(...cards); next.activeColor = cards.at(-1)!.color!; next.selectedComboCards = []; player.hasCalledUno = false;
  if (!finishIfEmpty(next, player)) applyNonWildEffect(next, cards.at(-1)!);
  return next;
}
export function playCard(state: GameState, playerId: string, cardId: string): GameState {
  const next = clone(state); requireTurn(next, playerId);
  const player = next.players[next.currentPlayerIndex]; const card = player.hand.find(item => item.id === cardId);
  if (!card || !canPlayCard(card, next)) throw new Error("Card cannot be played now.");
  const handCountBefore = player.hand.length; const hadCalledUno = player.hasCalledUno;
  player.hand = player.hand.filter(item => item.id !== cardId); next.discardPile.push(card); next.selectedComboCards = [];
  if (card.color !== null) next.activeColor = card.color;
  if (finishIfEmpty(next, player)) { player.hasCalledUno = false; return next; }
  if (handCountBefore === 2 && player.hand.length === 1 && !hadCalledUno) { player.hasCalledUno = false; next.unoCallWindow = { targetPlayerId: playerId, cardId }; }
  else if (player.hand.length !== 1) player.hasCalledUno = false;
  if (card.value === "wild" || card.value === "wild4") { if (card.value === "wild4") { next.pendingDrawCount += 4; next.drawStackType = "drawFour"; } next.awaitingColorFor = playerId; return next; }
  applyNonWildEffect(next, card); return next;
}
export function selectWildColor(state: GameState, playerId: string, color: CardColor): GameState {
  const next = clone(state); if (next.unoCallWindow || next.gameStatus !== "playing" || next.awaitingColorFor !== playerId || !COLORS.includes(color)) throw new Error("Invalid wild color selection.");
  next.activeColor = color; next.awaitingColorFor = null; advance(next); return next;
}
export function drawCard(state: GameState, playerId: string): GameState {
  const next = clone(state); requireTurn(next, playerId); const player = next.players[next.currentPlayerIndex];
  if (next.pendingDrawCount) return acceptPendingDraw(next, playerId);
  if (next.hasDrawnCard) throw new Error("A card has already been drawn this turn.");
  const drawn = take(next, 1); player.hand.push(...drawn); player.hasCalledUno = false; next.hasDrawnCard = true;
  if (!drawn.length || !canPlayCard(drawn[0], next)) advance(next); return next;
}
export function acceptPendingDraw(state: GameState, playerId: string): GameState {
  const next = clone(state); requireTurn(next, playerId); if (!next.pendingDrawCount) throw new Error("No pending draw.");
  next.players[next.currentPlayerIndex].hand.push(...take(next, next.pendingDrawCount)); next.players[next.currentPlayerIndex].hasCalledUno = false; next.pendingDrawCount = 0; next.drawStackType = null; advance(next); return next;
}

export function callUno(state: GameState, callerId: string): GameState {
  const next = clone(state);
  const window = next.unoCallWindow;
  const caller = next.players.find(player => player.id === callerId);
  const target = window ? next.players.find(player => player.id === window.targetPlayerId) : null;
  if (!window || !caller || !target) throw new Error("UNO is no longer available.");
  if (callerId === target.id) target.hasCalledUno = true;
  else {
    target.hand.push(...take(next, 2));
    target.hasCalledUno = false;
  }
  next.unoCallWindow = null;
  return next;
}
