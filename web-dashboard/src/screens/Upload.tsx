import "../styles/screens/upload.css";
import { useState } from "react";
import { uploadManuscript, uploadManuscriptComparison, type FitMode } from "../api/upload";
import { MaterialIcon } from "../components/MaterialIcon";
import { CompareUpload, type CompareState } from "../components/upload/CompareUpload";
import { DocumentOptions, type UploadMode } from "../components/upload/DocumentOptions";
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

type CompareRequest = {
  compare: CompareState;
  fitMode: FitMode;
  title: string;
  folderId: string;
  onJob: (job: LocalJob) => void;
};

async function uploadComparison(req: CompareRequest): Promise<void> {
  const { left, right, pageLeft, pageRight } = req.compare;
  if (!left || !right) throw new Error("Choose both a left and right asset for side-by-side upload.");
  const folder = req.folderId.trim();
  const res = await uploadManuscriptComparison({
    left,
    right,
    fitMode: req.fitMode,
    label: req.title,
    ...(isPdf(left) ? { pageLeft } : {}),
    ...(isPdf(right) ? { pageRight } : {}),
    ...(folder ? { folderId: folder } : {}),
  });
  if (!res.jobId) throw new Error("Upload succeeded but no jobId returned");
  const remote = { jobId: res.jobId, status: res.status || "pending" };
  req.onJob(normalizeJob(res.jobId, `${left.name} | ${right.name}`, req.title, remote));
}

function JobList(props: {
  jobs: LocalJob[];
  onDismiss: (id: string) => void;
  onViewModel?: (modelId: string) => void;
}) {
  return (
    <section className="vr-upload__jobs">
      <h2 className="vr-upload__jobs-label">
        <MaterialIcon name="sync" className="vr-upload__sync" />
        Active Processing
      </h2>
      {!props.jobs.length ? (
        <p className="vr-upload__empty">No active jobs yet. Drop an asset to begin.</p>
      ) : (
        props.jobs.map((job) => (
          <JobCard key={job.id} job={job} onDismiss={props.onDismiss} onViewModel={props.onViewModel} />
        ))
      )}
    </section>
  );
}

const EMPTY_COMPARE: CompareState = { left: null, right: null, pageLeft: 1, pageRight: 1 };

type ModePanelProps = {
  mode: UploadMode;
  hasTitle: boolean;
  uploading: boolean;
  requireTitle: () => boolean;
  onFiles: (files: FileList) => void;
  compare: CompareState;
  onCompareChange: (next: CompareState) => void;
  onCompareSubmit: () => void;
};

function ModePanel(props: ModePanelProps) {
  if (props.mode === "single") {
    return (
      <Dropzone
        hasTitle={props.hasTitle}
        uploading={props.uploading}
        canOpenPicker={props.requireTitle}
        onFiles={props.onFiles}
      />
    );
  }
  return (
    <CompareUpload
      state={props.compare}
      onChange={props.onCompareChange}
      hasTitle={props.hasTitle}
      uploading={props.uploading}
      onSubmit={props.onCompareSubmit}
    />
  );
}

function UploadHeader() {
  return (
    <header className="vr-upload__header">
      <h1 className="vr-upload__title">Upload asset</h1>
      <p className="vr-upload__lead">
        Name the asset, then upload TIFF, JPEG, or PDF files. Use side-by-side to stitch two
        sources into one comparison mesh. Processed meshes appear in the asset library.
      </p>
    </header>
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

  const processComparison = async (req: Omit<CompareRequest, "title" | "folderId" | "onJob">): Promise<boolean> => {
    if (!requireTitle()) return false;
    setError(null);
    setUploading(true);
    try {
      await uploadComparison({ ...req, title: form.title, folderId: form.folderId, onJob: form.onJob });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      return false;
    } finally {
      setUploading(false);
    }
  };

  const clearTitleError = (): void => {
    setError((prev) => (prev === TITLE_REQUIRED_MESSAGE ? null : prev));
  };

  return { error, uploading, requireTitle, processFiles, processComparison, clearTitleError };
}

export default function Upload({ onViewModel }: UploadProps) {
  const { jobs, upsertJob, removeJob } = useUploadJobs();
  const folders = useUploadFolders();
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<UploadMode>("single");
  const [fitMode, setFitMode] = useState<FitMode>("scale");
  const [compare, setCompare] = useState<CompareState>(EMPTY_COMPARE);
  const submit = useUploadSubmit({
    title: title.trim(),
    page,
    folderId: folders.folderId,
    onJob: upsertJob,
  });

  return (
    <main className="vr-upload">
      <UploadHeader />
      <DocumentOptions
        title={title}
        onTitleChange={(value) => {
          setTitle(value);
          submit.clearTitleError();
        }}
        page={page}
        onPageChange={setPage}
        folderId={folders.folderId}
        onFolderChange={folders.setFolderId}
        folderOptions={folders.folderOptions}
        foldersLoading={folders.foldersLoading}
        foldersError={folders.foldersError}
        onFoldersRetry={() => void folders.reload()}
        mode={mode}
        onModeChange={setMode}
        fitMode={fitMode}
        onFitChange={setFitMode}
        disabled={submit.uploading}
      />
      <ModePanel
        mode={mode}
        hasTitle={Boolean(title.trim())}
        uploading={submit.uploading}
        requireTitle={submit.requireTitle}
        onFiles={(files) => void submit.processFiles(files)}
        compare={compare}
        onCompareChange={setCompare}
        onCompareSubmit={() =>
          void submit.processComparison({ compare, fitMode }).then((ok) => {
            if (ok) setCompare(EMPTY_COMPARE);
          })
        }
      />
      {submit.error ? (
        <p className="vr-upload__error" role="alert">
          {submit.error}
        </p>
      ) : null}
      <JobList jobs={jobs} onDismiss={removeJob} onViewModel={onViewModel} />
    </main>
  );
}
