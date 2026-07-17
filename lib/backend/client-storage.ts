import type { AuthSession } from "./contracts";

export const SESSION_KEY = "uno.backend.session";
export const GUEST_DEVICE_KEY = "uno.guest.device-id";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthSession>;
  return Boolean(
    candidate.user &&
      typeof candidate.user.id === "string" &&
      candidate.tokens &&
      typeof candidate.tokens.accessToken === "string" &&
      typeof candidate.tokens.refreshToken === "string",
  );
}

function parseSession(raw: string | null): AuthSession | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isAuthSession(value) ? value : null;
  } catch {
    return null;
  }
}

export function readPersistentSession(
  persistentStorage: StorageLike,
  legacySessionStorage?: StorageLike,
): AuthSession | null {
  const persistent = parseSession(persistentStorage.getItem(SESSION_KEY));
  if (persistent) return persistent;
  persistentStorage.removeItem(SESSION_KEY);

  const legacy = legacySessionStorage
    ? parseSession(legacySessionStorage.getItem(SESSION_KEY))
    : null;
  if (!legacy) {
    legacySessionStorage?.removeItem(SESSION_KEY);
    return null;
  }
  persistentStorage.setItem(SESSION_KEY, JSON.stringify(legacy));
  legacySessionStorage?.removeItem(SESSION_KEY);
  return legacy;
}

export function writePersistentSession(
  next: AuthSession | null,
  persistentStorage: StorageLike,
  legacySessionStorage?: StorageLike,
): void {
  if (next) persistentStorage.setItem(SESSION_KEY, JSON.stringify(next));
  else persistentStorage.removeItem(SESSION_KEY);
  legacySessionStorage?.removeItem(SESSION_KEY);
}

export function getOrCreateGuestDeviceId(
  storage: StorageLike,
  createUuid: () => string,
): string {
  const current = storage.getItem(GUEST_DEVICE_KEY);
  if (current && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(current))
    return current;
  const next = createUuid();
  storage.setItem(GUEST_DEVICE_KEY, next);
  return next;
}
