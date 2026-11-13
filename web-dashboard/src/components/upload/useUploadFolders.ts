import { useEffect, useState } from "react";
import { fetchLibrary, listFolderOptions } from "../../api/library";

export type FolderOption = { folderId: string; label: string };

/** Loads folder choices once; defaults the selection to the uploads folder. */
export function useUploadFolders() {
  const [folderId, setFolderId] = useState("");
  const [folderOptions, setFolderOptions] = useState<FolderOption[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const library = await fetchLibrary();
        const options = await listFolderOptions(library.rootFolderId);
        if (cancelled) return;
        setFolderOptions(options);
        setFolderId((prev) =>
          prev && options.some((o) => o.folderId === prev) ? prev : library.uploadsFolderId,
        );
      } catch {
        if (cancelled) return;
        setFolderOptions([]);
        setFolderId("");
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { folderId, setFolderId, folderOptions, foldersLoading };
}
