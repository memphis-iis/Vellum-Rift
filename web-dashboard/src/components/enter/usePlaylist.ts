import { useEffect, useState } from "react";
import type { GameSession } from "../../api/gameState";
import { fetchModelMeta, fetchModels } from "../../api/models";
import { sessionActiveModelId, sessionPlaylist, shortModelLabel } from "../../api/playlistHelpers";
import { patchSessionActiveModel, patchSessionPlaylist } from "../../api/sessions";
import { useModelPreview } from "../../hooks/useModelPreview";

type Labels = Record<string, string>;

function useModelLabels(playlist: string[]): Labels {
  const [labels, setLabels] = useState<Labels>({});

  useEffect(() => {
    fetchModels(200)
      .then((models) => {
        const map: Labels = {};
        for (const m of models) if (m.modelId) map[m.modelId] = m.label?.trim() || m.modelId;
        setLabels(map);
      })
      .catch(() => undefined);
  }, []);

  const key = playlist.join("|");
  useEffect(() => {
    if (!playlist.length) return;
    let cancelled = false;
    void Promise.all(
      playlist.map((id) =>
        fetchModelMeta(id)
          .then((meta): [string, string] => [id, meta.label?.trim() || id])
          .catch(() => null),
      ),
    ).then((pairs) => {
      const next = Object.fromEntries(pairs.filter((p): p is [string, string] => p !== null));
      if (!cancelled && Object.keys(next).length) setLabels((prev) => ({ ...prev, ...next }));
    });
    return () => {
      cancelled = true;
    };
    // Keyed on the playlist contents, not array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return labels;
}

type PlaylistContext = {
  sessionId: string | null;
  isHost: boolean;
  session: GameSession | null;
  applySession: (session: GameSession) => void;
  setRoomPlaylistBusy: (busy: boolean) => void;
};

export function usePlaylist(ctx: PlaylistContext) {
  const { sessionId, isHost, session, applySession, setRoomPlaylistBusy } = ctx;
  const playlist = sessionPlaylist(session);
  const activeModelId = sessionActiveModelId(session);
  const labels = useModelLabels(playlist);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewModelId, setPreviewModelId] = useState<string | null>(null);
  const preview = useModelPreview(previewModelId);

  useEffect(() => {
    setPreviewModelId(activeModelId);
  }, [activeModelId, sessionId]);

  const run = async (failMessage: string, call: (id: string) => Promise<unknown>) => {
    if (!sessionId || !isHost || busy) return;
    setBusy(true);
    setRoomPlaylistBusy(true);
    setError(null);
    try {
      applySession((await call(sessionId)) as GameSession);
    } catch (err) {
      setError(err instanceof Error ? err.message : failMessage);
    } finally {
      setBusy(false);
      setRoomPlaylistBusy(false);
    }
  };

  const setActive = (modelId: string) =>
    run("Failed to set active asset", (id) => patchSessionActiveModel(id, modelId));
  const remove = (modelId: string) =>
    run("Failed to remove asset", (id) => patchSessionPlaylist(id, { remove: modelId }));

  return {
    playlist,
    activeModelId,
    activeTitle: activeModelId ? shortModelLabel(activeModelId, labels[activeModelId]) : null,
    labels,
    busy,
    error,
    previewModelId,
    setPreviewModelId,
    preview,
    setActive,
    remove,
  };
}

export type PlaylistState = ReturnType<typeof usePlaylist>;
