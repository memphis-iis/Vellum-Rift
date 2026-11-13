import type { JobStatus } from "../../api/upload";
import type { StatusApi } from "../StatusRegion";

export type LocalJob = {
  id: string;
  filename: string;
  title: string;
  status: string;
  progress: number;
  stage: string;
  page?: number;
  modelId?: string;
  error?: string;
};

export const ACCEPT = ".tif,.tiff,.jpg,.jpeg,.png,.pdf,.webp,.bmp";
export const TITLE_REQUIRED_MESSAGE = "Enter a document title before uploading.";

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isActiveJob(job: LocalJob): boolean {
  return job.status !== "completed" && job.status !== "failed";
}

export function labelForFile(title: string, file: File, multi: boolean): string {
  return multi ? `${title} - ${file.name}` : title;
}

export function stageLabel(status: string, progress: number): string {
  if (status === "completed") return "Stabilized";
  if (status === "failed") return "Failed";
  if (status === "pending") return "Queued…";
  if (progress < 30) return "Ingesting manuscript…";
  if (progress < 55) return "Extracting topographic layers…";
  if (progress < 80) return "Building mesh…";
  return "Finalizing…";
}

function defaultProgress(status: string): number {
  if (status === "completed") return 100;
  if (status === "failed") return 0;
  return 5;
}

function resolveProgress(status: string, remote?: JobStatus): number {
  if (typeof remote?.progress !== "number") return defaultProgress(status);
  return Math.max(0, Math.min(100, Math.round(remote.progress)));
}

function remoteDetails(remote?: JobStatus): Pick<LocalJob, "modelId" | "error"> {
  return {
    modelId: remote?.modelId || undefined,
    error: remote?.errorMessage || remote?.error || undefined,
  };
}

export function normalizeJob(
  jobId: string,
  filename: string,
  title: string,
  remote?: JobStatus,
  page?: number,
): LocalJob {
  const status = remote?.status ?? "pending";
  const progress = resolveProgress(status, remote);
  return {
    id: jobId,
    filename,
    title,
    status,
    progress,
    page,
    stage: remote?.stage || stageLabel(status, progress),
    ...remoteDetails(remote),
  };
}

/** Insert a new job at the front, or merge into an existing one (keeps known fields). */
export function mergeJob(prev: LocalJob[], job: LocalJob): LocalJob[] {
  const i = prev.findIndex((j) => j.id === job.id);
  if (i === -1) return [job, ...prev];
  const existing = prev[i] as LocalJob;
  const next = [...prev];
  next[i] = {
    ...job,
    title: job.title || existing.title,
    page: job.page ?? existing.page,
    modelId: job.modelId ?? existing.modelId,
  };
  return next;
}

export function jobStatusText(job: LocalJob): string {
  if (job.status === "failed") return "Failed";
  if (job.status === "completed") return "Ready";
  return `Processing (${job.progress}%)`;
}

export function announceTransition(status: StatusApi, prev: LocalJob, next: LocalJob): void {
  if (next.status === prev.status) return;
  const name = next.title || next.filename;
  if (next.status === "completed") status.announce(`${name}: processing complete.`);
  if (next.status === "failed") status.alert(`${name}: processing failed.`);
}
