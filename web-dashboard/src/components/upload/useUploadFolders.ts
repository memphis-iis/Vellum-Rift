import { useCallback, useEffect, useState } from "react";
import { listUploadFolderOptions } from "../../api/library";

export type FolderOption = { folderId: string; label: string };

/** Loads folder choices (uploads, editable shares, Demos for admins); retryable. */
export function useUploadFolders() {
  const [folderId, setFolderId] = useState("");
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [foldersError, setFoldersError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setFoldersLoading(true);
    setFoldersError(null);
    try {
      const { options, defaultFolderId } = await listUploadFolderOptions();
      setFolderOptions(options);
      setFolderId((prev) =>
        prev && options.some((o) => o.folderId === prev) ? prev : defaultFolderId,
      );
      if (!options.length) {
        setFoldersError("No library folders available. Open Library, then try again.");
      }
    } catch (err) {
      setFolderOptions([]);
      setFolderId("");
      setFoldersError(err instanceof Error ? err.message : "Could not load library folders");
    } finally {
      setFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { folderId, setFolderId, folderOptions, foldersLoading, foldersError, reload };
}
