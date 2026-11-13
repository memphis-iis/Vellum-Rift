import { shortModelLabel } from "../../api/playlistHelpers";
import { MaterialIcon } from "../MaterialIcon";
import { ManuscriptPreview } from "../ManuscriptPreview";
import type { PlaylistState } from "./usePlaylist";

type LoadoutProps = {
  playlist: PlaylistState;
  isHost: boolean;
  sessionId: string | null;
  onAddFromLibrary?: (sessionId: string) => void;
};

function AddFromLibraryButton({ sessionId, onAdd, busy }: {
  sessionId: string;
  onAdd: (sessionId: string) => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      className="vr-enter__text-btn"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAdd(sessionId);
      }}
      disabled={busy}
    >
      <MaterialIcon name="library_add" />
      Add from library
    </button>
  );
}

function LoadoutSummary({ playlist, isHost, sessionId, onAddFromLibrary }: LoadoutProps) {
  const { playlist: ids, activeTitle } = playlist;
  const hint = ids.length
    ? `${ids.length} in space${activeTitle ? ` · Active: ${activeTitle}` : ""}`
    : "None yet";
  return (
    <summary className="vr-enter__loadout-summary">
      <MaterialIcon name="menu_book" />
      Assets
      <span className="vr-enter__host-ops-hint">{hint}</span>
      {isHost && sessionId && onAddFromLibrary ? (
        <AddFromLibraryButton sessionId={sessionId} onAdd={onAddFromLibrary} busy={playlist.busy} />
      ) : null}
    </summary>
  );
}

function PlaylistRow({ modelId, playlist, isHost }: {
  modelId: string;
  playlist: PlaylistState;
  isHost: boolean;
}) {
  const isActive = modelId === playlist.activeModelId;
  const isPreviewing = modelId === playlist.previewModelId;
  const cls = `vr-enter__playlist-row${isActive ? " vr-enter__playlist-row--active" : ""}${
    isPreviewing ? " vr-enter__playlist-row--previewing" : ""
  }`;
  return (
    <li className={cls}>
      <button
        type="button"
        className="vr-enter__playlist-select"
        title={modelId}
        aria-pressed={isPreviewing}
        onClick={() => playlist.setPreviewModelId(modelId)}
      >
        <MaterialIcon
          name={isActive ? "check_circle" : "radio_button_unchecked"}
          className={isActive ? "vr-enter__playlist-check" : undefined}
        />
        <span className="vr-enter__playlist-name">
          {shortModelLabel(modelId, playlist.labels[modelId])}
        </span>
        {isActive ? <span className="vr-enter__playlist-badge">Active</span> : null}
      </button>
      {isHost ? <RowActions modelId={modelId} isActive={isActive} playlist={playlist} /> : null}
    </li>
  );
}

function RowActions({ modelId, isActive, playlist }: {
  modelId: string;
  isActive: boolean;
  playlist: PlaylistState;
}) {
  return (
    <span className="vr-enter__playlist-actions">
      {!isActive ? (
        <button
          type="button"
          className="vr-enter__text-btn"
          disabled={playlist.busy}
          onClick={() => void playlist.setActive(modelId)}
        >
          Set active
        </button>
      ) : null}
      <button
        type="button"
        className="vr-enter__text-btn"
        disabled={playlist.busy}
        onClick={() => void playlist.remove(modelId)}
      >
        Remove
      </button>
    </span>
  );
}

function EmptyPlaylist({ isHost, sessionId, onAddFromLibrary }: Omit<LoadoutProps, "playlist">) {
  return (
    <p className="vr-enter__playlist-empty">
      {isHost ? "No documents in this space yet." : "No assets in this exhibit yet."}
      {isHost && onAddFromLibrary && sessionId ? (
        <>
          {" "}
          <button type="button" className="vr-enter__retry" onClick={() => onAddFromLibrary(sessionId)}>
            Add from library
          </button>
        </>
      ) : null}
    </p>
  );
}

function PlaylistPane(props: LoadoutProps) {
  const { playlist, isHost } = props;
  return (
    <div className="vr-enter__playlist vr-enter__playlist--loadout">
      {playlist.error ? (
        <p className="vr-enter__error" role="alert">
          {playlist.error}
        </p>
      ) : null}
      {!playlist.playlist.length ? (
        <EmptyPlaylist {...props} />
      ) : (
        <ul className="vr-enter__playlist-list">
          {playlist.playlist.map((id) => (
            <PlaylistRow key={id} modelId={id} playlist={playlist} isHost={isHost} />
          ))}
        </ul>
      )}
      {!isHost && playlist.playlist.length ? (
        <p className="vr-enter__playlist-hint">Tap an asset to preview. Enter 3D uses the active one.</p>
      ) : null}
    </div>
  );
}

export function Loadout(props: LoadoutProps) {
  const { playlist } = props;
  const previewId = playlist.previewModelId;
  return (
    <details className="vr-enter__loadout">
      <LoadoutSummary {...props} />
      <div className="vr-enter__loadout-body">
        <div className="vr-enter__loadout-grid">
          <ManuscriptPreview
            className="vr-enter__loadout-preview"
            preview={playlist.preview}
            emptyMessage={
              playlist.playlist.length
                ? "Select an asset in the list to preview its mesh."
                : "No assets in this space yet. Nothing to preview."
            }
            alt={previewId ? shortModelLabel(previewId, playlist.labels[previewId]) : undefined}
          />
          <PlaylistPane {...props} />
        </div>
      </div>
    </details>
  );
}
