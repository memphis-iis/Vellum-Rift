import { API_BASE_URL } from "./config";
import { getAuthHeaders } from "./authHeaders";
import { assertId } from "../lib/assert";

function authHeaders(json = false): Headers {
  const headers = getAuthHeaders();
  if (!json) headers.delete("Content-Type");
  else if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return headers;
}

export type UploadJobResponse = {
  jobId: string;
  status: string;
  uploadKey?: string;
};

export type JobStatus = {
  jobId: string;
  status: string;
  progress?: number;
  stage?: string;
  error?: string;
  errorMessage?: string | null;
  modelId?: string | null;
  result?: unknown;
  filename?: string;
};

export type UploadOptions = {
  /** 1-based PDF page (ignored for raster images). */
  page?: number;
  /** Human-readable document title stored on the job/model. */
  label?: string;
  /** Destination library folder; defaults to Uploads on the server. */
  folderId?: string;
};

export type FitMode = "scale" | "pad";

export type ComparisonUploadOptions = {
  left: File;
  right: File;
  fitMode: FitMode;
  pageLeft?: number;
  pageRight?: number;
  label?: string;
  folderId?: string;
};

export async function uploadManuscript(
  file: File,
  options: UploadOptions = {},
): Promise<UploadJobResponse> {
  const body = new FormData();
  body.append("file", file);
  if (options.page != null) {
    body.append("page", String(options.page));
  }
  if (options.label != null && options.label.trim()) {
    body.append("label", options.label.trim());
  }
  if (options.folderId != null && options.folderId.trim()) {
    body.append("folderId", options.folderId.trim());
  }

  const res = await fetch(`${API_BASE_URL}/api/upload`, {
    method: "POST",
    headers: authHeaders(false),
    body,
  });

  const data = (await res.json().catch(() => ({}))) as UploadJobResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data;
}

/** Upload two manuscripts; server stitches them side-by-side then meshes once. */
export async function uploadManuscriptComparison(
  options: ComparisonUploadOptions,
): Promise<UploadJobResponse> {
  const body = new FormData();
  body.append("file", options.left);
  body.append("fileB", options.right);
  body.append("fitMode", options.fitMode);
  if (options.pageLeft != null) {
    body.append("page", String(options.pageLeft));
  }
  if (options.pageRight != null) {
    body.append("pageB", String(options.pageRight));
  }
  if (options.label != null && options.label.trim()) {
    body.append("label", options.label.trim());
  }
  if (options.folderId != null && options.folderId.trim()) {
    body.append("folderId", options.folderId.trim());
  }

  const res = await fetch(`${API_BASE_URL}/api/upload`, {
    method: "POST",
    headers: authHeaders(false),
    body,
  });

  const data = (await res.json().catch(() => ({}))) as UploadJobResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Upload failed (${res.status})`);
  }
  return data;
}

export async function fetchJob(jobId: string): Promise<JobStatus> {
  assertId(jobId, "jobId");
  const res = await fetch(`${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(true),
  });
  const data = (await res.json().catch(() => ({}))) as JobStatus & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Job lookup failed (${res.status})`);
  }
  return data;
}
