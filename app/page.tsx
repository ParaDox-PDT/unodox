"use client";

import { useEffect, useMemo, useState } from "react";

type Color = "red" | "yellow" | "green" | "blue" | "wild";
type Value = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
type Card = { id: string; color: Color; value: Value };

const colors: Color[] = ["red", "yellow", "green", "blue"];
const symbols: Record<Value, string> = { skip: "⊘", reverse: "↻", draw2: "+2", wild: "★", wild4: "+4", "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9" };
const names: Record<Value, string> = { skip: "Skip", reverse: "Reverse", draw2: "Draw two", wild: "Wild", wild4: "Wild draw four", "0": "0", "1": "1", "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9" };

function shuffle<T>(items: T[]) { return [...items].sort(() => Math.random() - 0.5); }
function createDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;
  for (const color of colors) {
    cards.push({ id: `${color}-${id++}`, color, value: "0" });
    for (const value of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"] as Value[]) {
      cards.push({ id: `${color}-${id++}`, color, value });
      cards.push({ id: `${color}-${id++}`, color, value });
    }
  }
  for (let i = 0; i < 4; i++) cards.push({ id: `wild-${id++}`, color: "wild", value: "wild" }, { id: `wild4-${id++}`, color: "wild", value: "wild4" });
  return shuffle(cards);
}
function canPlay(card: Card, top: Card, active: Color) { return card.color === "wild" || card.color === active || card.value === top.value; }
function newGame() {
  let deck = createDeck();
  let first = deck.pop()!;
  while (first.color === "wild") { deck.unshift(first); deck = shuffle(deck); first = deck.pop()!; }
  return { deck, top: first, hand: deck.splice(-7), left: 7, right: 7, active: first.color as Color };
}

