import { API_BASE_URL } from "./config";
import { TOKEN_STORAGE_KEY } from "../auth/config";

function authHeaders(json = false): Headers {
  const headers = new Headers();
  try {
    const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (token && token !== "local-dev") {
      headers.set("Authorization", `Bearer ${token}`);
    }
  } catch {
    /* ignore */
  }
  if (json) headers.set("Content-Type", "application/json");
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
  const res = await fetch(`${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}`, {
    headers: authHeaders(true),
  });
  const data = (await res.json().catch(() => ({}))) as JobStatus & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Job lookup failed (${res.status})`);
  }
  return data;
}
