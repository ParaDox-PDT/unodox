"use client";

/* eslint-disable @next/next/no-img-element -- UNO cards are local sprite assets */

import { type CSSProperties, type DragEvent, useEffect, useMemo, useState } from "react";
import { cardThrowVariables, unoButtonPosition } from "@/lib/game/card-motion";
import { acceptPendingDraw, callUno, canPlayCard, COLORS, drawCard, getPlayableCards, playCard, playCards, selectWildColor, type CardColor, type GameState, type UnoCard } from "@/lib/game/engine";
import { createOfflineGame, randomBotThinkDelay } from "@/lib/game/offline";

const cardNames: Record<UnoCard["value"], string> = { skip: "Skip", reverse: "Reverse", draw2: "Draw two", wild: "Wild", wild4: "Wild draw four", "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9" };
const cardImage = (card: UnoCard) => card.color === null ? (card.value === "wild4" ? "card_wild_draw4_1.png" : "card_wild_1.png") : `card_${card.value}_${card.color}.png`;
const isNumberCard = (card: UnoCard) => /^\d$/.test(card.value);

export function OfflineGame({ onExit }: { onExit: () => void }) {
  const [game, setGame] = useState<GameState>(() => createOfflineGame());
  const [message, setMessage] = useState("Your turn. Play a matching card or draw.");
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [dropAnimation, setDropAnimation] = useState<{ cardId: string; sequence: number; style: CSSProperties } | null>(null);
  const you = game.players[0];
  const current = game.players[game.currentPlayerIndex];
  const bots = useMemo(() => game.players.slice(1), [game.players]);
  const isYourTurn = current.id === you.id && game.gameStatus === "playing";
  const selectedCards = selectedCardIds.map(id => you.hand.find(card => card.id === id)).filter(Boolean) as UnoCard[];
  const selectedValue = selectedCards[0]?.value;
  const unoTarget = game.unoCallWindow ? game.players.find(player => player.id === game.unoCallWindow?.targetPlayerId) : null;
  const unoPosition = unoButtonPosition(game.unoCallWindow?.cardId);

  const reset = () => { setGame(createOfflineGame()); setMessage("New table, new opponents. Your turn!"); setDraggedCardId(null); setSelectedCardIds([]); setDropAnimation(null); };
  const update = (action: (state: GameState) => GameState, success: string) => setGame(previous => {
    try {
      const next = action(previous);
      const winner = next.players.find(player => player.id === next.winnerId);
      setMessage(next.gameStatus === "finished" ? `${winner?.name ?? "A player"} wins the round.` : success);
      return next;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "That move is not available.");
      return previous;
    }
  });
  const play = (cardId: string) => {
    const card = you.hand.find(item => item.id === cardId);
    if (card && canPlayCard(card, game)) setDropAnimation(previousAnimation => ({ cardId, sequence: (previousAnimation?.sequence ?? 0) + 1, style: cardThrowVariables({ isHuman: true }) as CSSProperties }));
    update(state => playCard(state, you.id, cardId), "Card played.");
  };
  const chooseCard = (card: UnoCard) => {
    if (selectedCardIds.includes(card.id)) { setSelectedCardIds(ids => ids.filter(id => id !== card.id)); return; }
    if (selectedValue) {
      if (isNumberCard(card) && card.value === selectedValue) setSelectedCardIds(ids => [...ids, card.id]);
      return;
    }
    const matches = you.hand.filter(held => isNumberCard(held) && held.value === card.value);
    if (isNumberCard(card) && matches.length > 1) setSelectedCardIds([card.id]);
    else play(card.id);
  };
  const playSelected = () => {
    if (!selectedCardIds.length) return;
    const cardIds = [...selectedCardIds]; const finalCardId = cardIds.at(-1)!;
    setSelectedCardIds([]);
    setDropAnimation(previousAnimation => ({ cardId: finalCardId, sequence: (previousAnimation?.sequence ?? 0) + 1, style: cardThrowVariables({ isHuman: true }) as CSSProperties }));
    update(state => cardIds.length === 1 ? playCard(state, you.id, cardIds[0]) : playCards(state, you.id, cardIds), cardIds.length > 1 ? `${cardIds.length} matching cards played together.` : "Card played.");
  };
  const draw = () => update(state => state.pendingDrawCount ? acceptPendingDraw(state, you.id) : drawCard(state, you.id), game.pendingDrawCount ? `You picked up ${game.pendingDrawCount} cards.` : "You drew a card.");
  const choose = (color: CardColor) => update(state => selectWildColor(state, you.id, color), `Active color is ${color}.`);
  const startDrag = (event: DragEvent<HTMLButtonElement>, card: UnoCard) => { setDraggedCardId(card.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); };
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain") || draggedCardId; setDraggedCardId(null); if (id) play(id); };
  const pressUno = () => {
    if (!game.unoCallWindow) return;
    const target = game.players.find(player => player.id === game.unoCallWindow?.targetPlayerId);
    update(state => callUno(state, you.id), target?.id === you.id ? "You called UNO in time!" : `${target?.name ?? "The player"} takes 2 penalty cards.`);
  };

  useEffect(() => {
    if (!game.unoCallWindow || game.gameStatus === "finished") return;
    const timer = window.setTimeout(() => {
      const botsInRace = game.players.slice(1);
      const caller = botsInRace[Math.floor(Math.random() * botsInRace.length)];
      const target = game.players.find(player => player.id === game.unoCallWindow?.targetPlayerId);
      if (!caller || !target) return;
      setMessage(caller.id === target.id ? `${caller.name} called UNO in time!` : `${caller.name} caught ${target.name}; ${target.name} takes 2 cards.`);
      setGame(callUno(game, caller.id));
    }, 650 + Math.random() * 1_350);
    return () => window.clearTimeout(timer);
  }, [game]);

  useEffect(() => {
    if (isYourTurn || game.unoCallWindow || game.gameStatus === "finished") return;
    const timer = window.setTimeout(() => {
      const bot = game.players[game.currentPlayerIndex];
      if (!bot || bot.id === game.players[0].id || game.gameStatus === "finished") return;
      try {
        if (game.awaitingColorFor === bot.id) {
          const color = COLORS[Math.floor(Math.random() * COLORS.length)];
          setMessage(`${bot.name} chose ${color}.`);
          setGame(selectWildColor(game, bot.id, color));
          return;
        }
        const playable = getPlayableCards(game, bot.id);
        if (playable.length) {
          const choice = playable[Math.floor(Math.random() * playable.length)];
          const combo = isNumberCard(choice) ? bot.hand.filter(card => isNumberCard(card) && card.value === choice.value) : [choice];
          const orderedCombo = [choice, ...combo.filter(card => card.id !== choice.id)];
          const finalCard = orderedCombo.at(-1)!;
          const botIndex = bots.findIndex(player => player.id === bot.id);
          setDropAnimation(previousAnimation => ({ cardId: finalCard.id, sequence: (previousAnimation?.sequence ?? 0) + 1, style: cardThrowVariables({ isHuman: false, sourceIndex: botIndex, sourceCount: bots.length }) as CSSProperties }));
          setMessage(orderedCombo.length > 1 ? `${bot.name} played ${orderedCombo.length} matching ${cardNames[choice.value]} cards.` : `${bot.name} played ${cardNames[choice.value]}.`);
          setGame(orderedCombo.length > 1 ? playCards(game, bot.id, orderedCombo.map(card => card.id)) : playCard(game, bot.id, choice.id));
          return;
        }
        setMessage(game.pendingDrawCount ? `${bot.name} accepted the draw stack.` : `${bot.name} drew a card.`);
        setGame(game.pendingDrawCount ? acceptPendingDraw(game, bot.id) : drawCard(game, bot.id));
      } catch {
        setMessage(`${bot.name} could not make a move.`);
      }
    }, randomBotThinkDelay());
    return () => window.clearTimeout(timer);
  }, [bots, game, isYourTurn]);

  const top = game.discardPile.at(-1)!;
  const winner = game.players.find(player => player.id === game.winnerId);
  return <main className="online-shell offline-shell">
    <header className="online-header"><div className="brand"><span>UNO</span> SOLO</div><div className="session-meta"><span className="connection-state"><i className="online" />Offline · 3 bots</span><div className="session-actions"><button onClick={reset}>New game</button><button onClick={onExit}>Modes</button></div></div></header>
    <section className="server-game">
      <div className="game-toolbar"><div><b>Single player</b><span>{isYourTurn ? "Your move" : `${current.name} is thinking…`}</span></div><div className="server-badge offline-badge">OFFLINE · 1P + 3 BOT</div></div>
      <div className="game-board online-board" aria-label="Offline UNO game with three bots">
        <div className="wood-edge" />
        <div className="remote-players">{bots.map(bot => <div key={bot.id} className={`remote-player ${bot.id === current.id ? "active" : ""}`}><div className="player-label"><b>{bot.name}</b><small>{bot.hand.length} cards</small></div><div className="card-stack">{Array.from({ length: Math.min(bot.hand.length, 7) }).map((_, index) => <i key={index}><img src="/cards/card.png" alt="" /></i>)}</div></div>)}</div>
        <div className={`table-turn-banner ${isYourTurn ? "your-turn" : ""}`}><i /><span>{isYourTurn ? "Your turn" : `${current.name} is thinking…`}</span></div>
        <div key={game.direction} className={`table-direction-banner ${game.direction === 1 ? "clockwise" : "counter-clockwise"}`}><strong>{game.direction === 1 ? "↻" : "↺"}</strong><span>{game.direction === 1 ? "Clockwise" : "Counter-clockwise"}</span></div>
        <div className="center-zone">
          <button className="deck-card" onClick={draw} disabled={!isYourTurn || !!selectedCardIds.length || !!game.unoCallWindow || game.hasDrawnCard || !!game.awaitingColorFor || game.gameStatus === "finished"} aria-label={game.pendingDrawCount ? `Accept ${game.pendingDrawCount} cards` : "Draw a card"}><img src="/cards/card.png" alt="UNO draw pile" /><em>{game.drawPile.length}</em>{game.pendingDrawCount > 0 && <strong className="penalty-tag">+{game.pendingDrawCount}</strong>}</button>
          <div className={`discard-zone ${draggedCardId ? "drop-ready" : ""}`} onDragOver={event => event.preventDefault()} onDrop={drop}><OfflineCard key={`${top.id}-${dropAnimation?.cardId === top.id ? dropAnimation.sequence : "idle"}`} card={top} className={`discard-card ${dropAnimation?.cardId === top.id ? "card-drop" : ""}`} style={dropAnimation?.cardId === top.id ? dropAnimation.style : undefined} /><span className={`active-color ${game.activeColor}`}>{game.activeColor}</span></div>
        </div>
        <div className="your-area"><div className="player-label"><b>You</b><small>{you.hand.length} cards</small></div><div className="hand">{you.hand.map((card, index) => { const playable = isYourTurn && !game.unoCallWindow && canPlayCard(card, game); const selectable = Boolean(selectedValue && isYourTurn && !game.unoCallWindow && isNumberCard(card) && card.value === selectedValue); const selected = selectedCardIds.includes(card.id); return <button key={card.id} style={{ animationDelay: `${index * 35}ms` }} className={`hand-card ${playable || selectable ? "playable" : ""} ${selected ? "selected" : ""} ${draggedCardId === card.id ? "dragging" : ""}`} disabled={(!playable && !selectable) || !!game.awaitingColorFor || game.gameStatus === "finished"} draggable={playable && !selectedCardIds.length} onDragStart={event => startDrag(event, card)} onDragEnd={() => setDraggedCardId(null)} onClick={() => chooseCard(card)}><OfflineCard card={card} /></button>; })}</div><div className="game-actions">{selectedCardIds.length > 0 && <><button className="combo-play-button" onClick={playSelected}>Play {selectedCardIds.length}{selectedCardIds.length > 1 ? " together" : " card"}</button><button className="combo-cancel-button" onClick={() => setSelectedCardIds([])}>Cancel</button></>}</div><p className="game-hint" role="status"><span className={`turn-dot ${isYourTurn ? "you" : ""}`} />{selectedCardIds.length ? "Select every matching number you want, then play them together." : message}</p></div>
        {game.unoCallWindow && <button className="uno-race-button" style={unoPosition} onClick={pressUno} aria-label={unoTarget?.id === you.id ? "Call UNO" : `Catch ${unoTarget?.name ?? "player"} without UNO`}>UNO!</button>}
        {game.awaitingColorFor === you.id && <div className="color-picker"><strong>Choose the active color</strong><div>{COLORS.map(color => <button key={color} className={color} onClick={() => choose(color)}>{color}</button>)}</div></div>}
        {game.gameStatus === "finished" && <div className="winner"><strong>{winner?.name ?? "A player"} wins!</strong><span>{winner?.id === you.id ? "You cleared your hand." : "Try another table with new bot names."}</span><button onClick={reset}>Play again</button></div>}
      </div>
    </section>
  </main>;
}

function OfflineCard({ card, className = "", style }: { card: UnoCard; className?: string; style?: CSSProperties }) {
  return <img className={`card-image ${className}`} style={style} src={`/cards/${cardImage(card)}`} alt={`${card.color ?? "wild"} ${cardNames[card.value]} card`} />;
}
