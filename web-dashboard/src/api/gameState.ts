import { API_BASE_URL } from "./config";
import { getAuthHeaders } from "./authHeaders";
import { notifyAuthExpired, readKioskToken } from "../auth/tokenStorage";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Quest VR control schemes set from the museum dashboard (#322). */
export type ControlSchemeId = "default" | "splitLaserJetpack";

export type PendingRespawn = {
  seq: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
};

export interface PlayerState {
  id: string;
  displayName: string;
  position: Vec3;
  rotation: Vec3;
  isHost: boolean;
  isConnected: boolean;
  joinedAt: string;
  laserActive?: boolean;
  laserOrigin?: Vec3;
  laserDirection?: { dx: number; dy: number; dz: number };
  bluekeySub?: string | null;
  bluekeyEmail?: string | null;
  chatMuted?: boolean;
  /** Museum respawn command for Unity (#322). */
  pendingRespawn?: PendingRespawn;
  /** Quest-only control scheme (#322); laptop clients ignore. */
  controlScheme?: ControlSchemeId;
}

export interface HelpRequest {
  id: string;
  playerId: string;
  playerName: string;
  createdAt: string;
  acknowledgedAt?: string;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  displayName: string;
  text: string;
  sentAt: string;
  /** True for server-generated notices (e.g. "Player joined the session"). */
  system?: boolean;
}

export interface GameSession {
  sessionId: string;
  label: string;
  hostId: string;
  players: PlayerState[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
  visibility?: "public" | "private";
  createdBySub?: string;
  createdByEmail?: string;
  playlist?: string[];
  activeModelId?: string | null;
  /** Museum public join without Bluekey (#145). */
  kioskEnabled?: boolean;
  /** exploration | event (#146). */
  kind?: "exploration" | "event";
  startsAt?: string | null;
  endsAt?: string | null;
  /** Museum host turn timer — server clamps expired turns to "ended". */
  experiencePhase?: "playing" | "ended";
  rotationEndsAt?: string | null;
  /** Pending guest help alerts (#294). */
  helpRequests?: HelpRequest[];
  metadata?: Record<string, unknown>;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: getAuthHeaders(init?.headers),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message =
      (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    // Host Bluekey expired — clear and force re-login. Skip when only a kiosk JWT is in use.
    if (res.status === 401 && !readKioskToken()) {
      const lower = message.toLowerCase();
      if (
        lower.includes("expired") ||
        lower.includes("invalid") ||
        lower.includes("token") ||
        lower.includes("unauthorized")
      ) {
        notifyAuthExpired("Session expired — sign in again.");
      }
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function getSession(sessionId: string): Promise<GameSession> {
  return request<GameSession>(`/api/game-state/${encodeURIComponent(sessionId)}`);
}

export function createSession(label?: string): Promise<GameSession> {
  return request<GameSession>("/api/game-state", {
    method: "POST",
    body: JSON.stringify({ label }),
  });
}

export function addPlayer(
  sessionId: string,
  displayName: string,
  isHost = false,
  playerId?: string | null,
): Promise<PlayerState> {
  return request<PlayerState>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players`,
    {
      method: "POST",
      body: JSON.stringify({
        displayName,
        isHost,
        ...(playerId ? { playerId } : {}),
      }),
    },
  );
}

export function removePlayer(sessionId: string, playerId: string): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}`,
    { method: "DELETE" },
  );
}

export async function fetchChat(sessionId: string): Promise<ChatMessage[]> {
  const data = await request<{ messages: ChatMessage[] }>(
    `/api/game-state/${encodeURIComponent(sessionId)}/chat`,
  );
  return data.messages ?? [];
}

export async function postChat(
  sessionId: string,
  playerId: string,
  text: string,
): Promise<ChatMessage> {
  const data = await request<{ message: ChatMessage }>(
    `/api/game-state/${encodeURIComponent(sessionId)}/chat`,
    {
      method: "POST",
      body: JSON.stringify({ playerId, text }),
    },
  );
  return data.message;
}

export interface SessionInviteResult {
  notificationId: string;
  joinUrl: string | null;
  deliveryStatus: string;
  deliveryError: string | null;
  recipientEmail: string;
}

export function inviteToSession(
  sessionId: string,
  recipientEmail: string,
  options?: { addToAllowlist?: boolean },
): Promise<SessionInviteResult> {
  return request<SessionInviteResult>(
    `/api/game-state/${encodeURIComponent(sessionId)}/invite`,
    {
      method: "POST",
      body: JSON.stringify({
        recipientEmail,
        addToAllowlist: options?.addToAllowlist === true,
      }),
    },
  );
}

export type AllowlistEntry = {
  id: string;
  sessionId: string;
  subjectSub: string | null;
  email: string | null;
  createdAt: string;
};

export function fetchAllowlist(sessionId: string): Promise<AllowlistEntry[]> {
  return request<AllowlistEntry[]>(
    `/api/game-state/${encodeURIComponent(sessionId)}/allowlist`,
  );
}

export function addAllowlistEmail(
  sessionId: string,
  email: string,
): Promise<AllowlistEntry> {
  return request<AllowlistEntry>(
    `/api/game-state/${encodeURIComponent(sessionId)}/allowlist`,
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export function removeAllowlistEntry(
  sessionId: string,
  entryId: string,
): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/allowlist/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
}

export function setSessionVisibility(
  sessionId: string,
  visibility: "public" | "private",
): Promise<GameSession> {
  return request<GameSession>(
    `/api/game-state/${encodeURIComponent(sessionId)}/visibility`,
    {
      method: "PATCH",
      body: JSON.stringify({ visibility }),
    },
  );
}

/** Host enables/disables museum kiosk public join (#145). */
export function setSessionKiosk(
  sessionId: string,
  enabled: boolean,
): Promise<GameSession> {
  return request<GameSession>(
    `/api/game-state/${encodeURIComponent(sessionId)}/kiosk`,
    {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    },
  );
}

export function kickPlayer(sessionId: string, playerId: string): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/kick`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function mutePlayer(sessionId: string, playerId: string): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/mute`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function unmutePlayer(sessionId: string, playerId: string): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/unmute`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

export function transferHost(sessionId: string, playerId: string): Promise<GameSession> {
  return request<GameSession>(
    `/api/game-state/${encodeURIComponent(sessionId)}/host`,
    {
      method: "PATCH",
      body: JSON.stringify({ playerId }),
    },
  );
}

/** Museum path: respawn a player to manuscript-facing gallery spawn (#322). */
export function respawnPlayer(
  sessionId: string,
  playerId: string,
): Promise<{ ok: boolean; player: PlayerState; session: GameSession }> {
  return request(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/respawn`,
    { method: "POST", body: JSON.stringify({}) },
  );
}

/** Museum path host: respawn every connected player (#322). */
export function respawnAllPlayers(
  sessionId: string,
): Promise<{ ok: boolean; count: number; session: GameSession }> {
  return request(`/api/game-state/${encodeURIComponent(sessionId)}/respawn-all`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Museum path: set Quest VR control scheme for a player (#322). */
export function setPlayerControlScheme(
  sessionId: string,
  playerId: string,
  scheme: ControlSchemeId,
): Promise<{ ok: boolean; player: PlayerState; session: GameSession }> {
  return request(
    `/api/game-state/${encodeURIComponent(sessionId)}/players/${encodeURIComponent(playerId)}/control-scheme`,
    {
      method: "PATCH",
      body: JSON.stringify({ scheme }),
    },
  );
}

export interface SessionArtifact {
  id: string;
  artifactType: string;
  label: string;
  x: number;
  y: number;
  z: number;
  createdBy: string;
  createdAt?: string;
  updatedAt?: string;
}

export function listArtifacts(sessionId: string): Promise<SessionArtifact[]> {
  return request<SessionArtifact[]>(
    `/api/game-state/${encodeURIComponent(sessionId)}/artifacts`,
  );
}

export function createArtifact(
  sessionId: string,
  body: Pick<SessionArtifact, "x" | "y" | "z" | "label"> & {
    artifactType?: string;
  },
): Promise<SessionArtifact> {
  return request<SessionArtifact>(
    `/api/game-state/${encodeURIComponent(sessionId)}/artifacts`,
    {
      method: "POST",
      body: JSON.stringify({
        artifactType: body.artifactType ?? "waypoint",
        label: body.label ?? "",
        x: body.x,
        y: body.y,
        z: body.z,
      }),
    },
  );
}

export function updateArtifact(
  sessionId: string,
  artifactId: string,
  patch: { label?: string },
): Promise<SessionArtifact> {
  return request<SessionArtifact>(
    `/api/game-state/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export function deleteArtifact(sessionId: string, artifactId: string): Promise<void> {
  return request<void>(
    `/api/game-state/${encodeURIComponent(sessionId)}/artifacts/${encodeURIComponent(artifactId)}`,
    { method: "DELETE" },
  );
}

/** Guest calls for host assistance (#294). */
export function postHelpRequest(
  sessionId: string,
  playerId: string,
): Promise<{ helpRequest: HelpRequest; helpRequests: HelpRequest[] }> {
  return request<{ helpRequest: HelpRequest; helpRequests: HelpRequest[] }>(
    `/api/game-state/${encodeURIComponent(sessionId)}/help-request`,
    {
      method: "POST",
      body: JSON.stringify({ playerId }),
    },
  );
}

/** Host acknowledges a pending help request (#294). */
export function acknowledgeHelpRequest(
  sessionId: string,
  requestId: string,
): Promise<{ helpRequest: HelpRequest; helpRequests: HelpRequest[] }> {
  return request<{ helpRequest: HelpRequest; helpRequests: HelpRequest[] }>(
    `/api/game-state/${encodeURIComponent(sessionId)}/help-requests/${encodeURIComponent(requestId)}/ack`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
