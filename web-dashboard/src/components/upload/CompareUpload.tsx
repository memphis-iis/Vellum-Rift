import { useRef } from "react";
import { MaterialIcon } from "../MaterialIcon";
import { ACCEPT, isPdf } from "./uploadJobs";

type SideProps = {
  side: "left" | "right";
  file: File | null;
  page: number;
  disabled: boolean;
  onFile: (file: File | null) => void;
  onPage: (page: number) => void;
};

function SideChooser({ side, file, page, disabled, onFile, onPage }: SideProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const label = side === "left" ? "Left" : "Right";
  const pageId = `vr-upload-page-${side}`;
  return (
    <div className="vr-upload__compare-side">
      <span className="vr-upload__page-label">
        <MaterialIcon name={side === "left" ? "chevron_left" : "chevron_right"} />
        {label}
      </span>
      <button
        type="button"
        className="vr-btn vr-btn--outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        {file ? file.name : `Choose ${side} file`}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-label={`Choose ${side} asset file`}
        className="vr-upload__file-input"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {file && isPdf(file) ? (
        <label className="vr-upload__page-field" htmlFor={pageId}>
          <span className="vr-upload__page-label">{label} page</span>
          <input
            id={pageId}
            className="vr-upload__page-input"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={page}
            disabled={disabled}
            onChange={(e) => {
              const next = Number(e.target.value);
              onPage(Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1);
            }}
          />
        </label>
      ) : null}
    </div>
  );
}

export type CompareState = {
  left: File | null;
  right: File | null;
  pageLeft: number;
  pageRight: number;
};

type CompareProps = {
  state: CompareState;
  onChange: (next: CompareState) => void;
  hasTitle: boolean;
  uploading: boolean;
  onSubmit: () => void;
};

export function CompareUpload({ state, onChange, hasTitle, uploading, onSubmit }: CompareProps) {
  const locked = uploading || !hasTitle;
  return (
    <section className="vr-upload__compare" aria-label="Side-by-side assets">
      <div className="vr-upload__compare-grid">
        <SideChooser
          side="left"
          file={state.left}
          page={state.pageLeft}
          disabled={locked}
          onFile={(left) => onChange({ ...state, left })}
          onPage={(pageLeft) => onChange({ ...state, pageLeft })}
        />
        <SideChooser
          side="right"
          file={state.right}
          page={state.pageRight}
          disabled={locked}
          onFile={(right) => onChange({ ...state, right })}
          onPage={(pageRight) => onChange({ ...state, pageRight })}
        />
      </div>
      <button
        type="button"
        className="vr-btn vr-btn--primary"
        disabled={locked || !state.left || !state.right}
        onClick={onSubmit}
      >
        {uploading ? "Uploading…" : "Upload side-by-side"}
      </button>
    </section>
  );
}
