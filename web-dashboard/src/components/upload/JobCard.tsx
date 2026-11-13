import { MaterialIcon } from "../MaterialIcon";
import { jobStatusText, type LocalJob } from "./uploadJobs";

type JobCardProps = {
  job: LocalJob;
  onDismiss: (id: string) => void;
  onViewModel?: (modelId: string) => void;
};

function JobFooter({ job, onViewModel }: Pick<JobCardProps, "job" | "onViewModel">) {
  const modelId = job.status === "completed" ? job.modelId : undefined;
  return (
    <div className="vr-job-card__footer">
      <span>{job.error || job.stage}</span>
      <span className="vr-job-card__footer-actions">
        {modelId && onViewModel ? (
          <button type="button" className="vr-job-card__view" onClick={() => onViewModel(modelId)}>
            View in library
          </button>
        ) : null}
        <span>{job.id.slice(0, 8)}</span>
      </span>
    </div>
  );
}

export function JobCard({ job, onDismiss, onViewModel }: JobCardProps) {
  const failed = job.status === "failed";
  return (
    <article className="vr-job-card">
      <div className="vr-job-card__top">
        <div className="vr-job-card__meta">
          <div className="vr-job-card__icon">
            <MaterialIcon name="description" />
          </div>
          <div>
            <p className="vr-job-card__name">{job.title}</p>
            <p className="vr-job-card__filename">{job.filename}</p>
            <p className="vr-job-card__status">
              {jobStatusText(job)}
              {job.page != null ? ` · Page ${job.page}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="vr-job-card__dismiss"
          aria-label={`Dismiss ${job.title}`}
          onClick={() => onDismiss(job.id)}
        >
          <MaterialIcon name="close" />
        </button>
      </div>
      <div className="vr-job-card__bar">
        <div
          className={`vr-job-card__fill${failed ? " vr-job-card__fill--error" : ""}`}
          style={{ width: `${failed ? 100 : job.progress}%` }}
        />
      </div>
      <JobFooter job={job} onViewModel={onViewModel} />
    </article>
  );
}
