import type { AuthSession, AuthUser, ErrorResponse, PublicRoomSummary, Room, SuccessResponse, TokenPair } from "./contracts";

const SESSION_KEY = "uno.backend.session";
const DEFAULT_API_URL = "http://localhost:3001/api/v1";

let session: AuthSession | null = null;
let refreshRequest: Promise<TokenPair> | null = null;

export class BackendError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number) {
    super(message);
    this.name = "BackendError";
  }
}

export function apiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/$/, "");
}

export function socketBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_SOCKET_URL ?? apiBaseUrl().replace(/\/api\/v1$/, "")).replace(/\/$/, "");
}

export function loadSession(): AuthSession | null {
  if (session) return session;
  if (typeof window === "undefined") return null;
  const stored = window.sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    session = JSON.parse(stored) as AuthSession;
    return session;
  } catch {
    window.sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(next: AuthSession | null): void {
  session = next;
  if (typeof window === "undefined") return;
  if (next) window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  else window.sessionStorage.removeItem(SESSION_KEY);
}

export function currentAccessToken(): string | null {
  return loadSession()?.tokens.accessToken ?? null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as SuccessResponse<T> | ErrorResponse | T | null;
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    throw new BackendError(error?.code ?? "REQUEST_FAILED", error?.message ?? `Request failed (${response.status})`, response.status);
  }
  return payload && typeof payload === "object" && "success" in payload && payload.success ? payload.data : payload as T;
}

async function rotateTokens(): Promise<TokenPair> {
  const active = loadSession();
  if (!active) throw new BackendError("SESSION_EXPIRED", "Your session has expired.", 401);
  if (!refreshRequest) {
    refreshRequest = fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: active.tokens.refreshToken }),
    })
      .then(response => parseResponse<TokenPair>(response))
      .then(tokens => {
        saveSession({ ...active, tokens });
        return tokens;
      })
      .catch(error => {
        saveSession(null);
        throw error;
      })
      .finally(() => { refreshRequest = null; });
  }
  return refreshRequest;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = currentAccessToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
  } catch {
    throw new BackendError("BACKEND_UNAVAILABLE", "The game server is not running. Please try again in a moment.");
  }
  if (response.status === 401 && retry && loadSession()) {
    await rotateTokens();
    return request<T>(path, init, false);
  }
  return parseResponse<T>(response);
}

async function authenticate(path: string, input: unknown): Promise<AuthSession> {
  const result = await request<AuthSession>(path, { method: "POST", body: JSON.stringify(input) }, false);
  saveSession(result);
  return result;
}

export const backendApi = {
  guest: (displayName: string) => authenticate("/auth/guest", displayName.trim() ? { displayName } : {}),
  login: (email: string, password: string) => authenticate("/auth/login", { email, password }),
  register: (email: string, password: string, displayName: string) => authenticate("/auth/register", { email, password, displayName }),
  me: () => request<AuthUser>("/auth/me"),
  async refreshSession(): Promise<AuthSession> {
    await rotateTokens();
    const active = loadSession();
    if (!active) throw new BackendError("SESSION_EXPIRED", "Your session has expired.", 401);
    return active;
  },
  rooms: () => request<PublicRoomSummary[]>("/lobby/rooms"),
  currentRoom: () => request<Room | null>("/rooms/current"),
  async logout(): Promise<void> {
    const active = loadSession();
    try {
      if (active) await request<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken: active.tokens.refreshToken }) }, false);
    } finally {
      saveSession(null);
    }
  },
};
