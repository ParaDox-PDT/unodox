import { io, type Socket } from "socket.io-client";
import { BackendError, socketBaseUrl } from "./api-client";
import type { SocketAcknowledgement } from "./contracts";

export function createGameSocket(accessToken: string): Socket {
  return io(`${socketBaseUrl()}/game`, {
    transports: ["websocket"],
    auth: { token: accessToken },
    autoConnect: true,
  });
}

export function emitCommand<T>(socket: Socket, event: string, payload: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new BackendError("SOCKET_TIMEOUT", "The game server did not respond.")), 10_000);
    socket.emit(event, payload, (ack: SocketAcknowledgement<T>) => {
      window.clearTimeout(timeout);
      if (!ack?.success) reject(new BackendError(ack?.error?.code ?? "SOCKET_ERROR", ack?.error?.message ?? "The command failed."));
      else resolve(ack.data as T);
    });
  });
}
