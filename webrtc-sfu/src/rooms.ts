export type PeerRecord = {
  peerId: string;
  playerId: string;
  displayName?: string;
  joinedAt: number;
  lastSeenAt: number;
};

export type SignalMessage = {
  id: string;
  sessionId: string;
  fromPeerId: string;
  toPeerId: string;
  type: "offer" | "answer" | "ice";
  sdp?: string;
  candidate?: unknown;
  createdAt: number;
};

export type SessionRoom = {
  sessionId: string;
  peers: Map<string, PeerRecord>;
  /** Per-peer inbox of pending signaling messages */
  inbox: Map<string, SignalMessage[]>;
};

const rooms = new Map<string, SessionRoom>();

const HEARTBEAT_TTL_MS = 45_000;
const INBOX_CAP = 50;

export function getOrCreateRoom(sessionId: string): SessionRoom {
  let room = rooms.get(sessionId);
  if (!room) {
    room = { sessionId, peers: new Map(), inbox: new Map() };
    rooms.set(sessionId, room);
  }
  return room;
}

export function joinPeer(
  sessionId: string,
  peer: Omit<PeerRecord, "joinedAt" | "lastSeenAt">,
): { room: SessionRoom; peer: PeerRecord; others: PeerRecord[] } {
  const room = getOrCreateRoom(sessionId);
  const now = Date.now();
  const record: PeerRecord = {
    ...peer,
    joinedAt: now,
    lastSeenAt: now,
  };
  room.peers.set(peer.peerId, record);
  if (!room.inbox.has(peer.peerId)) {
    room.inbox.set(peer.peerId, []);
  }
  const others = [...room.peers.values()].filter((p) => p.peerId !== peer.peerId);
  return { room, peer: record, others };
}

export function touchPeer(sessionId: string, peerId: string): boolean {
  const room = rooms.get(sessionId);
  const peer = room?.peers.get(peerId);
  if (!peer) return false;
  peer.lastSeenAt = Date.now();
  return true;
}

export function leavePeer(sessionId: string, peerId: string): void {
  const room = rooms.get(sessionId);
  if (!room) return;
  room.peers.delete(peerId);
  room.inbox.delete(peerId);
  if (room.peers.size === 0) {
    rooms.delete(sessionId);
  }
}

export function enqueueSignal(message: SignalMessage): boolean {
  const room = rooms.get(message.sessionId);
  if (!room) return false;
  if (!room.peers.has(message.toPeerId)) return false;
  const queue = room.inbox.get(message.toPeerId) ?? [];
  queue.push(message);
  while (queue.length > INBOX_CAP) queue.shift();
  room.inbox.set(message.toPeerId, queue);
  touchPeer(message.sessionId, message.fromPeerId);
  return true;
}

export function drainSignals(sessionId: string, peerId: string): SignalMessage[] {
  const room = rooms.get(sessionId);
  if (!room) return [];
  touchPeer(sessionId, peerId);
  const queue = room.inbox.get(peerId) ?? [];
  room.inbox.set(peerId, []);
  return queue;
}

/** Drop peers that have not heartbeated recently. */
export function pruneStalePeers(now = Date.now()): number {
  let removed = 0;
  for (const [sessionId, room] of rooms) {
    for (const [peerId, peer] of room.peers) {
      if (now - peer.lastSeenAt > HEARTBEAT_TTL_MS) {
        room.peers.delete(peerId);
        room.inbox.delete(peerId);
        removed += 1;
      }
    }
    if (room.peers.size === 0) {
      rooms.delete(sessionId);
    }
  }
  return removed;
}

/** Test helper */
export function resetRoomsForTests(): void {
  rooms.clear();
}
