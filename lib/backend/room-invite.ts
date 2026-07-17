import type { Room } from "./contracts";

export type RoomInvite =
  | { kind: "public"; roomId: string }
  | { kind: "private"; code: string };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function roomInviteFromRoom(room: Room): RoomInvite {
  return room.visibility === "private" && room.code
    ? { kind: "private", code: room.code }
    : { kind: "public", roomId: room.id };
}

export function encodeRoomInvite(invite: RoomInvite): string {
  return invite.kind === "private" ? `c_${invite.code}` : `r_${invite.roomId}`;
}

export function parseRoomInvite(value: string | null): RoomInvite | null {
  if (!value) return null;
  if (value.startsWith("r_") && UUID_V4.test(value.slice(2)))
    return { kind: "public", roomId: value.slice(2).toLowerCase() };
  const code = value.startsWith("c_") ? value.slice(2).toUpperCase() : "";
  return PRIVATE_CODE.test(code) ? { kind: "private", code } : null;
}

export function roomInviteUrl(room: Room, origin: string): string {
  const url = new URL("/", origin);
  url.searchParams.set("invite", encodeRoomInvite(roomInviteFromRoom(room)));
  return url.toString();
}

export function inviteMatchesRoom(invite: RoomInvite, room: Room): boolean {
  return invite.kind === "private" ? room.code === invite.code : room.id === invite.roomId;
}

export function inviteFailureMessage(code: string): string {
  switch (code) {
    case "ROOM_FULL":
      return "This room is full. There are no empty seats left.";
    case "ROOM_NOT_FOUND":
      return "This room invite is no longer available.";
    case "ROOM_NOT_JOINABLE":
      return "This room cannot be joined because the game has already started or the room is closed.";
    case "GUESTS_NOT_ALLOWED":
      return "This room only accepts registered players. Log in with an account to join.";
    default:
      return "Could not join this shared room. Please try again.";
  }
}
