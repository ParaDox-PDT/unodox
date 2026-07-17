export type UserType = "GUEST" | "REGISTERED";

export interface AuthUser {
  id: string;
  type: UserType;
  status: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
}

export interface AuthSession {
  user: AuthUser;
  tokens: TokenPair;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details: unknown | null;
}

export interface ErrorResponse {
  success: false;
  error: ApiErrorPayload;
  requestId?: string;
  timestamp?: string;
}

export interface SocketAcknowledgement<T> {
  success: boolean;
  data?: T;
  error?: ApiErrorPayload;
  requestId: string;
  timestamp: string;
}

export type RoomVisibility = "public" | "private";
export type RoomStatus = "waiting" | "ready_to_start" | "starting" | "in_game" | "finished" | "closed";

export interface RoomPlayer {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  userType: UserType;
  isOwner: boolean;
  isReady: boolean;
  status: "connected" | "disconnected" | "left";
  joinedAt: string;
  disconnectedAt: string | null;
  disconnectDeadlineAt: string | null;
  lastSeenAt: string;
}

export interface RoomConfiguration {
  minPlayers: number;
  maxPlayers: number;
  allowGuests: boolean;
  allowSpectators: boolean;
  autoStart: boolean;
  turnTimeoutSeconds: number | null;
  reconnectGracePeriodSeconds: number;
  drawPlayableCardImmediately: boolean;
}

export interface Room {
  id: string;
  code: string | null;
  name: string;
  visibility: RoomVisibility;
  status: RoomStatus;
  ownerId: string;
  players: RoomPlayer[];
  configuration: RoomConfiguration;
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface PublicRoomSummary {
  id: string;
  name: string;
  status: RoomStatus;
  playerCount: number;
  maxPlayers: number;
  allowGuests: boolean;
  createdAt: string;
}

export type CardColor = "red" | "yellow" | "green" | "blue";
export type CardType = "number" | "skip" | "reverse" | "draw_two" | "wild" | "wild_draw_four";

export interface UnoCard {
  id: string;
  color: CardColor | null;
  type: CardType;
  value: number | null;
}

export interface GamePlayerView {
  userId: string;
  displayName: string;
  seatIndex: number;
  handCount: number;
  hasCalledUno: boolean;
  status: "active" | "disconnected" | "left" | "won";
  disconnectedAt: string | null;
  disconnectDeadlineAt: string | null;
}

export type NumberEffectNotice =
  | {
      id: string;
      type: "hands_rotated";
      actorUserId: string;
      moves: { fromUserId: string; toUserId: string }[];
    }
  | {
      id: string;
      type: "hand_peeked";
      actorUserId: string;
      targetUserId?: string;
    }
  | {
      id: string;
      type: "hands_swapped";
      actorUserId: string;
      targetUserId: string;
    }
  | {
      id: string;
      type: "hand_swap_skipped";
      actorUserId: string;
    }
  | {
      id: string;
      type: "tap_penalty";
      actorUserId: string;
      penalties: { userId: string; amount: number }[];
      tied: boolean;
    };

export interface PlayerPrivateGameState {
  gameId: string;
  roomId: string;
  status: "initializing" | "waiting_for_color" | "in_progress" | "finished" | "cancelled";
  currentPlayerId: string;
  currentColor: CardColor;
  direction: "clockwise" | "counter_clockwise";
  topDiscardCard: UnoCard;
  drawPileCount: number;
  players: GamePlayerView[];
  ownHand: UnoCard[];
  playableCardIds: string[];
  canDraw: boolean;
  canAcceptDrawPenalty: boolean;
  canChooseColor: boolean;
  unoCallWindow: { targetUserId: string; cardId: string } | null;
  pendingNumberEffect: {
    kind: "peek" | "swap";
    actorUserId: string;
    canChooseTarget: boolean;
    canSkip: boolean;
    eligibleTargetUserIds: string[];
  } | null;
  tapChallenge: {
    id: string;
    actorUserId: string;
    startedAt: string;
    deadlineAt: string;
    participantCount: number;
    hasTapped: boolean;
  } | null;
  privateHandReveal: {
    targetUserId: string;
    cards: UnoCard[];
    expiresAt: string;
  } | null;
  lastNumberEffect: NumberEffectNotice | null;
  lastTurnNotice: { type: "unplayable_draw_passed"; userId: string; turnNumber: number } | null;
  lastPlayerElimination: {
    id: string;
    userId: string;
    returnedCardCount: number;
    reason: "disconnect_timeout";
  } | null;
  winnerUserId: string | null;
  turnNumber: number;
  version: number;
}

export const GAME_EVENTS = {
  roomCreate: "room:create",
  roomJoin: "room:join",
  roomJoinByCode: "room:join-by-code",
  roomReady: "room:ready",
  roomLeave: "room:leave",
  roomClose: "room:close",
  roomSync: "room:sync",
  gameStart: "game:start",
  playCard: "game:play-card",
  playCards: "game:play-cards",
  drawCard: "game:draw-card",
  chooseColor: "game:choose-color",
  callUno: "game:call-uno",
  selectNumberEffectTarget: "game:select-number-effect-target",
  skipNumberEffect: "game:skip-number-effect",
  tapChallenge: "game:tap-challenge",
  gameSync: "game:sync",
  roomUpdated: "room:updated",
  roomReconnected: "room:reconnected",
  roomKicked: "room:kicked",
  roomClosed: "room:closed",
  gamePrivateState: "game:private-state",
} as const;

export function cardAssetName(card: UnoCard): string {
  if (card.type === "wild") return "card_wild_1.png";
  if (card.type === "wild_draw_four") return "card_wild_draw4_1.png";
  const value = card.type === "number" ? String(card.value) : card.type === "draw_two" ? "draw2" : card.type;
  return `card_${value}_${card.color}.png`;
}

export function cardLabel(card: UnoCard): string {
  const symbol = card.type === "number" ? String(card.value) : card.type.replaceAll("_", " ");
  return `${card.color ?? "wild"} ${symbol}`;
}
