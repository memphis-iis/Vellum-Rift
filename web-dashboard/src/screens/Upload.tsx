import "../styles/screens/upload.css";
import { useState } from "react";
import { uploadManuscript } from "../api/upload";
import { MaterialIcon } from "../components/MaterialIcon";
import { DocumentOptions } from "../components/upload/DocumentOptions";
import { Dropzone } from "../components/upload/Dropzone";
import { JobCard } from "../components/upload/JobCard";
import {
  isPdf,
  labelForFile,
  normalizeJob,
  TITLE_REQUIRED_MESSAGE,
  type LocalJob,
} from "../components/upload/uploadJobs";
import { useUploadFolders } from "../components/upload/useUploadFolders";
import { useUploadJobs } from "../components/upload/useUploadJobs";

type UploadRequest = {
  files: File[];
  title: string;
  page: number;
  folderId: string;
  onJob: (job: LocalJob) => void;
};

async function uploadAll({ files, title, page, folderId, onJob }: UploadRequest): Promise<void> {
  const multi = files.length > 1;
  const folder = folderId.trim();
  for (const file of files) {
    const label = labelForFile(title, file, multi);
    const pdf = isPdf(file);
    const res = await uploadManuscript(file, {
      label,
      ...(pdf ? { page } : {}),
      ...(folder ? { folderId: folder } : {}),
    });
    if (!res.jobId) throw new Error("Upload succeeded but no jobId returned");
    const remote = { jobId: res.jobId, status: res.status || "pending" };
    onJob(normalizeJob(res.jobId, file.name, label, remote, pdf ? page : undefined));
  }
}

function JobList(props: {
  jobs: LocalJob[];
  onDismiss: (id: string) => void;
  onViewModel?: (modelId: string) => void;
}) {
  return (
    <section className="vr-upload__jobs">
      <h3 className="vr-upload__jobs-label">
        <MaterialIcon name="sync" className="vr-upload__sync" />
        Active Processing
      </h3>
      {!props.jobs.length ? (
        <p className="vr-upload__empty">No active jobs yet. Drop a manuscript to begin.</p>
      ) : (
        props.jobs.map((job) => (
          <JobCard key={job.id} job={job} onDismiss={props.onDismiss} onViewModel={props.onViewModel} />
        ))
      )}
    </section>
  );
}

type UploadProps = {
  onViewModel?: (modelId: string) => void;
};

function useUploadSubmit(form: {
  title: string;
  page: number;
  folderId: string;
  onJob: (job: LocalJob) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const requireTitle = (): boolean => {
    if (!form.title) setError(TITLE_REQUIRED_MESSAGE);
    return Boolean(form.title);
  };

  const processFiles = async (input: FileList | File[]): Promise<void> => {
    const files = Array.from(input);
    if (!files.length || !requireTitle()) return;
    setError(null);
    setUploading(true);
    try {
      await uploadAll({ files, ...form });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const clearTitleError = (): void => {
    setError((prev) => (prev === TITLE_REQUIRED_MESSAGE ? null : prev));
  };

  return { error, uploading, requireTitle, processFiles, clearTitleError };
}

export default function Upload({ onViewModel }: UploadProps) {
  const { jobs, upsertJob, removeJob } = useUploadJobs();
  const folders = useUploadFolders();
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const trimmedTitle = title.trim();
  const { error, uploading, requireTitle, processFiles, clearTitleError } = useUploadSubmit({
    title: trimmedTitle,
    page,
    folderId: folders.folderId,
    onJob: upsertJob,
  });

  const onTitleChange = (value: string): void => {
    setTitle(value);
    clearTitleError();
  };

  return (
    <main className="vr-upload">
      <header className="vr-upload__header">
        <h1 className="vr-upload__title">Upload manuscript</h1>
        <p className="vr-upload__lead">
          Name the document, then upload TIFF, JPEG, or PDF files. Processed meshes appear in the
          manuscript library for use in learning spaces.
        </p>
      </header>
      <DocumentOptions
        title={title}
        onTitleChange={onTitleChange}
        page={page}
        onPageChange={setPage}
        folderId={folders.folderId}
        onFolderChange={folders.setFolderId}
        folderOptions={folders.folderOptions}
        foldersLoading={folders.foldersLoading}
        disabled={uploading}
      />
      <Dropzone
        hasTitle={Boolean(trimmedTitle)}
        uploading={uploading}
        canOpenPicker={requireTitle}
        onFiles={(files) => void processFiles(files)}
      />
      {error ? (
        <p className="vr-upload__error" role="alert">
          {error}
        </p>
      ) : null}
      <JobList jobs={jobs} onDismiss={removeJob} onViewModel={onViewModel} />
    </main>
  );
}
