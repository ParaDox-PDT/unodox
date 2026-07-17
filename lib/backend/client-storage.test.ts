import { describe, expect, it } from "vitest";
import type { AuthSession } from "./contracts";
import {
  GUEST_DEVICE_KEY,
  SESSION_KEY,
  getOrCreateGuestDeviceId,
  readPersistentSession,
  writePersistentSession,
  type StorageLike,
} from "./client-storage";

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const session: AuthSession = {
  user: {
    id: "user-1",
    type: "REGISTERED",
    status: "ACTIVE",
    email: "player@example.com",
    displayName: "Player",
    avatarUrl: null,
    createdAt: "2026-07-17T00:00:00.000Z",
  },
  tokens: {
    accessToken: "access",
    refreshToken: "refresh",
    accessTokenExpiresAt: "2026-07-17T00:15:00.000Z",
    refreshTokenExpiresAt: "2026-08-17T00:00:00.000Z",
  },
};

describe("client storage", () => {
  it("persists and clears authentication sessions", () => {
    const local = new MemoryStorage();
    const legacy = new MemoryStorage();
    writePersistentSession(session, local, legacy);
    expect(readPersistentSession(local, legacy)).toEqual(session);
    writePersistentSession(null, local, legacy);
    expect(readPersistentSession(local, legacy)).toBeNull();
  });

  it("migrates the old tab-scoped session into persistent storage", () => {
    const local = new MemoryStorage();
    const legacy = new MemoryStorage();
    legacy.setItem(SESSION_KEY, JSON.stringify(session));
    expect(readPersistentSession(local, legacy)).toEqual(session);
    expect(local.getItem(SESSION_KEY)).toBe(JSON.stringify(session));
    expect(legacy.getItem(SESSION_KEY)).toBeNull();
  });

  it("keeps a stable guest device id and replaces invalid values", () => {
    const local = new MemoryStorage();
    const first = "ec142ae2-e6fc-4a8c-a0ea-c3f60415aac7";
    expect(getOrCreateGuestDeviceId(local, () => first)).toBe(first);
    expect(getOrCreateGuestDeviceId(local, () => "unused")).toBe(first);
    local.setItem(GUEST_DEVICE_KEY, "invalid");
    const replacement = "9c35b493-845d-4a54-9aa7-50f937718d5d";
    expect(getOrCreateGuestDeviceId(local, () => replacement)).toBe(replacement);
  });
});
