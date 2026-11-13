import { MaterialIcon } from "../MaterialIcon";
import type { FolderOption } from "./useUploadFolders";

type OptionsProps = {
  title: string;
  onTitleChange: (value: string) => void;
  page: number;
  onPageChange: (value: number) => void;
  folderId: string;
  onFolderChange: (value: string) => void;
  folderOptions: FolderOption[];
  foldersLoading: boolean;
  disabled: boolean;
};

function TitleField(props: Pick<OptionsProps, "title" | "onTitleChange" | "disabled">) {
  return (
    <>
      <label className="vr-upload__title-field" htmlFor="vr-upload-title">
        <span className="vr-upload__page-label">
          <MaterialIcon name="title" />
          Document title
          <span className="vr-upload__required">Required</span>
        </span>
        <input
          id="vr-upload-title"
          className="vr-upload__title-input"
          type="text"
          required
          maxLength={200}
          autoComplete="off"
          placeholder="e.g. Codex fragment - folio 12"
          value={props.title}
          disabled={props.disabled}
          onChange={(e) => props.onTitleChange(e.target.value)}
        />
      </label>
      <p className="vr-upload__page-hint">
        This title appears in the manuscript library and on the processed mesh record.
      </p>
    </>
  );
}

function PageField(props: Pick<OptionsProps, "page" | "onPageChange" | "disabled">) {
  const onChange = (raw: string): void => {
    const next = Number(raw);
    props.onPageChange(Number.isFinite(next) && next >= 1 ? Math.floor(next) : 1);
  };
  return (
    <>
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
          value={props.page}
          disabled={props.disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
      <p className="vr-upload__page-hint">
        For multi-page PDFs, choose which page to extract. Raster images ignore this setting.
      </p>
    </>
  );
}

function FolderChoices(props: Pick<OptionsProps, "folderOptions" | "foldersLoading">) {
  if (props.foldersLoading) return <option value="">Loading folders…</option>;
  if (!props.folderOptions.length) return <option value="">Uploads (default)</option>;
  return (
    <>
      {props.folderOptions.map((opt) => (
        <option key={opt.folderId} value={opt.folderId}>
          {opt.label}
        </option>
      ))}
    </>
  );
}

function FolderField(props: OptionsProps) {
  const locked = props.disabled || props.foldersLoading || !props.folderOptions.length;
  return (
    <>
      <label className="vr-upload__title-field" htmlFor="vr-upload-folder">
        <span className="vr-upload__page-label">
          <MaterialIcon name="folder" />
          Where should this land?
        </span>
        <select
          id="vr-upload-folder"
          className="vr-upload__title-input"
          value={props.folderId}
          disabled={locked}
          onChange={(e) => props.onFolderChange(e.target.value)}
        >
          <FolderChoices {...props} />
        </select>
      </label>
      <p className="vr-upload__page-hint">
        Defaults to your Uploads folder. You can move manuscripts later from the library.
      </p>
    </>
  );
}

export function DocumentOptions(props: OptionsProps) {
  return (
    <section className="vr-upload__options" aria-label="Document details">
      <TitleField title={props.title} onTitleChange={props.onTitleChange} disabled={props.disabled} />
      <PageField page={props.page} onPageChange={props.onPageChange} disabled={props.disabled} />
      <FolderField {...props} />
    </section>
  );
}
