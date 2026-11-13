import { useCallback, useRef, useState } from "react";
import { fetchJob } from "../../api/upload";
import { usePoll } from "../../hooks/usePoll";
import { mapWithLimit } from "../../lib/concurrency";
import { useStatus } from "../StatusRegion";
import {
  announceTransition,
  isActiveJob,
  mergeJob,
  normalizeJob,
  type LocalJob,
} from "./uploadJobs";

const MAX_PARALLEL_POLLS = 4;
const UPLOAD_MAX_POLLS = 900;
const POLL_INTERVAL_MS = 2000;

/** Job list plus one bounded poller that refreshes every active job. */
export function useUploadJobs() {
  const status = useStatus();
  const [jobs, setJobs] = useState<LocalJob[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const upsertJob = useCallback((job: LocalJob) => {
    setJobs((prev) => mergeJob(prev, job));
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const refreshOne = async (job: LocalJob): Promise<void> => {
    const remote = await fetchJob(job.id);
    const next = normalizeJob(job.id, job.filename, job.title, remote, job.page);
    upsertJob(next);
    announceTransition(status, job, next);
  };

  usePoll(
    async () => {
      const active = jobsRef.current.filter(isActiveJob);
      if (!active.length) return "stop";
      await mapWithLimit(active, MAX_PARALLEL_POLLS, refreshOne);
    },
    {
      intervalMs: POLL_INTERVAL_MS,
      maxAttempts: UPLOAD_MAX_POLLS,
      enabled: jobs.some(isActiveJob),
      onError: () => status.alert("Could not refresh upload status. Retrying."),
      onGiveUp: () => status.alert("Stopped checking upload status. Reload to resume."),
    },
  );

  return { jobs, upsertJob, removeJob };
}