export default function Home() {
  const initial = useMemo(newGame, []);
  const [deck, setDeck] = useState<Card[]>(initial.deck);
  const [top, setTop] = useState<Card>(initial.top);
  const [hand, setHand] = useState<Card[]>(initial.hand);
  const [left, setLeft] = useState(initial.left);
  const [right, setRight] = useState(initial.right);
  const [active, setActive] = useState<Color>(initial.active);
  const [turn, setTurn] = useState<"you" | "lena" | "milo">("you");
  const [message, setMessage] = useState("Your turn — match color, number, or symbol.");
  const [winner, setWinner] = useState<string | null>(null);
  const [colorPick, setColorPick] = useState<Card | null>(null);

  const reset = () => { const game = newGame(); setDeck(game.deck); setTop(game.top); setHand(game.hand); setLeft(game.left); setRight(game.right); setActive(game.active); setTurn("you"); setWinner(null); setColorPick(null); setMessage("Fresh deck. Your turn!"); };
  const takeCards = (count: number) => { const drawn = deck.slice(-count); setDeck(d => d.slice(0, -drawn.length)); return drawn; };
  const afterPlay = (card: Card, player: "you" | "lena" | "milo", chosen?: Color) => {
    setTop(card); setActive(chosen ?? (card.color === "wild" ? active : card.color));
    if (player === "you" && hand.length === 1) { setWinner("You"); setMessage("UNO! You win the round."); return; }
    const next = player === "you" ? "lena" : player === "lena" ? "milo" : "you";
    if (card.value === "skip" || card.value === "reverse") { setTurn(player === "you" ? "milo" : "you"); setMessage("Skip! Next player loses a turn."); }
    else if (card.value === "draw2" || card.value === "wild4") { const amount = card.value === "draw2" ? 2 : 4; if (next === "you") setHand(h => [...h, ...takeCards(amount)]); else if (next === "lena") setLeft(n => n + amount); else setRight(n => n + amount); setTurn(player === "you" ? "milo" : "you"); setMessage(`Draw ${amount}!`); }
    else { setTurn(next); setMessage(next === "you" ? "Your turn." : `${next === "lena" ? "Lena" : "Milo"} is thinking…`); }
  };
  const play = (card: Card) => {
    if (turn !== "you" || winner || !canPlay(card, top, active)) return;
    setHand(h => h.filter(c => c.id !== card.id));
    if (card.color === "wild") { setColorPick(card); return; }
    afterPlay(card, "you");
  };
  const draw = () => {
    if (turn !== "you" || winner || !deck.length) return;
    const drawn = takeCards(1); setHand(h => [...h, ...drawn]); setTurn("lena"); setMessage("You drew a card. Lena is thinking…");
  };
  useEffect(() => {
    if (turn === "you" || winner) return;
    const timer = setTimeout(() => {
      const count = turn === "lena" ? left : right;
      const playable = createDeck().find(c => false); // keeps selection deterministic below
      void playable;
      const botCards = Array.from({ length: count }, (_, index) => ({ id: `${turn}-${index}`, color: colors[index % 4], value: (["1", "4", "7", "skip", "reverse", "draw2"] as Value[])[index % 6] }));
      const choice = botCards.find(card => canPlay(card, top, active));
      if (!choice) { if (turn === "lena") setLeft(n => n + 1); else setRight(n => n + 1); setTurn(turn === "lena" ? "milo" : "you"); setMessage(`${turn === "lena" ? "Lena" : "Milo"} drew a card.`); return; }
      if (turn === "lena") setLeft(n => Math.max(0, n - 1)); else setRight(n => Math.max(0, n - 1));
      if (count === 1) { setWinner(turn === "lena" ? "Lena" : "Milo"); setMessage(`${turn === "lena" ? "Lena" : "Milo"} wins the round.`); return; }
      afterPlay(choice, turn, choice.color === "wild" ? "red" : undefined);
    }, 850);
    return () => clearTimeout(timer);
  }, [turn, winner, top, active, left, right]);

  return <main className="game-shell">
    <header><div className="brand"><span>UNO</span> TABLE</div><p>First player to empty their hand wins.</p><button className="new-game" onClick={reset}>New game</button></header>
    <section className="game-board" aria-label="UNO card game">
      <div className="wood-edge" />
      <div className="opponent lena"><div className="player-label"><b>Lena</b><small>{left} cards</small></div><div className="card-stack" aria-label={`Lena has ${left} cards`}>{Array.from({ length: Math.min(left, 7) }).map((_, i) => <i key={i} />)}</div></div>
      <div className="opponent milo"><div className="player-label"><b>Milo</b><small>{right} cards</small></div><div className="card-stack" aria-label={`Milo has ${right} cards`}>{Array.from({ length: Math.min(right, 7) }).map((_, i) => <i key={i} />)}</div></div>
      <div className="status"><span className={`turn-dot ${turn}`} />{message}</div>
      <div className="center-pile"><button className="deck-card" onClick={draw} aria-label="Draw a card"><span>UNO</span><em>{deck.length}</em></button><CardFace card={top} active={active} /></div>
      <div className="your-area"><div className="player-label"><b>You</b><small>{hand.length} cards</small></div><div className="hand">{hand.map(card => <button key={card.id} className={`hand-card ${canPlay(card, top, active) && turn === "you" ? "playable" : ""}`} onClick={() => play(card)} aria-label={`Play ${card.color} ${names[card.value]}`}><CardFace card={card} active={active} /></button>)}</div></div>
      {winner && <div className="winner"><strong>{winner} wins!</strong><span>{winner === "You" ? "That was a clean finish." : "Shuffle up and take another shot."}</span><button onClick={reset}>Play again</button></div>}
      {colorPick && <div className="color-picker"><strong>Choose a color</strong><div>{colors.map(color => <button key={color} className={color} onClick={() => { const card = colorPick; setColorPick(null); afterPlay(card, "you", color); }}>{color}</button>)}</div></div>}
    </section>
  </main>;
}

function CardFace({ card, active }: { card: Card; active: Color }) { const hue = card.color === "wild" ? active : card.color; return <span className={`card-face ${card.color} ${hue}`}><i>{symbols[card.value]}</i><b>{symbols[card.value]}</b><i>{symbols[card.value]}</i></span>; }
