import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MaterialIcon } from "../components/MaterialIcon";
import { ManuscriptPreview } from "../components/ManuscriptPreview";
import {
  addFolderShare,
  createFolder,
  deleteFolder,
  fetchFolder,
  fetchFolderShares,
  fetchLibrary,
  listFolderOptions,
  renameFolder,
  revokeFolderShare,
  type FolderListing,
  type LibraryFolder,
  type LibraryModel,
  type LibraryShare,
  type LibraryShareRole,
  type LibrarySummary,
} from "../api/library";
import { patchModelLocation } from "../api/models";
import {
  createSession,
  fetchSessions,
  patchSessionPlaylist,
  type GameSession,
} from "../api/sessions";
import { useModelPreview } from "../hooks/useModelPreview";

type DocumentsProps = {
  /** Prefill from Upload “View” or deep-link. */
  initialModelId?: string | null;
  /** Prefill “Add to existing space” when arriving from Enter/Spaces (#143). */
  initialAddSessionId?: string | null;
  /** After “Open in new space”, navigate to Enter for that space. */
  onOpenInSpace?: (sessionId: string) => void;
};

type Selection =
  | { kind: "folder"; id: string }
  | { kind: "model"; id: string }
  | null;

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function spaceOptionLabel(s: GameSession): string {
  const name = s.label?.trim() || "Untitled space";
  const playlistLen = Array.isArray(s.playlist) ? s.playlist.length : 0;
  const vis = (s.visibility ?? "public") === "private" ? "Private" : "Public";
  return `${name} · ${vis} · ${playlistLen} manuscript${playlistLen === 1 ? "" : "s"}`;
}

function badgeLabel(
  library: LibrarySummary | null,
  viewingShared: boolean,
): string {
  if (viewingShared) return "Shared with you";
  if (!library) return "Only you";
  return library.badge === "shared" ? "Shared" : "Only you";
}

