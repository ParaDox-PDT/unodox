"use client";

import { useEffect, useMemo, useState } from "react";
import { acceptPendingDraw, canPlayCard, CardColor, CardValue, COLORS, createGame, drawCard, GameState, getPlayableCards, playCard, playCards, selectWildColor, UnoCard } from "../lib/game/engine";

const names: Record<CardValue, string> = { skip: "Skip", reverse: "Reverse", draw2: "Draw two", wild: "Wild", wild4: "Wild draw four", "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9" };
const numeric = (card: UnoCard) => /^\d$/.test(card.value);
const cardImage = (card: UnoCard) => card.color === null ? (card.value === "wild4" ? "card_wild_draw4_1.png" : "card_wild_1.png") : `card_${card.value}_${card.color}.png`;

export default function Home() {
  const initial = useMemo(() => createGame(), []);
  const [game, setGame] = useState<GameState>(initial);
  const [message, setMessage] = useState("Your turn — match color, number, or symbol.");
  const you = game.players[0];
  const current = game.players[game.currentPlayerIndex];
  const isYourTurn = current.id === you.id && game.gameStatus === "playing";
  const selected = game.selectedComboCards;

  const reset = () => { setGame(createGame()); setMessage("Fresh deck. Your turn!"); };
  const update = (action: (state: GameState) => GameState, success: string) => setGame(previous => { try { const next = action(previous); setMessage(next.gameStatus === "finished" ? `${next.players.find(p => p.id === next.winnerId)?.name} wins the round.` : success); return next; } catch (error) { setMessage(error instanceof Error ? error.message : "That move is not available."); return previous; } });
  const toggleCard = (card: UnoCard) => {
    if (!isYourTurn || game.awaitingColorFor || game.pendingDrawCount) return;
    if (!numeric(card)) { if (!selected.length) update(state => playCard(state, you.id, card.id), `${names[card.value]} played.`); return; }
    if (!selected.length && !canPlayCard(card, game)) return;
    if (selected.length && (!numeric(card) || game.players[0].hand.find(item => item.id === selected[0])?.value !== card.value)) return;
    setGame(state => ({ ...state, selectedComboCards: selected.includes(card.id) ? selected.filter(id => id !== card.id) : [...selected, card.id] }));
  };
  const playSelected = () => update(state => playCards(state, you.id, state.selectedComboCards), `${selected.length} cards played.`);
  const draw = () => update(state => game.pendingDrawCount ? acceptPendingDraw(state, you.id) : drawCard(state, you.id), game.pendingDrawCount ? "You accepted the draw stack." : "You drew a card.");
  const chooseColor = (color: CardColor) => update(state => selectWildColor(state, you.id, color), `Active color is now ${color}.`);

  useEffect(() => {
    if (isYourTurn || game.gameStatus === "finished" || game.awaitingColorFor) return;
    const timer = window.setTimeout(() => {
      const bot = game.players[game.currentPlayerIndex];
      const playable = getPlayableCards(game, bot.id);
      const choice = playable[0];
      try {
        let next = choice ? playCard(game, bot.id, choice.id) : game.pendingDrawCount ? acceptPendingDraw(game, bot.id) : drawCard(game, bot.id);
        if (next.awaitingColorFor === bot.id) next = selectWildColor(next, bot.id, COLORS[Math.floor(Math.random() * COLORS.length)]);
        setGame(next); setMessage(next.gameStatus === "finished" ? `${bot.name} wins the round.` : choice ? `${bot.name} played ${names[choice.value]}.` : `${bot.name} drew a card.`);
      } catch { setMessage(`${bot.name} could not make a move.`); }
    }, 850);
    return () => window.clearTimeout(timer);
  }, [game, isYourTurn]);

  const colorPick = game.awaitingColorFor === you.id;
  return <main className="game-shell">
    <header><div className="brand"><span>UNO</span> TABLE</div><p>First player to empty their hand wins.</p><button className="new-game" onClick={reset}>New game</button></header>
    <section className="game-board" aria-label="UNO card game">
      <div className="wood-edge" />
      <Opponent player={game.players[1]} className="lena" />
      <Opponent player={game.players[2]} className="milo" />
      <div className="status"><span className={`turn-dot ${isYourTurn ? "you" : ""}`} />{message}{game.pendingDrawCount > 0 && <b className="draw-counter"> +{game.pendingDrawCount}</b>}</div>
      <div className="center-pile"><button className="deck-card" onClick={draw} disabled={!isYourTurn || !!game.awaitingColorFor || game.gameStatus === "finished"} aria-label={game.pendingDrawCount ? `Accept ${game.pendingDrawCount} cards` : "Draw a card"}><img src="/cards/card.png" alt="UNO draw pile" /><em>{game.drawPile.length}</em></button><CardFace card={game.discardPile.at(-1)!} /></div>
      <div className="your-area"><div className="player-label"><b>You</b><small>{you.hand.length} cards</small></div><div className="hand">{you.hand.map(card => { const selectedCard = selected.includes(card.id); const allowed = selectedCard || (!selected.length ? canPlayCard(card, game) : numeric(card) && numeric(you.hand.find(item => item.id === selected[0])!) && card.value === you.hand.find(item => item.id === selected[0])!.value); return <button key={card.id} className={`hand-card ${allowed && isYourTurn ? "playable" : ""} ${selectedCard ? "selected" : ""}`} disabled={!isYourTurn || !allowed || !!game.awaitingColorFor || game.gameStatus === "finished"} onClick={() => toggleCard(card)} aria-label={`Play ${card.color ?? "wild"} ${names[card.value]}`}><CardFace card={card} /></button>; })}</div>{selected.length > 0 && <div className="combo-actions"><button onClick={playSelected}>Play {selected.length} card{selected.length > 1 ? "s" : ""}</button><button onClick={() => setGame(state => ({ ...state, selectedComboCards: [] }))}>Cancel</button></div>}</div>
      {game.gameStatus === "finished" && <div className="winner"><strong>{game.players.find(player => player.id === game.winnerId)?.name} wins!</strong><span>{game.winnerId === you.id ? "That was a clean finish." : "Shuffle up and take another shot."}</span><button onClick={reset}>Play again</button></div>}
      {colorPick && <div className="color-picker"><strong>Choose a color</strong><div>{COLORS.map(color => <button key={color} className={color} onClick={() => chooseColor(color)}>{color}</button>)}</div></div>}
    </section>
  </main>;
}

function Opponent({ player, className }: { player: GameState["players"][number]; className: string }) { return <div className={`opponent ${className}`}><div className="player-label"><b>{player.name}</b><small>{player.hand.length} cards</small></div><div className="card-stack" aria-label={`${player.name} has ${player.hand.length} cards`}>{Array.from({ length: Math.min(player.hand.length, 7) }).map((_, i) => <i key={i}><img src="/cards/card.png" alt="" /></i>)}</div></div>; }
function CardFace({ card }: { card: UnoCard }) { return <img className="card-image" src={`/cards/${cardImage(card)}`} alt={`${card.color ?? "wild"} ${names[card.value]} card`} />; }
