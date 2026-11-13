import { useRef, useState, type DragEvent, type RefObject } from "react";
import { MaterialIcon } from "../MaterialIcon";
import { ACCEPT } from "./uploadJobs";

type DropzoneProps = {
  hasTitle: boolean;
  uploading: boolean;
  /** Returns false when the title gate blocks the picker. */
  canOpenPicker: () => boolean;
  onFiles: (files: FileList) => void;
};

function FileInput(props: {
  inputRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: FileList) => void;
}) {
  return (
    <input
      ref={props.inputRef}
      type="file"
      accept={ACCEPT}
      multiple
      tabIndex={-1}
      aria-label="Choose manuscript files"
      className="vr-upload__file-input"
      onChange={(e) => {
        if (e.target.files) props.onFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );
}

export function Dropzone({ hasTitle, uploading, canOpenPicker, onFiles }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const openPicker = (): void => {
    if (canOpenPicker()) inputRef.current?.click();
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  };
  const state = `${dragging ? " vr-dropzone--active" : ""}${hasTitle ? "" : " vr-dropzone--locked"}`;

  return (
    <div
      className={`vr-dropzone${state}`}
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <MaterialIcon name="cloud_upload" className="vr-dropzone__icon" />
      <h2 className="vr-dropzone__heading">Drag &amp; Drop Manuscripts</h2>
      <p className="vr-dropzone__hint" id="vr-dropzone-hint">
        {hasTitle ? "or click to browse local files" : "Enter a document title above first"}
      </p>
      <button
        type="button"
        className="vr-btn vr-btn--outline"
        disabled={uploading}
        aria-describedby="vr-dropzone-hint"
        onClick={openPicker}
      >
        {uploading ? "Uploading…" : "Select Files"}
      </button>
      <FileInput inputRef={inputRef} onFiles={onFiles} />
    </div>
  );
}
