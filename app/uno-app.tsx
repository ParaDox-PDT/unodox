"use client";

/* eslint-disable @next/next/no-img-element -- card sprites are fixed local game assets */

import { type CSSProperties, type DragEvent, type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { backendApi, BackendError, loadSession, saveSession } from "@/lib/backend/api-client";
import { cardAssetName, cardLabel, GAME_EVENTS, type AuthSession, type CardColor, type NumberEffectNotice, type PlayerPrivateGameState, type PublicRoomSummary, type Room, type UnoCard } from "@/lib/backend/contracts";
import { createGameSocket, emitCommand } from "@/lib/backend/game-socket";
import { cardThrowVariables, tapButtonPosition, unoButtonPosition } from "@/lib/game/card-motion";
import { OfflineGame } from "./offline-game";

const COLORS: CardColor[] = ["red", "yellow", "green", "blue"];
const isNumberCard = (card: UnoCard) => card.type === "number" && card.value !== null;
const cardAssetUrls = [
  "/cards/card.png",
  ...COLORS.flatMap(color => ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"].map(value => `/cards/card_${value}_${color}.png`)),
  "/cards/card_wild_1.png",
  "/cards/card_wild_draw4_1.png",
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function newerGame(previous: PlayerPrivateGameState | null, next: PlayerPrivateGameState | null): PlayerPrivateGameState | null {
  if (!next || (previous && next.gameId === previous.gameId && next.version < previous.version)) return previous;
  return next;
}

function effectMessage(effect: NumberEffectNotice, players: PlayerPrivateGameState["players"]): string {
  const name = (userId: string) => players.find(player => player.userId === userId)?.displayName ?? "Player";
  switch (effect.type) {
    case "hands_rotated": return `${name(effect.actorUserId)} played 0. Every hand moved around the table.`;
    case "hand_peeked": return effect.targetUserId ? `${name(effect.actorUserId)} privately viewed ${name(effect.targetUserId)}'s hand.` : `${name(effect.actorUserId)} used a private hand peek.`;
    case "hands_swapped": return `${name(effect.actorUserId)} swapped hands with ${name(effect.targetUserId)}.`;
    case "hand_swap_skipped": return `${name(effect.actorUserId)} kept their hand.`;
    case "tap_penalty": return effect.penalties.map(penalty => `${name(penalty.userId)} +${penalty.amount}`).join("  ");
  }
}

function handEffectClass(effect: NumberEffectNotice | null, userId: string): string {
  if (!effect) return "";
  if (effect.type === "hands_rotated") return "hand-rotating";
  if (effect.type === "hands_swapped" && [effect.actorUserId, effect.targetUserId].includes(userId)) return "hand-swapping";
  if (effect.type === "tap_penalty" && effect.penalties.some(penalty => penalty.userId === userId)) return "hand-penalty";
  return "";
}

export function UnoApp() {
  const [offline, setOffline] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [booting, setBooting] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [game, setGame] = useState<PlayerPrivateGameState | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    cardAssetUrls.forEach(url => { const image = new Image(); image.src = url; });
    const stored = loadSession();
    if (!stored) { queueMicrotask(() => setBooting(false)); return; }
    backendApi.me()
      .then(user => {
        const active = loadSession();
        if (!active) return;
        const next = { ...active, user };
        saveSession(next);
        setSession(next);
      })
      .catch(() => saveSession(null))
      .finally(() => setBooting(false));
  }, []);

  const acceptRoom = useCallback((next: Room | null) => {
    setRoom(previous => !next || !previous || next.id !== previous.id || next.version >= previous.version ? next : previous);
  }, []);

  useEffect(() => {
    if (!session || offline) return;
    const nextSocket = createGameSocket(session.tokens.accessToken);
    socketRef.current = nextSocket;
    const sync = async () => {
      setConnected(true);
      try {
        const [currentRoom, currentGame] = await Promise.all([
          emitCommand<Room | null>(nextSocket, GAME_EVENTS.roomSync),
          emitCommand<PlayerPrivateGameState | null>(nextSocket, GAME_EVENTS.gameSync),
        ]);
        acceptRoom(currentRoom);
        setGame(previous => newerGame(previous, currentGame));
      } catch (error) { setNotice(errorMessage(error)); }
    };
    nextSocket.on("connect", sync);
    nextSocket.on("disconnect", () => setConnected(false));
    nextSocket.on("connect_error", error => {
      setConnected(false);
      try { setNotice(JSON.parse(error.message).message ?? "Could not connect to the game server."); }
      catch { setNotice(error.message || "Could not connect to the game server."); }
    });
    nextSocket.on(GAME_EVENTS.roomUpdated, ({ room: updated }: { room: Room }) => acceptRoom(updated));
    nextSocket.on(GAME_EVENTS.roomReconnected, (ack: { data?: Room }) => { if (ack.data) acceptRoom(ack.data); });
    nextSocket.on(GAME_EVENTS.gamePrivateState, (state: PlayerPrivateGameState) => setGame(previous => newerGame(previous, state)));
    nextSocket.on(GAME_EVENTS.roomKicked, () => { setRoom(null); setGame(null); setNotice("You were removed from the room."); });
    nextSocket.on(GAME_EVENTS.roomClosed, () => { setRoom(null); setGame(null); setNotice("The room was closed."); });
    nextSocket.on("exception", (error: { message?: string }) => setNotice(error?.message ?? "The server rejected that action."));
    return () => { nextSocket.removeAllListeners(); nextSocket.disconnect(); if (socketRef.current === nextSocket) socketRef.current = null; };
  }, [acceptRoom, offline, session]);

  useEffect(() => {
    if (!session) return;
    const expiresAt = new Date(session.tokens.accessTokenExpiresAt).getTime();
    const delay = Math.max(1_000, expiresAt - Date.now() - 60_000);
    const timer = window.setTimeout(() => {
      backendApi.refreshSession()
        .then(setSession)
        .catch(() => { saveSession(null); setSession(null); setRoom(null); setGame(null); });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [session]);

  const refreshRooms = useCallback(async () => {
    try { setRooms(await backendApi.rooms()); }
    catch (error) { setNotice(errorMessage(error)); }
  }, []);

  useEffect(() => {
    if (!session || offline || room) return;
    queueMicrotask(() => void refreshRooms());
    const timer = window.setInterval(refreshRooms, 10_000);
    return () => window.clearInterval(timer);
  }, [refreshRooms, offline, room, session]);

  const command = useCallback(async <T,>(event: string, payload?: unknown): Promise<T> => {
    const activeSocket = socketRef.current;
    if (!activeSocket?.connected) throw new BackendError("SOCKET_DISCONNECTED", "Waiting for the game server connection.");
    setNotice("");
    try { return await emitCommand<T>(activeSocket, event, payload); }
    catch (error) { setNotice(errorMessage(error)); throw error; }
  }, []);

  const returnToMainMenu = useCallback(async () => {
    await command<Room | null>(GAME_EVENTS.roomLeave);
    setGame(null);
    acceptRoom(null);
    await refreshRooms();
  }, [acceptRoom, command, refreshRooms]);

  const authenticated = (next: AuthSession) => { setSession(next); setNotice(""); };
  const logout = async () => {
    socketRef.current?.disconnect();
    await backendApi.logout().catch(() => undefined);
    setSession(null); setRoom(null); setGame(null); setRooms([]); setNotice("");
  };

  if (booting) return <main className="loading-screen" aria-busy="true"><span className="uno-mark">UNO</span><p>Loading your table…</p></main>;
  if (offline) return <OfflineGame onExit={() => setOffline(false)} />;
  if (!session) return <AuthScreen onAuthenticated={authenticated} onOffline={() => setOffline(true)} />;

  const shell = (content: React.ReactNode) => <main className="online-shell">
    <header className="online-header">
      <div className="brand"><span>UNO</span> ONLINE</div>
      <div className="session-meta"><span className="connection-state"><i className={connected ? "online" : "offline"} />{connected ? "Connected" : "Reconnecting"}</span><b className="session-name" title={session.user.displayName}>{session.user.displayName}</b><div className="session-actions"><button onClick={() => setOffline(true)}>Single player</button><button onClick={logout}>Log out</button></div></div>
    </header>
    {notice && <div className="global-notice" role="alert">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    {content}
  </main>;

  if (game) return shell(<GameTable userId={session.user.id} game={game} command={command} onGame={next => setGame(previous => newerGame(previous, next))} onMainMenu={returnToMainMenu} />);
  if (room) return shell(<RoomScreen userId={session.user.id} room={room} connected={connected} command={command} onRoom={acceptRoom} onGame={next => setGame(previous => newerGame(previous, next))} />);
  return shell(<LobbyScreen userType={session.user.type} rooms={rooms} connected={connected} command={command} onRoom={acceptRoom} onRefresh={refreshRooms} />);
}

function AuthScreen({ onAuthenticated, onOffline }: { onAuthenticated: (session: AuthSession) => void; onOffline: () => void }) {
  const [mode, setMode] = useState<"guest" | "login" | "register">("guest");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const next = mode === "guest" ? await backendApi.guest(displayName) : mode === "login" ? await backendApi.login(email, password) : await backendApi.register(email, password, displayName);
      onAuthenticated(next);
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };
  return <main className="auth-shell">
    <section className="auth-hero"><div className="hero-logo">UNO</div><p>Play the real table. Every card, turn and win is synced by the server.</p><div className="floating-cards"><img src="/cards/card_reverse_red.png" alt="" /><img src="/cards/card_wild_1.png" alt="" /><img src="/cards/card_draw2_blue.png" alt="" /></div></section>
    <section className="auth-card">
      <div className="auth-tabs">{(["guest", "login", "register"] as const).map(item => <button key={item} className={mode === item ? "active" : ""} onClick={() => { setMode(item); setError(""); }}>{item === "guest" ? "Quick play" : item}</button>)}</div>
      <h1>{mode === "guest" ? "Take a seat" : mode === "login" ? "Welcome back" : "Create your player"}</h1>
      <p>{mode === "guest" ? "No account needed. Pick a table name and jump in." : mode === "login" ? "Continue with your registered player." : "Keep your name across games and devices."}</p>
      <form onSubmit={submit}>
        {mode !== "login" && <label>Display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} minLength={2} maxLength={24} placeholder="Card Shark" required /></label>}
        {mode !== "guest" && <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} placeholder="you@example.com" required /></label>}
        {mode !== "guest" && <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={mode === "register" ? 8 : 1} maxLength={72} placeholder={mode === "register" ? "8+ chars, letters and numbers" : "Your password"} required /></label>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="primary-action" disabled={busy}>{busy ? "Connecting…" : mode === "guest" ? "Play online as guest" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <div className="mode-divider"><span>or</span></div>
      <button className="offline-action" onClick={onOffline}><b>Play single player</b><span>Offline · You against 3 random bots</span></button>
    </section>
  </main>;
}

function LobbyScreen({ userType, rooms, connected, command, onRoom, onRefresh }: { userType: string; rooms: PublicRoomSummary[]; connected: boolean; command: <T>(event: string, payload?: unknown) => Promise<T>; onRoom: (room: Room | null) => void; onRefresh: () => Promise<void> }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState("");
  const create = async (event: FormEvent) => { event.preventDefault(); setBusy("create"); try { onRoom(await command<Room>(GAME_EVENTS.roomCreate, { name: name || undefined, visibility, configuration: { minPlayers: 2, maxPlayers, allowGuests: true } })); } finally { setBusy(""); } };
  const joinCode = async (event: FormEvent) => { event.preventDefault(); setBusy("code"); try { onRoom(await command<Room>(GAME_EVENTS.roomJoinByCode, { code: code.replaceAll(/\s/g, "").toUpperCase() })); } finally { setBusy(""); } };
  const join = async (roomId: string) => { setBusy(roomId); try { onRoom(await command<Room>(GAME_EVENTS.roomJoin, { roomId })); } finally { setBusy(""); } };
  return <div className="lobby-grid">
    <section className="lobby-main panel">
      <div className="panel-heading"><div><small>LIVE TABLES</small><h1>Choose your room</h1></div><button className="icon-button" onClick={onRefresh} aria-label="Refresh rooms">↻</button></div>
      {!connected && <div className="empty-state">Connecting to the game server…</div>}
      {connected && rooms.length === 0 && <div className="empty-state"><b>No public rooms yet</b><span>Create the first one or join a private table with its code.</span></div>}
      <div className="room-list">{rooms.map(item => <article key={item.id}>
        <div className="room-icon">{item.name.slice(0, 1).toUpperCase()}</div><div><b>{item.name}</b><span>{item.status.replaceAll("_", " ")} · {item.allowGuests ? "Guests welcome" : "Members only"}</span></div><strong>{item.playerCount}/{item.maxPlayers}</strong><button disabled={!connected || busy === item.id || item.playerCount >= item.maxPlayers || item.status === "in_game"} onClick={() => join(item.id)}>{busy === item.id ? "Joining…" : "Join"}</button>
      </article>)}</div>
    </section>
    <aside className="lobby-side">
      <section className="panel join-code"><small>PRIVATE ROOM</small><h2>Have a code?</h2><form onSubmit={joinCode}><input value={code} onChange={event => setCode(event.target.value.toUpperCase())} minLength={6} maxLength={6} placeholder="7K9M2P" required /><button disabled={!connected || busy === "code"}>{busy === "code" ? "…" : "Join"}</button></form></section>
      <section className="panel create-room"><button className="create-toggle" onClick={() => setCreating(value => !value)}><span>＋</span><div><b>Create a room</b><small>Public or invite-only table</small></div></button>{creating && <form onSubmit={create}><label>Room name<input value={name} onChange={event => setName(event.target.value)} maxLength={40} placeholder="Friday night UNO" /></label><div className="split-fields"><label>Visibility<select value={visibility} onChange={event => setVisibility(event.target.value as "public" | "private")}><option value="public">Public</option><option value="private">Private</option></select></label><label>Seats<select value={maxPlayers} onChange={event => setMaxPlayers(Number(event.target.value))}>{[2, 3, 4, 5, 6, 7, 8].map(count => <option key={count}>{count}</option>)}</select></label></div><button className="primary-action" disabled={!connected || busy === "create"}>{busy === "create" ? "Creating…" : "Create table"}</button></form>}</section>
      {userType === "GUEST" && <p className="guest-note">You are playing as a guest. Some hosts may restrict their rooms to registered players.</p>}
    </aside>
  </div>;
}

function RoomScreen({ userId, room, connected, command, onRoom, onGame }: { userId: string; room: Room; connected: boolean; command: <T>(event: string, payload?: unknown) => Promise<T>; onRoom: (room: Room | null) => void; onGame: (game: PlayerPrivateGameState | null) => void }) {
  const [busy, setBusy] = useState("");
  const me = room.players.find(player => player.userId === userId);
  const owner = room.ownerId === userId;
  const act = async (name: string, action: () => Promise<void>) => { setBusy(name); try { await action(); } finally { setBusy(""); } };
  const ready = () => act("ready", async () => onRoom(await command<Room>(GAME_EVENTS.roomReady, { isReady: !me?.isReady })));
  const leave = () => act("leave", async () => { await command<Room | null>(GAME_EVENTS.roomLeave); onRoom(null); });
  const close = () => act("close", async () => { await command<Room>(GAME_EVENTS.roomClose); onRoom(null); });
  const start = () => act("start", async () => onGame(await command<PlayerPrivateGameState>(GAME_EVENTS.gameStart)));
  return <div className="room-wait panel">
    <div className="room-wait-head"><div><small>{room.visibility.toUpperCase()} ROOM</small><h1>{room.name}</h1><p>{room.code ? <>Invite code <button className="room-code" onClick={() => navigator.clipboard.writeText(room.code!)}>{room.code}</button></> : "Anyone in the public lobby can join."}</p></div><div className={`room-status ${room.status}`}>{room.status.replaceAll("_", " ")}</div></div>
    <div className="seat-grid">{Array.from({ length: room.configuration.maxPlayers }).map((_, index) => { const player = room.players[index]; return player ? <article key={player.userId} className={`${player.isReady ? "ready" : ""} ${player.status}`}><div className="avatar">{player.displayName.slice(0, 1).toUpperCase()}</div><div><b>{player.displayName}{player.userId === userId ? " (you)" : ""}</b><span>{player.isOwner ? "Host" : player.status === "disconnected" ? "Reconnecting" : player.isReady ? "Ready" : "Not ready"}</span></div>{player.isReady && <i>✓</i>}</article> : <article key={index} className="empty-seat"><div className="avatar">＋</div><span>Waiting for player</span></article>; })}</div>
    <div className="room-actions"><button className={me?.isReady ? "secondary-action" : "primary-action"} disabled={!connected || !!busy} onClick={ready}>{busy === "ready" ? "Saving…" : me?.isReady ? "Not ready" : "I’m ready"}</button>{owner && <button className="start-action" disabled={!connected || !!busy || room.status !== "ready_to_start"} onClick={start}>{busy === "start" ? "Starting…" : "Start game"}</button>}<button className="text-action" disabled={!!busy} onClick={owner ? close : leave}>{owner ? "Close room" : "Leave room"}</button></div>
    <p className="ready-help">All connected players must be ready. The host starts when at least {room.configuration.minPlayers} players are seated.</p>
  </div>;
}

function GameTable({ userId, game, command, onGame, onMainMenu }: { userId: string; game: PlayerPrivateGameState; command: <T>(event: string, payload?: unknown) => Promise<T>; onGame: (game: PlayerPrivateGameState) => void; onMainMenu: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [returningToMenu, setReturningToMenu] = useState(false);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [mustPlayDrawn, setMustPlayDrawn] = useState(false);
  const [turnNotice, setTurnNotice] = useState("");
  const [activeEffect, setActiveEffect] = useState<NumberEffectNotice | null>(null);
  const [activeReveal, setActiveReveal] = useState<PlayerPrivateGameState["privateHandReveal"]>(null);
  const [dropAnimation, setDropAnimation] = useState<{ cardId: string; sequence: number; style: CSSProperties } | null>(null);
  const previousGame = useRef(game);
  const lastSeenTurnNotice = useRef("");
  const turnNoticeTimer = useRef<number | null>(null);
  const lastSeenEffect = useRef("");
  const effectTimer = useRef<number | null>(null);
  const me = game.players.find(player => player.userId === userId);
  const current = game.players.find(player => player.userId === game.currentPlayerId);
  const opponents = useMemo(() => game.players.filter(player => player.userId !== userId).sort((a, b) => a.seatIndex - b.seatIndex), [game.players, userId]);
  const isYourTurn = game.currentPlayerId === userId && game.status !== "finished";
  const selectedCards = selectedCardIds.map(id => game.ownHand.find(card => card.id === id)).filter(Boolean) as UnoCard[];
  const selectedValue = selectedCards[0]?.value;
  const unoTarget = game.unoCallWindow ? game.players.find(player => player.userId === game.unoCallWindow?.targetUserId) : null;
  const unoPosition = unoButtonPosition(game.unoCallWindow?.cardId);
  const tapPosition = game.tapChallenge ? tapButtonPosition(game.tapChallenge.id, userId) : undefined;
  useEffect(() => {
    const effect = game.lastNumberEffect;
    if (!effect || lastSeenEffect.current === effect.id) return;
    lastSeenEffect.current = effect.id;
    queueMicrotask(() => setActiveEffect(effect));
    if (effectTimer.current !== null) window.clearTimeout(effectTimer.current);
    effectTimer.current = window.setTimeout(() => {
      setActiveEffect(currentEffect => currentEffect?.id === effect.id ? null : currentEffect);
      effectTimer.current = null;
    }, 2_800);
  }, [game.lastNumberEffect]);
  useEffect(() => {
    const reveal = game.privateHandReveal;
    if (!reveal) { queueMicrotask(() => setActiveReveal(null)); return; }
    const remaining = Math.max(0, new Date(reveal.expiresAt).getTime() - Date.now());
    queueMicrotask(() => setActiveReveal(remaining > 0 ? reveal : null));
    const timer = window.setTimeout(() => setActiveReveal(null), remaining);
    return () => window.clearTimeout(timer);
  }, [game.privateHandReveal]);
  useEffect(() => {
    const notice = game.lastTurnNotice;
    if (!notice) return;
    const noticeKey = `${game.gameId}:${notice.turnNumber}:${notice.userId}:${notice.type}`;
    if (lastSeenTurnNotice.current === noticeKey) return;
    lastSeenTurnNotice.current = noticeKey;
    const player = game.players.find(item => item.userId === notice.userId);
    setTurnNotice(`${player?.displayName ?? "Player"} drew an unplayable card. Turn passed.`);
    if (turnNoticeTimer.current !== null) window.clearTimeout(turnNoticeTimer.current);
    turnNoticeTimer.current = window.setTimeout(() => { setTurnNotice(""); turnNoticeTimer.current = null; }, 3_200);
  }, [game.gameId, game.lastTurnNotice, game.players]);
  useEffect(() => () => {
    if (turnNoticeTimer.current !== null) window.clearTimeout(turnNoticeTimer.current);
    if (effectTimer.current !== null) window.clearTimeout(effectTimer.current);
  }, []);
  useEffect(() => {
    const previous = previousGame.current;
    previousGame.current = game;
    if (previous.gameId !== game.gameId || previous.topDiscardCard.id === game.topDiscardCard.id) return;
    const actor = game.players.find(player => {
      const before = previous.players.find(item => item.userId === player.userId);
      return before && before.handCount > player.handCount;
    });
    const sourceIndex = actor ? opponents.findIndex(player => player.userId === actor.userId) : -1;
    const style = cardThrowVariables({ isHuman: actor?.userId === userId, sourceIndex: sourceIndex >= 0 ? sourceIndex : undefined, sourceCount: opponents.length }) as CSSProperties;
    queueMicrotask(() => setDropAnimation(previousAnimation => ({ cardId: game.topDiscardCard.id, sequence: (previousAnimation?.sequence ?? 0) + 1, style })));
  }, [game, opponents, userId]);
  const apply = async (event: string, payload: Record<string, unknown>, success: string) => {
    setBusy(true); setMessage("");
    try { const next = await command<PlayerPrivateGameState>(event, { gameId: game.gameId, actionId: crypto.randomUUID(), ...payload }); onGame(next); setMessage(success); return next; }
    catch (error) { setMessage(errorMessage(error)); return null; }
    finally { setBusy(false); }
  };
  const play = async (cardId: string) => { if (!game.playableCardIds.includes(cardId)) return; setSelectedCardIds([]); setMustPlayDrawn(false); await apply(GAME_EVENTS.playCard, { cardId }, "Card played."); };
  const chooseCard = (card: UnoCard) => {
    if (selectedCardIds.includes(card.id)) { setSelectedCardIds(ids => ids.filter(id => id !== card.id)); return; }
    if (selectedValue !== undefined) {
      if (isNumberCard(card) && card.value === selectedValue) setSelectedCardIds(ids => [...ids, card.id]);
      return;
    }
    const matches = game.ownHand.filter(held => isNumberCard(held) && held.value === card.value);
    if (isNumberCard(card) && matches.length > 1) setSelectedCardIds([card.id]);
    else void play(card.id);
  };
  const playSelected = async () => {
    if (!selectedCardIds.length) return;
    const cardIds = [...selectedCardIds]; setSelectedCardIds([]); setMustPlayDrawn(false);
    await apply(cardIds.length > 1 ? GAME_EVENTS.playCards : GAME_EVENTS.playCard, cardIds.length > 1 ? { cardIds } : { cardId: cardIds[0] }, cardIds.length > 1 ? `${cardIds.length} matching cards played together.` : "Card played.");
  };
  const draw = async () => { const penalty = game.canAcceptDrawPenalty; const next = await apply(GAME_EVENTS.drawCard, {}, penalty ? "Draw penalty accepted." : "Card drawn."); setMustPlayDrawn(Boolean(next && next.currentPlayerId === userId && next.status !== "finished")); };
  const choose = async (color: CardColor) => { await apply(GAME_EVENTS.chooseColor, { color }, `Active color is ${color}.`); };
  const callUno = async () => {
    if (!game.unoCallWindow) return;
    const targetUserId = game.unoCallWindow.targetUserId;
    const next = await apply(GAME_EVENTS.callUno, {}, "UNO race resolved.");
    const target = next?.players.find(player => player.userId === targetUserId);
    if (target) setMessage(target.handCount > 1 ? `${target.displayName} takes 2 penalty cards.` : `${target.displayName} called UNO in time!`);
  };
  const selectEffectTarget = async (targetUserId: string) => {
    const kind = game.pendingNumberEffect?.kind;
    await apply(GAME_EVENTS.selectNumberEffectTarget, { targetUserId }, kind === "peek" ? "Private hand view opened for 5 seconds." : "Hands swapped.");
  };
  const skipEffect = async () => { await apply(GAME_EVENTS.skipNumberEffect, {}, "You kept your hand."); };
  const tap = async () => {
    if (!game.tapChallenge || game.tapChallenge.hasTapped) return;
    const next = await apply(GAME_EVENTS.tapChallenge, { challengeId: game.tapChallenge.id }, "Tap locked.");
    if (next?.tapChallenge) setMessage("Tap locked. Waiting for the other players.");
  };
  const returnToMenu = async () => {
    setReturningToMenu(true); setMessage("");
    try { await onMainMenu(); }
    catch (error) { setMessage(errorMessage(error)); setReturningToMenu(false); }
  };
  const startDrag = (event: DragEvent<HTMLButtonElement>, card: UnoCard) => { setDraggedCardId(card.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", card.id); };
  const drop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); const id = event.dataTransfer.getData("text/plain") || draggedCardId; setDraggedCardId(null); if (id) void play(id); };
  const winner = game.players.find(player => player.userId === game.winnerUserId);
  const revealTarget = activeReveal ? game.players.find(player => player.userId === activeReveal.targetUserId) : null;
  const pendingActor = game.pendingNumberEffect ? game.players.find(player => player.userId === game.pendingNumberEffect?.actorUserId) : null;
  const specialHint = game.pendingNumberEffect
    ? game.pendingNumberEffect.canChooseTarget
      ? game.pendingNumberEffect.kind === "peek" ? "Choose one hand to view privately." : "Choose a player to swap with, or keep your hand."
      : `Waiting for ${pendingActor?.displayName ?? "the player"} to choose.`
    : game.tapChallenge
      ? game.tapChallenge.hasTapped ? "Your TAP is locked. Waiting for everyone else." : "Find and press TAP before the other players."
      : "";
  return <section className="server-game">
    <div className="game-toolbar"><div><b>Turn {game.turnNumber}</b><span>{isYourTurn ? "Your move" : `${current?.displayName ?? "Player"} is playing`}</span></div><div className="server-badge">SERVER · v{game.version}</div></div>
    <div className="game-board online-board" aria-label="Online UNO card game">
      <div className="wood-edge" />
      <div className="remote-players">{opponents.map(player => <RemotePlayer key={player.userId} player={player} active={player.userId === game.currentPlayerId} effectClass={handEffectClass(activeEffect, player.userId)} />)}</div>
      <div className={`table-turn-banner ${isYourTurn ? "your-turn" : ""}`}><i /><span>{isYourTurn ? "Your turn" : `${current?.displayName ?? "Player"}'s turn`}</span></div>
      {turnNotice && <div className="turn-pass-notice" role="status" aria-live="polite">{turnNotice}</div>}
      <div key={game.direction} className={`table-direction-banner ${game.direction.replace("_", "-")}`}><strong>{game.direction === "clockwise" ? "↻" : "↺"}</strong><span>{game.direction === "clockwise" ? "Clockwise" : "Counter-clockwise"}</span></div>
      <div className="center-zone">
        <button className="deck-card" onClick={draw} disabled={busy || !!selectedCardIds.length || !!game.unoCallWindow || mustPlayDrawn || (!game.canDraw && !game.canAcceptDrawPenalty) || game.canChooseColor || game.status === "finished"} aria-label={game.canAcceptDrawPenalty ? "Accept draw penalty" : "Draw a card"}><img src="/cards/card.png" alt="UNO draw pile" /><em>{game.drawPileCount}</em>{game.canAcceptDrawPenalty && <strong className="penalty-tag">Take</strong>}</button>
        <div className={`discard-zone ${draggedCardId ? "drop-ready" : ""}`} onDragOver={event => event.preventDefault()} onDrop={drop}><CardFace key={`${game.topDiscardCard.id}-${dropAnimation?.cardId === game.topDiscardCard.id ? dropAnimation.sequence : "idle"}`} card={game.topDiscardCard} className={`discard-card ${dropAnimation?.cardId === game.topDiscardCard.id ? "card-drop" : ""}`} style={dropAnimation?.cardId === game.topDiscardCard.id ? dropAnimation.style : undefined} /><span className={`active-color ${game.currentColor}`}>{game.currentColor}</span></div>
      </div>
      <div className={`your-area ${handEffectClass(activeEffect, userId)}`}><div className="player-label"><b>{me?.displayName ?? "You"}</b><small>{game.ownHand.length} cards</small></div><div className="hand">{game.ownHand.map((card, index) => { const playable = game.playableCardIds.includes(card.id); const selectable = Boolean(selectedValue !== undefined && isYourTurn && !game.unoCallWindow && !game.pendingNumberEffect && !game.tapChallenge && isNumberCard(card) && card.value === selectedValue); const selected = selectedCardIds.includes(card.id); return <button key={card.id} style={{ animationDelay: `${index * 35}ms` }} className={`hand-card ${(playable && isYourTurn) || selectable ? "playable" : ""} ${selected ? "selected" : ""} ${draggedCardId === card.id ? "dragging" : ""}`} disabled={busy || !isYourTurn || (!playable && !selectable) || !!game.unoCallWindow || !!game.pendingNumberEffect || !!game.tapChallenge || game.canChooseColor || game.status === "finished"} draggable={!busy && isYourTurn && playable && !selectedCardIds.length} onDragStart={event => startDrag(event, card)} onDragEnd={() => setDraggedCardId(null)} onClick={() => chooseCard(card)}><CardFace card={card} /></button>; })}</div><div className="game-actions">{selectedCardIds.length > 0 && !game.unoCallWindow && !game.pendingNumberEffect && !game.tapChallenge && <><button className="combo-play-button" disabled={busy} onClick={playSelected}>Play {selectedCardIds.length}{selectedCardIds.length > 1 ? " together" : " card"}</button><button className="combo-cancel-button" disabled={busy} onClick={() => setSelectedCardIds([])}>Cancel</button></>}</div><p className="game-hint" role="status"><span className={`turn-dot ${isYourTurn ? "you" : ""}`} />{selectedCardIds.length ? "Select every matching number you want, then play them together." : specialHint || message || (mustPlayDrawn ? "Play the card you drew to finish your turn." : isYourTurn ? game.canAcceptDrawPenalty ? "Stack a matching draw card or take the penalty." : "Play a highlighted card or draw." : `Waiting for ${current?.displayName ?? "the next player"}…`)}</p></div>
      {game.unoCallWindow && <button className="uno-race-button" style={unoPosition} disabled={busy} onClick={callUno} aria-label={game.unoCallWindow.targetUserId === userId ? "Call UNO" : `Catch ${unoTarget?.displayName ?? "player"} without UNO`}>UNO!</button>}
      {game.canChooseColor && <div className="color-picker"><strong>Choose the active color</strong><div>{COLORS.map(color => <button key={color} className={color} disabled={busy} onClick={() => choose(color)}>{color}</button>)}</div></div>}
      {game.pendingNumberEffect?.canChooseTarget && <div className="number-effect-picker" role="dialog" aria-modal="true" aria-label={game.pendingNumberEffect.kind === "peek" ? "Choose a hand to view" : "Choose a player to swap hands with"}><div className="number-effect-card"><span className="effect-number">{game.pendingNumberEffect.kind === "peek" ? "1" : "7"}</span><div><strong>{game.pendingNumberEffect.kind === "peek" ? "Choose a hand to view" : "Choose your swap"}</strong><p>{game.pendingNumberEffect.kind === "peek" ? "Only you will see the selected cards for 5 seconds." : "Both complete hands will change places immediately."}</p></div><div className="effect-targets">{game.pendingNumberEffect.eligibleTargetUserIds.map(targetUserId => { const target = game.players.find(player => player.userId === targetUserId); return <button key={targetUserId} disabled={busy} onClick={() => selectEffectTarget(targetUserId)}><span>{target?.displayName.slice(0, 1).toUpperCase()}</span><b>{target?.displayName ?? "Player"}</b><small>{target?.handCount ?? 0} cards</small></button>; })}</div>{game.pendingNumberEffect.canSkip && <button className="effect-skip" disabled={busy} onClick={skipEffect}>Keep my hand</button>}</div></div>}
      {game.tapChallenge && <button className={`tap-challenge-button ${game.tapChallenge.hasTapped ? "locked" : ""}`} style={tapPosition} disabled={busy || game.tapChallenge.hasTapped} onClick={tap} aria-label={game.tapChallenge.hasTapped ? "TAP registered" : "Press TAP now"}>{game.tapChallenge.hasTapped ? <><b>LOCKED</b><small>Waiting</small></> : <><b>TAP</b><small>Press now</small></>}</button>}
      {activeReveal && <div className="private-hand-reveal" role="dialog" aria-label={`${revealTarget?.displayName ?? "Player"}'s private hand`}><div className="private-reveal-head"><div><small>PRIVATE VIEW</small><strong>{revealTarget?.displayName ?? "Player"}</strong></div><span>5 sec</span></div><div className="private-reveal-cards">{activeReveal.cards.map(card => <CardFace key={card.id} card={card} />)}</div><p>These cards are visible only on your screen.</p></div>}
      {activeEffect && <div key={activeEffect.id} className={`number-effect-notice ${activeEffect.type}`} role="status" aria-live="polite"><strong>{activeEffect.type === "hands_rotated" ? "0 ROTATE" : activeEffect.type === "hands_swapped" ? "7 SWAP" : activeEffect.type === "hand_peeked" ? "1 PRIVATE VIEW" : activeEffect.type === "tap_penalty" ? "TAP RESULT" : "7 KEPT"}</strong><span>{effectMessage(activeEffect, game.players)}</span>{activeEffect.type === "tap_penalty" && <div className="penalty-card-flight">{activeEffect.penalties.flatMap(penalty => Array.from({ length: Math.max(1, penalty.amount) }, (_, index) => <img key={`${penalty.userId}-${index}`} src="/cards/card.png" alt="Penalty card" />))}</div>}</div>}
      {game.status === "finished" && <div className="winner"><strong>{winner?.displayName ?? "A player"} wins!</strong><span>{game.winnerUserId === userId ? "You cleared your hand." : "The round is complete."}</span><button disabled={returningToMenu} onClick={returnToMenu}>{returningToMenu ? "Returning…" : "Main menu"}</button></div>}
    </div>
  </section>;
}

function RemotePlayer({ player, active, effectClass }: { player: PlayerPrivateGameState["players"][number]; active: boolean; effectClass: string }) {
  return <div className={`remote-player ${active ? "active" : ""} ${player.status} ${effectClass}`}><div className="player-label"><b>{player.displayName}</b><small>{player.handCount} cards{player.hasCalledUno ? " · UNO!" : ""}</small></div><div className="card-stack">{Array.from({ length: Math.min(player.handCount, 7) }).map((_, index) => <i key={index}><img src="/cards/card.png" alt="" /></i>)}</div></div>;
}

function CardFace({ card, className = "", style }: { card: UnoCard; className?: string; style?: CSSProperties }) {
  return <img className={`card-image ${className}`} style={style} src={`/cards/${cardAssetName(card)}`} alt={`${cardLabel(card)} card`} />;
}
