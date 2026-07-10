"use client";

import { DragEvent, useEffect, useState } from "react";
import { acceptPendingDraw, canPlayCard, CardColor, CardValue, COLORS, createGame, drawCard, GameState, getPlayableCards, playCard, selectWildColor, UnoCard } from "../lib/game/engine";

const names: Record<CardValue, string> = { skip: "Skip", reverse: "Reverse", draw2: "Draw two", wild: "Wild", wild4: "Wild draw four", "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9" };
const cardImage = (card: UnoCard) => card.color === null ? (card.value === "wild4" ? "card_wild_draw4_1.png" : "card_wild_1.png") : `card_${card.value}_${card.color}.png`;

export default function Home() {
  const [game, setGame] = useState<GameState | null>(null);
  const [throwSource, setThrowSource] = useState<"you" | "lena" | "milo" | null>(null);
  const [message, setMessage] = useState("Your turn — play a matching card or draw.");
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const you = game?.players[0];
  const current = game?.players[game.currentPlayerIndex];
  const isYourTurn = Boolean(current && you && current.id === you.id && game?.gameStatus === "playing");

  useEffect(() => {
    const timer = window.setTimeout(() => setGame(createGame()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const reset = () => { setGame(createGame()); setMessage("Fresh deck. Your turn!"); };
  const update = (action: (state: GameState) => GameState, success: string) => setGame(previous => {
    if (!previous) return previous;
    try {
      const next = action(previous);
      setMessage(next.gameStatus === "finished" ? `${next.players.find(player => player.id === next.winnerId)?.name} wins the round.` : success);
      return next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That move is not available.");
      return previous;
    }
  });
  const playHumanCard = (cardId: string) => {
    setThrowSource("you");
    window.setTimeout(() => setThrowSource(null), 650);
    if (you) update(state => playCard(state, you.id, cardId), "Card played.");
  };
  const draw = () => { if (you && game) update(state => state.pendingDrawCount ? acceptPendingDraw(state, you.id) : drawCard(state, you.id), game.pendingDrawCount ? "You accepted the draw stack." : "You drew a card."); };
  const chooseColor = (color: CardColor) => { if (you) update(state => selectWildColor(state, you.id, color), `Active color is now ${color}.`); };
  const startDrag = (event: DragEvent<HTMLButtonElement>, card: UnoCard) => {
    setDraggedCardId(card.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", card.id);
  };
  const dropCard = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const cardId = event.dataTransfer.getData("text/plain") || draggedCardId;
    if (cardId) playHumanCard(cardId);
    setDraggedCardId(null);
  };

  useEffect(() => {
    if (!game || !you || isYourTurn || game.gameStatus === "finished" || game.awaitingColorFor === you.id) return;
    const timer = window.setTimeout(() => {
      const bot = game.players[game.currentPlayerIndex];
      if (game.awaitingColorFor === bot.id) {
        const next = selectWildColor(game, bot.id, COLORS[Math.floor(Math.random() * COLORS.length)]);
        setGame(next); setMessage(`${bot.name} chose ${next.activeColor}.`);
        return;
      }
      const playable = getPlayableCards(game, bot.id);
      const choice = playable[0];
      if (choice) {
        setThrowSource(bot.id === "player-1" ? "lena" : "milo");
        window.setTimeout(() => setThrowSource(null), 750);
      }
      try {
        const next = choice ? playCard(game, bot.id, choice.id) : game.pendingDrawCount ? acceptPendingDraw(game, bot.id) : drawCard(game, bot.id);
        setGame(next); setMessage(next.gameStatus === "finished" ? `${bot.name} wins the round.` : choice ? `${bot.name} played ${names[choice.value]}.` : `${bot.name} drew a card.`);
      } catch { setMessage(`${bot.name} could not make a move.`); }
    }, 1250 + Math.floor(Math.random() * 1600));
    return () => window.clearTimeout(timer);
  }, [game, isYourTurn, you]);

  if (!game || !you) return <main className="game-shell" aria-busy="true" />;

  const top = game.discardPile.at(-1)!;
  const colorPick = game.awaitingColorFor === you.id;
  return <main className="game-shell">
    <header><div className="brand"><span>UNO</span> TABLE</div><p>First player to empty their hand wins.</p><button className="new-game" onClick={reset}>New game</button></header>
    <section className="game-board" aria-label="UNO card game">
      <div className="wood-edge" />
      <Opponent player={game.players[1]} className="lena" active={current?.id === game.players[1].id} throwing={throwSource === "lena"} />
      <Opponent player={game.players[2]} className="milo" active={current?.id === game.players[2].id} throwing={throwSource === "milo"} />
      <div className={`direction-indicator ${game.direction === -1 ? "reverse" : ""}`} aria-label={game.direction === 1 ? "Clockwise play" : "Counter-clockwise play"}><span>↻</span><small>{game.direction === 1 ? "Clockwise" : "Reverse"}</small></div>
      <div className="center-zone">
        <button className="deck-card" onClick={draw} disabled={!isYourTurn || !!game.awaitingColorFor || game.gameStatus === "finished"} aria-label={game.pendingDrawCount ? `Accept ${game.pendingDrawCount} cards` : "Draw a card"}><img src="/cards/card.png" alt="UNO draw pile" /><em>{game.drawPile.length}</em></button>
        <div className={`discard-zone ${draggedCardId ? "drop-ready" : ""}`} onDragOver={event => event.preventDefault()} onDrop={dropCard} aria-label="Drop a card here to play">{game.discardPile.slice(-3, -1).map((card, index) => <CardFace key={card.id} card={card} className={`discard-ghost ghost-${index}`} />)}<CardFace key={top.id} card={top} className={`discard-card from-${throwSource ?? "you"}`} /><span className={`active-color ${game.activeColor}`}>{game.activeColor}</span></div>
      </div>
      <div className="your-area"><div className="player-label"><b>You</b><small>{you.hand.length} cards</small></div><div className="hand">{you.hand.map((card, index) => {
        const allowed = canPlayCard(card, game);
        return <button key={card.id} style={{ animationDelay: `${index * 45}ms` }} className={`hand-card ${allowed && isYourTurn ? "playable" : ""} ${draggedCardId === card.id ? "dragging" : ""}`} disabled={!isYourTurn || !allowed || !!game.awaitingColorFor || game.gameStatus === "finished"} draggable={isYourTurn && allowed} onDragStart={event => startDrag(event, card)} onDragEnd={() => setDraggedCardId(null)} onClick={() => playHumanCard(card.id)} aria-label={`Play ${card.color ?? "wild"} ${names[card.value]}`}><CardFace card={card} /></button>;
      })}</div><p className="game-hint" role="status"><span className={`turn-dot ${isYourTurn ? "you" : ""}`} />{message}{game.pendingDrawCount > 0 && <b className="draw-counter"> +{game.pendingDrawCount}</b>}</p></div>
      {game.gameStatus === "finished" && <div className="winner"><strong>{game.players.find(player => player.id === game.winnerId)?.name} wins!</strong><span>{game.winnerId === you.id ? "That was a clean finish." : "Shuffle up and take another shot."}</span><button onClick={reset}>Play again</button></div>}
      {colorPick && <div className="color-picker"><strong>Choose a color</strong><div>{COLORS.map(color => <button key={color} className={color} onClick={() => chooseColor(color)}>{color}</button>)}</div></div>}
    </section>
  </main>;
}

function Opponent({ player, className, active, throwing }: { player: GameState["players"][number]; className: string; active: boolean; throwing: boolean }) { return <div className={`opponent ${className} ${active ? "active" : ""} ${throwing ? "throwing" : ""}`}><div className="player-label"><b>{player.name}</b><small>{player.hand.length} cards</small></div><div className="card-stack" aria-label={`${player.name} has ${player.hand.length} cards`}>{Array.from({ length: Math.min(player.hand.length, 7) }).map((_, i) => <i key={i}><img src="/cards/card.png" alt="" /></i>)}</div></div>; }
function CardFace({ card, className = "" }: { card: UnoCard; className?: string }) { return <img className={`card-image ${className}`} src={`/cards/${cardImage(card)}`} alt={`${card.color ?? "wild"} ${names[card.value]} card`} />; }