export default function Documents({
  initialModelId = null,
  initialAddSessionId = null,
  onOpenInSpace,
}: DocumentsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const [library, setLibrary] = useState<LibrarySummary | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [listing, setListing] = useState<FolderListing | null>(null);
  const [listingLoading, setListingLoading] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [viewingShared, setViewingShared] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [spaces, setSpaces] = useState<GameSession[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [addTargetId, setAddTargetId] = useState(initialAddSessionId ?? "");
  const [setAsActive, setSetAsActive] = useState(true);
  const [bindBusy, setBindBusy] = useState(false);
  const [bindStatus, setBindStatus] = useState<string | null>(null);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [moveOptions, setMoveOptions] = useState<Array<{ folderId: string; label: string }>>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<LibraryShareRole>("view");
  const [shares, setShares] = useState<LibraryShare[]>([]);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogStatus, setDialogStatus] = useState<string | null>(null);

  const canEdit = listing?.access === "edit";
  const selectedFolder: LibraryFolder | null =
    selection?.kind === "folder"
      ? listing?.folders.find((f) => f.folderId === selection.id) ?? null
      : null;
  const selectedModel: LibraryModel | null =
    selection?.kind === "model"
      ? listing?.models.find((m) => m.modelId === selection.id) ?? null
      : null;
  /** Selection id drives preview even when the row isn’t in the current folder (deep-link). */
  const activeModelId = selection?.kind === "model" ? selection.id : null;
  const preview = useModelPreview(activeModelId);
  const meta = preview.meta;

  const refreshSpaces = useCallback(async () => {
    setSpacesLoading(true);
    try {
      const list = await fetchSessions();
      const active = list.filter((s) => s.isActive);
      setSpaces(active);
      setAddTargetId((prev) => {
        const preferred = initialAddSessionId?.trim() || prev;
        if (preferred && active.some((s) => s.sessionId === preferred)) return preferred;
        return prev && active.some((s) => s.sessionId === prev) ? prev : "";
      });
    } catch {
      setSpaces([]);
    } finally {
      setSpacesLoading(false);
    }
  }, [initialAddSessionId]);

  const loadFolder = useCallback(async (id: string) => {
    setListingLoading(true);
    setListingError(null);
    setSelection(null);
    try {
      const next = await fetchFolder(id);
      setListing(next);
      setFolderId(id);
    } catch (err) {
      setListing(null);
      setListingError(err instanceof Error ? err.message : "Failed to list folder");
    } finally {
      setListingLoading(false);
    }
  }, []);

  const bootstrap = useCallback(async () => {
    setListingLoading(true);
    setListingError(null);
    try {
      const lib = await fetchLibrary();
      setLibrary(lib);
      setViewingShared(false);
      await loadFolder(lib.rootFolderId);
    } catch (err) {
      setLibrary(null);
      setListing(null);
      setListingError(err instanceof Error ? err.message : "Failed to load library");
      setListingLoading(false);
    }
  }, [loadFolder]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!initialAddSessionId?.trim()) return;
    setAddTargetId(initialAddSessionId.trim());
  }, [initialAddSessionId]);

  useEffect(() => {
    if (!activeModelId) return;
    void refreshSpaces();
  }, [activeModelId, refreshSpaces]);

  useEffect(() => {
    if (!initialModelId || !library) return;
    setSelection({ kind: "model", id: initialModelId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialModelId, library?.libraryId]);

  const openFolder = (id: string, shared = false) => {
    setViewingShared(shared);
    void loadFolder(id);
  };

  const goUp = () => {
    if (!listing?.folder.parentId) return;
    openFolder(listing.folder.parentId, viewingShared);
  };

  const onListKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && selection?.kind === "folder") {
      e.preventDefault();
      openFolder(selection.id, viewingShared);
      return;
    }
    if ((e.key === "Backspace" || e.key === "ArrowUp") && listing?.folder.parentId) {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") {
        return;
      }
      e.preventDefault();
      goUp();
    }
  };

  const onOpenInNewSpace = async () => {
    if (!activeModelId || bindBusy) return;
    setBindBusy(true);
    setError(null);
    setBindStatus(null);
    try {
      const title = meta?.label?.trim() || "Learning space";
      const created = await createSession(title, "private");
      await patchSessionPlaylist(created.sessionId, {
        playlist: [activeModelId],
        activeModelId,
      });
      setBindStatus(`Opened in new space “${title}”.`);
      await refreshSpaces();
      onOpenInSpace?.(created.sessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open in new space");
    } finally {
      setBindBusy(false);
    }
  };

  const onAddToSpace = async () => {
    if (!activeModelId || !addTargetId || bindBusy) return;
    setBindBusy(true);
    setError(null);
    setBindStatus(null);
    try {
      const updated = await patchSessionPlaylist(addTargetId, {
        append: activeModelId,
        ...(setAsActive ? { activeModelId } : {}),
      });
      const name = updated.label?.trim() || "space";
      setBindStatus(
        setAsActive
          ? `Added and set active in “${name}”.`
          : `Added to “${name}” playlist.`,
      );
      await refreshSpaces();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to add to space (you must be the host)",
      );
    } finally {
      setBindBusy(false);
    }
  };

  const onCreateFolder = async (e: FormEvent) => {
    e.preventDefault();
    if (!folderId || !newFolderName.trim() || dialogBusy) return;
    setDialogBusy(true);
    setDialogStatus(null);
    try {
      await createFolder(folderId, newFolderName.trim());
      setNewFolderOpen(false);
      setNewFolderName("");
      await loadFolder(folderId);
    } catch (err) {
      setDialogStatus(err instanceof Error ? err.message : "Could not create folder");
    } finally {
      setDialogBusy(false);
    }
  };

  const onRenameFolder = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFolder || !folderId || !renameName.trim() || dialogBusy) return;
    setDialogBusy(true);
    setDialogStatus(null);
    try {
      await renameFolder(selectedFolder.folderId, renameName.trim());
      setRenameOpen(false);
      setRenameName("");
      setSelection(null);
      await loadFolder(folderId);
    } catch (err) {
      setDialogStatus(err instanceof Error ? err.message : "Could not rename folder");
    } finally {
      setDialogBusy(false);
    }
  };

  const openMoveDialog = async () => {
    if (!library || !selectedModel) return;
    setDialogStatus(null);
    setMoveOpen(true);
    setDialogBusy(true);
    try {
      const options = await listFolderOptions(library.rootFolderId);
      setMoveOptions(options);
      setMoveTargetId(library.uploadsFolderId);
    } catch (err) {
      setDialogStatus(err instanceof Error ? err.message : "Could not load folders");
    } finally {
      setDialogBusy(false);
    }
  };

  const onMoveModel = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedModel || !moveTargetId || !folderId || dialogBusy) return;
    setDialogBusy(true);
    setDialogStatus(null);
    try {
      await patchModelLocation(selectedModel.modelId, moveTargetId);
      setMoveOpen(false);
      setSelection(null);
      await loadFolder(folderId);
      const lib = await fetchLibrary();
      setLibrary(lib);
    } catch (err) {
      setDialogStatus(err instanceof Error ? err.message : "Move failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const shareTargetFolderId =
    selectedFolder?.folderId ?? listing?.folder.folderId ?? null;

  const openShareDialog = async () => {
    if (!shareTargetFolderId || !canEdit) return;
    setDialogStatus(null);
    setShareOpen(true);
    setShareEmail("");
    setShareRole("view");
    setDialogBusy(true);
    try {
      setShares(await fetchFolderShares(shareTargetFolderId));
    } catch (err) {
      setShares([]);
      setDialogStatus(err instanceof Error ? err.message : "Could not load shares");
    } finally {
      setDialogBusy(false);
    }
  };

  const onAddShare = async (e: FormEvent) => {
    e.preventDefault();
    if (!shareTargetFolderId || !shareEmail.trim() || dialogBusy) return;
    setDialogBusy(true);
    setDialogStatus(null);
    try {
      await addFolderShare(shareTargetFolderId, {
        email: shareEmail.trim(),
        role: shareRole,
      });
      setShareEmail("");
      setShares(await fetchFolderShares(shareTargetFolderId));
      const lib = await fetchLibrary();
      setLibrary(lib);
      setDialogStatus("Shared.");
    } catch (err) {
      setDialogStatus(err instanceof Error ? err.message : "Share failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const onRevokeShare = async (shareId: string) => {
    if (!shareTargetFolderId || dialogBusy) return;
    setDialogBusy(true);
    setDialogStatus(null);
    try {
      await revokeFolderShare(shareTargetFolderId, shareId);
      setShares(await fetchFolderShares(shareTargetFolderId));
      const lib = await fetchLibrary();
      setLibrary(lib);
    } catch (err) {
      setDialogStatus(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setDialogBusy(false);
    }
  };

  const onDeleteSelectedFolder = async () => {
    if (!selectedFolder || !folderId || !canEdit || selectedFolder.isSystem) return;
    if (!window.confirm(`Delete empty folder “${selectedFolder.name}”?`)) return;
    try {
      await deleteFolder(selectedFolder.folderId);
      setSelection(null);
      await loadFolder(folderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete folder");
    }
  };

  const emptyList =
    !listingLoading &&
    listing &&
    listing.folders.length === 0 &&
    listing.models.length === 0;

  return (
    <main className="vr-docs">
      <header className="vr-docs__header">
        <div className="vr-docs__title-row">
          <h1 className="vr-docs__title">Your library</h1>
          <span className="vr-docs__badge" data-badge={viewingShared ? "shared" : library?.badge}>
            {badgeLabel(library, viewingShared)}
          </span>
        </div>
        <p className="vr-docs__lead">
          Browse folders and manuscripts. Select a manuscript to preview its mesh, then open a
          learning space or add it to one.
        </p>
      </header>

      {library?.sharedWithMe?.length ? (
        <section className="vr-docs__shared" aria-label="Shared with you">
          <h2 className="vr-docs__shared-label">Shared with you</h2>
          <ul className="vr-docs__shared-list">
            {library.sharedWithMe.map((item) => (
              <li key={item.folderId}>
                <button
                  type="button"
                  className="vr-docs__shared-item"
                  onClick={() => openFolder(item.folderId, true)}
                >
                  <MaterialIcon name="folder_shared" />
                  <span>{item.name}</span>
                  <span className="vr-docs__shared-meta">
                    {item.role} · {item.ownerEmail || "shared"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="vr-docs__toolbar">
        <nav className="vr-docs__crumbs" aria-label="Folder path">
          {listing?.breadcrumbs.map((crumb, i) => (
            <span key={crumb.folderId} className="vr-docs__crumb">
              {i > 0 ? <span className="vr-docs__crumb-sep">/</span> : null}
              <button
                type="button"
                className="vr-docs__crumb-btn"
                disabled={crumb.folderId === folderId}
                onClick={() => openFolder(crumb.folderId, viewingShared)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="vr-docs__toolbar-actions">
          <button
            type="button"
            className="vr-btn vr-btn--outline"
            disabled={!canEdit || listingLoading}
            onClick={() => {
              setDialogStatus(null);
              setNewFolderName("");
              setNewFolderOpen(true);
            }}
          >
            <MaterialIcon name="create_new_folder" />
            New folder
          </button>
          {selectedFolder && canEdit && !selectedFolder.isSystem && !selectedFolder.isRoot ? (
            <button
              type="button"
              className="vr-btn vr-btn--outline"
              onClick={() => {
                setDialogStatus(null);
                setRenameName(selectedFolder.name);
                setRenameOpen(true);
              }}
            >
              Rename
            </button>
          ) : null}
          <button
            type="button"
            className="vr-btn vr-btn--outline"
            disabled={!canEdit || !selectedModel}
            onClick={() => void openMoveDialog()}
          >
            <MaterialIcon name="drive_file_move" />
            Move
          </button>
          <button
            type="button"
            className="vr-btn vr-btn--primary"
            disabled={!canEdit || !shareTargetFolderId}
            onClick={() => void openShareDialog()}
          >
            <MaterialIcon name="person_add" />
            Share…
          </button>
          {selectedFolder && canEdit && !selectedFolder.isSystem ? (
            <button
              type="button"
              className="vr-btn vr-btn--ghost"
              onClick={() => void onDeleteSelectedFolder()}
            >
              Delete folder
            </button>
          ) : null}
          <button
            type="button"
            className="vr-btn vr-btn--ghost"
            disabled={listingLoading || !library}
            onClick={() => void (viewingShared && folderId ? loadFolder(folderId) : bootstrap())}
          >
            Refresh
          </button>
        </div>
      </div>

      {listingError ? <p className="vr-docs__error">{listingError}</p> : null}
      {error ? <p className="vr-docs__error">{error}</p> : null}
      {bindStatus ? (
        <p className="vr-docs__status" role="status">
          {bindStatus}
        </p>
      ) : null}

      <div className="vr-docs__browser">
        <div
          ref={listRef}
          className="vr-docs__list"
          role="listbox"
          aria-label="Library contents"
          tabIndex={0}
          onKeyDown={onListKeyDown}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelection(null);
          }}
        >
          {listingLoading ? (
            <div className="vr-docs__list-empty">
              <MaterialIcon name="progress_activity" className="vr-docs__spinner" />
              <p>Opening shelf…</p>
            </div>
          ) : null}

          {emptyList ? (
            <div className="vr-docs__list-empty">
              <MaterialIcon name="folder_open" className="vr-docs__empty-icon" />
              <p>This folder is empty.</p>
              <p className="vr-docs__list-empty-hint">
                {canEdit
                  ? "Create a folder or upload a manuscript into Uploads."
                  : "Nothing shared here yet."}
              </p>
            </div>
          ) : null}

          {!listingLoading && listing
            ? listing.folders.map((folder) => {
                const selected =
                  selection?.kind === "folder" && selection.id === folder.folderId;
                return (
                  <button
                    key={folder.folderId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`vr-docs__row vr-docs__row--folder${selected ? " vr-docs__row--selected" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelection({ kind: "folder", id: folder.folderId });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      openFolder(folder.folderId, viewingShared);
                    }}
                  >
                    <MaterialIcon name={folder.isSystem ? "upload_file" : "folder"} />
                    <span className="vr-docs__row-name">{folder.name}</span>
                    <span className="vr-docs__row-meta">Folder</span>
                  </button>
                );
              })
            : null}

          {!listingLoading && listing
            ? listing.models.map((model) => {
                const selected =
                  selection?.kind === "model" && selection.id === model.modelId;
                const name = model.label?.trim() || "Untitled manuscript";
                return (
                  <button
                    key={model.modelId}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={`vr-docs__row vr-docs__row--model${selected ? " vr-docs__row--selected" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelection({ kind: "model", id: model.modelId });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelection({ kind: "model", id: model.modelId });
                    }}
                  >
                    <MaterialIcon name="description" />
                    <span className="vr-docs__row-name">{name}</span>
                    <span className="vr-docs__row-meta">
                      {formatBytes(model.fileSize)}
                      {model.createdAt
                        ? ` · ${new Date(model.createdAt).toLocaleDateString()}`
                        : ""}
                    </span>
                  </button>
                );
              })
            : null}
        </div>

        <ManuscriptPreview
          className="vr-docs__preview"
          preview={preview}
          emptyMessage={
            selection?.kind === "folder"
              ? "Double-click or press Enter to open this folder."
              : "Select a manuscript to preview its mesh."
          }
          alt={meta?.label || (activeModelId ? `Model ${activeModelId}` : undefined)}
        />
      </div>

      {activeModelId && !preview.loading && !preview.error ? (
        <section className="vr-docs__bind" aria-label="Use in a learning space">
          <h2 className="vr-docs__bind-title">Use in a learning space</h2>
          <div className="vr-docs__bind-row">
            <button
              type="button"
              className="vr-btn vr-btn--primary"
              disabled={bindBusy || !activeModelId}
              onClick={() => void onOpenInNewSpace()}
            >
              <MaterialIcon name="add" filled />
              {bindBusy ? "Working…" : "Open in new space"}
            </button>
          </div>
          <div className="vr-docs__bind-add">
            <label className="vr-docs__field" htmlFor="vr-docs-space-select">
              <span className="vr-docs__field-label">
                <MaterialIcon name="hub" />
                Add to existing space
              </span>
              <select
                id="vr-docs-space-select"
                className="vr-docs__select"
                value={addTargetId}
                disabled={bindBusy || spacesLoading}
                onChange={(e) => setAddTargetId(e.target.value)}
              >
                <option value="">
                  {spacesLoading
                    ? "Loading spaces…"
                    : spaces.length
                      ? "Select a space…"
                      : "No active spaces yet"}
                </option>
                {spaces.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {spaceOptionLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="vr-docs__bind-check">
              <input
                type="checkbox"
                checked={setAsActive}
                disabled={bindBusy}
                onChange={(e) => setSetAsActive(e.target.checked)}
              />
              Set as active manuscript
            </label>
            <button
              type="button"
              className="vr-btn vr-btn--outline"
              disabled={bindBusy || !addTargetId || !activeModelId}
              onClick={() => void onAddToSpace()}
            >
              {bindBusy ? "Adding…" : "Add to space"}
            </button>
            <button
              type="button"
              className="vr-btn vr-btn--ghost"
              disabled={spacesLoading || bindBusy}
              onClick={() => void refreshSpaces()}
            >
              Refresh spaces
            </button>
          </div>
          <p className="vr-docs__bind-hint">
            You must be the space host to change its playlist. Non-host attempts return an error.
          </p>
        </section>
      ) : null}

      {meta ? (
        <aside className="vr-docs__meta" aria-label="Model metadata">
          <h2 className="vr-docs__meta-title">{meta.label || meta.modelId}</h2>
          <dl className="vr-docs__meta-grid">
            <div>
              <dt>Model ID</dt>
              <dd>{meta.modelId}</dd>
            </div>
            <div>
              <dt>Height mode</dt>
              <dd>{meta.heightMode}</dd>
            </div>
            <div>
              <dt>Dimensions</dt>
              <dd>
                {meta.width} × {meta.height}
              </dd>
            </div>
            <div>
              <dt>Vertices</dt>
              <dd>{meta.vertexCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt>File size</dt>
              <dd>{formatBytes(meta.fileSize)}</dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(meta.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
          <p className="vr-docs__hint">Drag to orbit · Scroll to zoom · Right-drag to pan</p>
        </aside>
      ) : null}

      {newFolderOpen ? (
        <div className="vr-docs__dialog-backdrop" role="presentation" onClick={() => setNewFolderOpen(false)}>
          <form
            className="vr-docs__dialog"
            role="dialog"
            aria-labelledby="vr-docs-new-folder-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onCreateFolder(e)}
          >
            <h2 id="vr-docs-new-folder-title" className="vr-docs__dialog-title">
              New folder
            </h2>
            <label className="vr-docs__field" htmlFor="vr-docs-new-folder-name">
              <span className="vr-docs__field-label">Name</span>
              <input
                id="vr-docs-new-folder-name"
                className="vr-docs__input"
                value={newFolderName}
                autoFocus
                maxLength={120}
                disabled={dialogBusy}
                onChange={(e) => setNewFolderName(e.target.value)}
              />
            </label>
            {dialogStatus ? <p className="vr-docs__error">{dialogStatus}</p> : null}
            <div className="vr-docs__dialog-actions">
              <button type="button" className="vr-btn vr-btn--ghost" onClick={() => setNewFolderOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="vr-btn vr-btn--primary"
                disabled={dialogBusy || !newFolderName.trim()}
              >
                {dialogBusy ? "Creating…" : "Create"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {renameOpen && selectedFolder ? (
        <div className="vr-docs__dialog-backdrop" role="presentation" onClick={() => setRenameOpen(false)}>
          <form
            className="vr-docs__dialog"
            role="dialog"
            aria-labelledby="vr-docs-rename-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onRenameFolder(e)}
          >
            <h2 id="vr-docs-rename-title" className="vr-docs__dialog-title">
              Rename folder
            </h2>
            <label className="vr-docs__field" htmlFor="vr-docs-rename-name">
              <span className="vr-docs__field-label">Name</span>
              <input
                id="vr-docs-rename-name"
                className="vr-docs__input"
                value={renameName}
                autoFocus
                maxLength={120}
                disabled={dialogBusy}
                onChange={(e) => setRenameName(e.target.value)}
              />
            </label>
            {dialogStatus ? <p className="vr-docs__error">{dialogStatus}</p> : null}
            <div className="vr-docs__dialog-actions">
              <button type="button" className="vr-btn vr-btn--ghost" onClick={() => setRenameOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="vr-btn vr-btn--primary"
                disabled={dialogBusy || !renameName.trim()}
              >
                {dialogBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {moveOpen ? (
        <div className="vr-docs__dialog-backdrop" role="presentation" onClick={() => setMoveOpen(false)}>
          <form
            className="vr-docs__dialog"
            role="dialog"
            aria-labelledby="vr-docs-move-title"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onMoveModel(e)}
          >
            <h2 id="vr-docs-move-title" className="vr-docs__dialog-title">
              Move manuscript
            </h2>
            <label className="vr-docs__field" htmlFor="vr-docs-move-folder">
              <span className="vr-docs__field-label">Destination folder</span>
              <select
                id="vr-docs-move-folder"
                className="vr-docs__select"
                value={moveTargetId}
                disabled={dialogBusy}
                onChange={(e) => setMoveTargetId(e.target.value)}
              >
                {moveOptions.map((opt) => (
                  <option key={opt.folderId} value={opt.folderId}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {dialogStatus ? <p className="vr-docs__error">{dialogStatus}</p> : null}
            <div className="vr-docs__dialog-actions">
              <button type="button" className="vr-btn vr-btn--ghost" onClick={() => setMoveOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="vr-btn vr-btn--primary"
                disabled={dialogBusy || !moveTargetId}
              >
                {dialogBusy ? "Moving…" : "Move"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {shareOpen ? (
        <div className="vr-docs__dialog-backdrop" role="presentation" onClick={() => setShareOpen(false)}>
          <div
            className="vr-docs__dialog vr-docs__dialog--share"
            role="dialog"
            aria-labelledby="vr-docs-share-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="vr-docs-share-title" className="vr-docs__dialog-title">
              Share…
            </h2>
            <p className="vr-docs__dialog-lead">
              Invite by Bluekey email. They can browse this folder
              {selectedFolder ? ` (“${selectedFolder.name}”)` : ""} and its contents.
            </p>
            <form className="vr-docs__share-form" onSubmit={(e) => void onAddShare(e)}>
              <label className="vr-docs__field" htmlFor="vr-docs-share-email">
                <span className="vr-docs__field-label">Email</span>
                <input
                  id="vr-docs-share-email"
                  className="vr-docs__input"
                  type="email"
                  autoComplete="email"
                  placeholder="colleague@memphis.edu"
                  value={shareEmail}
                  disabled={dialogBusy}
                  onChange={(e) => setShareEmail(e.target.value)}
                />
              </label>
              <label className="vr-docs__field" htmlFor="vr-docs-share-role">
                <span className="vr-docs__field-label">Role</span>
                <select
                  id="vr-docs-share-role"
                  className="vr-docs__select"
                  value={shareRole}
                  disabled={dialogBusy}
                  onChange={(e) => setShareRole(e.target.value === "edit" ? "edit" : "view")}
                >
                  <option value="view">View</option>
                  <option value="edit">Edit</option>
                </select>
              </label>
              <button
                type="submit"
                className="vr-btn vr-btn--primary"
                disabled={dialogBusy || !shareEmail.trim()}
              >
                {dialogBusy ? "Sharing…" : "Share"}
              </button>
            </form>
            {dialogStatus ? (
              <p className="vr-docs__status" role="status">
                {dialogStatus}
              </p>
            ) : null}
            {shares.length ? (
              <ul className="vr-docs__share-list">
                {shares.map((share) => (
                  <li key={share.id} className="vr-docs__share-row">
                    <span>
                      {share.email || share.subjectSub || "Unknown"}
                      <span className="vr-docs__share-role"> · {share.role}</span>
                    </span>
                    <button
                      type="button"
                      className="vr-btn vr-btn--ghost"
                      disabled={dialogBusy}
                      onClick={() => void onRevokeShare(share.id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vr-docs__share-empty">Not shared with anyone yet.</p>
            )}
            <div className="vr-docs__dialog-actions">
              <button type="button" className="vr-btn vr-btn--outline" onClick={() => setShareOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
