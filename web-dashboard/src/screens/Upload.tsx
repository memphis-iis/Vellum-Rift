import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialIcon } from "../components/MaterialIcon";
import { fetchJob, uploadManuscript, type JobStatus } from "../api/upload";

type LocalJob = {
  id: string;
  filename: string;
  status: string;
  progress: number;
  stage: string;
  page?: number;
  error?: string;
};

const ACCEPT = ".tif,.tiff,.jpg,.jpeg,.png,.pdf,.webp,.bmp";

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

function stageLabel(status: string, progress: number): string {
  if (status === "completed") return "Stabilized";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Queued…";
  if (progress < 30) return "Ingesting manuscript…";
  if (progress < 55) return "Extracting topographic layers…";
  if (progress < 80) return "Building mesh…";
  return "Finalizing…";
}

function normalizeJob(
  jobId: string,
  filename: string,
  remote?: JobStatus,
  page?: number,
): LocalJob {
  const status = remote?.status ?? "pending";
  const progress =
    typeof remote?.progress === "number"
      ? Math.max(0, Math.min(100, Math.round(remote.progress)))
      : status === "completed"
        ? 100
        : status === "failed"
          ? 0
          : 5;
  return {
    id: jobId,
    filename,
    status,
    progress,
    page,
    stage: remote?.stage || stageLabel(status, progress),
    error: remote?.errorMessage || remote?.error || undefined,
  };
}

export default function Upload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [jobs, setJobs] = useState<LocalJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);

  const upsertJob = useCallback((job: LocalJob) => {
    setJobs((prev) => {
      const i = prev.findIndex((j) => j.id === job.id);
      if (i === -1) return [job, ...prev];
      const existing = prev[i]!;
      const next = [...prev];
      next[i] = { ...job, page: job.page ?? existing.page };
      return next;
    });
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const processFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const pageToProcess = Math.max(1, Math.floor(page) || 1);
    setError(null);
    setUploading(true);
    try {
      for (const file of list) {
        const opts = isPdf(file) ? { page: pageToProcess } : {};
        const res = await uploadManuscript(file, opts);
        const jobId = res.jobId;
        if (!jobId) throw new Error("Upload succeeded but no jobId returned");
        upsertJob(
          normalizeJob(
            jobId,
            file.name,
            { jobId, status: res.status || "pending" },
            isPdf(file) ? pageToProcess : undefined,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const active = jobs.filter((j) => j.status !== "completed" && j.status !== "failed");
    if (!active.length) return;

    const timer = window.setInterval(async () => {
      await Promise.all(
        active.map(async (job) => {
          try {
            const remote = await fetchJob(job.id);
            upsertJob(normalizeJob(job.id, job.filename, remote, job.page));
          } catch {
            /* keep last known */
          }
        }),
      );
    }, 2000);

    return () => window.clearInterval(timer);
  }, [jobs, upsertJob]);

  return (
    <main className="vr-upload">
      <header className="vr-upload__header">
        <h1 className="vr-upload__title">Manuscript Ingestion</h1>
        <p className="vr-upload__lead">
          Upload TIFF, JPEG, or PDF files to begin the extraction process. The rift will stabilize
          documents automatically.
        </p>
      </header>

      <section className="vr-upload__options" aria-label="Processing options">
        <label className="vr-upload__page-field" htmlFor="vr-upload-page">
          <span className="vr-upload__page-label">
            <MaterialIcon name="filter_1" />
            Page to process
          </span>
          <input
            id="vr-upload-page"
            className="vr-upload__page-input"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={page}
            disabled={uploading}
            onChange={(e) => {
              const next = Number(e.target.value);
              setPage(Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1);
            }}
          />
        </label>
        <p className="vr-upload__page-hint">
          For multi-page PDFs, choose which page to extract. Raster images ignore this setting.
        </p>
      </section>

      <section
        className={`vr-dropzone${dragging ? " vr-dropzone--active" : ""}`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void processFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <MaterialIcon name="cloud_upload" className="vr-dropzone__icon" />
        <h2 className="vr-dropzone__heading">Drag &amp; Drop Manuscripts</h2>
        <p className="vr-dropzone__hint">or click to browse local files</p>
        <button
          type="button"
          className="vr-btn vr-btn--outline"
          disabled={uploading}
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
        >
          {uploading ? "Uploading…" : "Select Files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="vr-upload__file-input"
          onChange={(e) => {
            if (e.target.files) void processFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </section>

      {error ? <p className="vr-upload__error">{error}</p> : null}

      <section className="vr-upload__jobs">
        <h3 className="vr-upload__jobs-label">
          <MaterialIcon name="sync" className="vr-upload__sync" />
          Active Processing
        </h3>

        {!jobs.length ? (
          <p className="vr-upload__empty">No active jobs yet. Drop a manuscript to begin.</p>
        ) : (
          jobs.map((job) => (
            <article key={job.id} className="vr-job-card">
              <div className="vr-job-card__top">
                <div className="vr-job-card__meta">
                  <div className="vr-job-card__icon">
                    <MaterialIcon name="description" />
                  </div>
                  <div>
                    <p className="vr-job-card__name">{job.filename}</p>
                    <p className="vr-job-card__status">
                      {job.status === "failed"
                        ? "Failed"
                        : job.status === "completed"
                          ? "Ready"
                          : `Processing (${job.progress}%)`}
                      {job.page != null ? ` · Page ${job.page}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="vr-job-card__dismiss"
                  aria-label="Dismiss"
                  onClick={() => removeJob(job.id)}
                >
                  <MaterialIcon name="close" />
                </button>
              </div>
              <div className="vr-job-card__bar">
                <div
                  className={`vr-job-card__fill${job.status === "failed" ? " vr-job-card__fill--error" : ""}`}
                  style={{ width: `${job.status === "failed" ? 100 : job.progress}%` }}
                />
              </div>
              <div className="vr-job-card__footer">
                <span>{job.error || job.stage}</span>
                <span>{job.id.slice(0, 8)}</span>
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
