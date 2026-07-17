import { describe, expect, it } from "vitest";
import type { Room } from "./contracts";
import {
  encodeRoomInvite,
  inviteFailureMessage,
  inviteMatchesRoom,
  parseRoomInvite,
  roomInviteUrl,
} from "./room-invite";

const room = (visibility: "public" | "private", code: string | null): Room => ({
  id: "ec142ae2-e6fc-4a8c-a0ea-c3f60415aac7",
  code,
  name: "Shared table",
  visibility,
  status: "waiting",
  ownerId: "owner",
  players: [],
  configuration: {
    minPlayers: 2,
    maxPlayers: 4,
    allowGuests: true,
    allowSpectators: false,
    autoStart: false,
    turnTimeoutSeconds: null,
    reconnectGracePeriodSeconds: 30,
    drawPlayableCardImmediately: true,
  },
  version: 1,
  createdAt: "2026-07-17T00:00:00.000Z",
  updatedAt: "2026-07-17T00:00:00.000Z",
  expiresAt: null,
});

describe("room invites", () => {
  it("encodes and parses public room links", () => {
    const url = roomInviteUrl(room("public", null), "https://uno-table.vercel.app");
    expect(url).toBe(
      "https://uno-table.vercel.app/?invite=r_ec142ae2-e6fc-4a8c-a0ea-c3f60415aac7",
    );
    const invite = parseRoomInvite(new URL(url).searchParams.get("invite"));
    expect(invite).toEqual({ kind: "public", roomId: room("public", null).id });
    expect(invite && inviteMatchesRoom(invite, room("public", null))).toBe(true);
  });

  it("uses the private code without exposing the room id", () => {
    const url = roomInviteUrl(room("private", "7K9M2P"), "https://uno-table.vercel.app");
    expect(url).toBe("https://uno-table.vercel.app/?invite=c_7K9M2P");
    expect(parseRoomInvite("c_7k9m2p")).toEqual({ kind: "private", code: "7K9M2P" });
    expect(encodeRoomInvite({ kind: "private", code: "7K9M2P" })).toBe("c_7K9M2P");
  });

  it("rejects malformed links and provides a specific full-room message", () => {
    expect(parseRoomInvite("r_not-a-room")).toBeNull();
    expect(parseRoomInvite("c_ABC123")).toBeNull();
    expect(inviteFailureMessage("ROOM_FULL")).toContain("room is full");
    expect(inviteFailureMessage("ROOM_NOT_FOUND")).toContain("no longer available");
  });
});
