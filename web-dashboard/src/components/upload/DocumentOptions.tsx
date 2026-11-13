import { MaterialIcon } from "../MaterialIcon";
import type { FitMode } from "../../api/upload";
import type { FolderOption } from "./useUploadFolders";

export type UploadMode = "single" | "sideBySide";

type OptionsProps = {
  title: string;
  onTitleChange: (value: string) => void;
  page: number;
  onPageChange: (value: number) => void;
  folderId: string;
  onFolderChange: (value: string) => void;
  folderOptions: FolderOption[];
  foldersLoading: boolean;
  foldersError: string | null;
  onFoldersRetry: () => void;
  mode: UploadMode;
  onModeChange: (value: UploadMode) => void;
  fitMode: FitMode;
  onFitChange: (value: FitMode) => void;
  disabled: boolean;
};

type RadioItem<T extends string> = { value: T; label: string };

function RadioRow<T extends string>(props: {
  name: string;
  legend: string;
  icon: string;
  items: RadioItem<T>[];
  value: T;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="vr-upload__mode">
      <legend className="vr-upload__page-label">
        <MaterialIcon name={props.icon} />
        {props.legend}
      </legend>
      <div className="vr-upload__mode-row">
        {props.items.map((item) => (
          <label
            key={item.value}
            className="vr-upload__radio"
            htmlFor={`${props.name}-${item.value}`}
          >
            <input
              id={`${props.name}-${item.value}`}
              type="radio"
              name={props.name}
              checked={props.value === item.value}
              disabled={props.disabled}
              onChange={() => props.onChange(item.value)}
            />
            {item.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const MODE_ITEMS: RadioItem<UploadMode>[] = [
  { value: "single", label: "Single" },
  { value: "sideBySide", label: "Side-by-side" },
];
const FIT_ITEMS: RadioItem<FitMode>[] = [
  { value: "scale", label: "Scale to match height" },
  { value: "pad", label: "Pad to match height" },
];

function FitField(props: Pick<OptionsProps, "fitMode" | "onFitChange" | "disabled">) {
  return (
    <>
      <RadioRow
        name="vr-upload-fit"
        legend="Height fit"
        icon="height"
        items={FIT_ITEMS}
        value={props.fitMode}
        disabled={props.disabled}
        onChange={props.onFitChange}
      />
      <p className="vr-upload__page-hint">
        When sides differ in height, scale resizes both to the taller side; pad letterboxes the
        shorter side with black (no resize).
      </p>
    </>
  );
}

function TitleField(props: Pick<OptionsProps, "title" | "onTitleChange" | "disabled">) {
  return (
    <>
      <label className="vr-upload__title-field" htmlFor="vr-upload-title">
        <span className="vr-upload__page-label">
          <MaterialIcon name="title" />
          Asset title
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
        This title appears in the asset library and on the processed mesh record.
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
  if (!props.folderOptions.length) return <option value="">No folders found</option>;
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

function FolderHint(props: OptionsProps) {
  if (!props.foldersError) {
    return (
      <p className="vr-upload__page-hint">Choose where the asset is stored. Defaults to Uploads.</p>
    );
  }
  return (
    <p className="vr-upload__page-hint" role="alert">
      {props.foldersError}{" "}
      <button
        type="button"
        className="vr-upload__folder-retry"
        onClick={props.onFoldersRetry}
        disabled={props.foldersLoading || props.disabled}
      >
        Retry
      </button>
    </p>
  );
}

function FolderField(props: OptionsProps) {
  const locked = props.disabled || props.foldersLoading || !props.folderOptions.length;
  return (
    <>
      <label className="vr-upload__title-field" htmlFor="vr-upload-folder">
        <span className="vr-upload__page-label">
          <MaterialIcon name="folder" />
          Library folder
        </span>
        <select
          id="vr-upload-folder"
          className="vr-upload__folder-select"
          value={props.folderId}
          disabled={locked}
          onChange={(e) => props.onFolderChange(e.target.value)}
        >
          <FolderChoices {...props} />
        </select>
      </label>
      <FolderHint {...props} />
    </>
  );
}

export function DocumentOptions(props: OptionsProps) {
  return (
    <section className="vr-upload__options" aria-label="Asset details">
      <TitleField title={props.title} onTitleChange={props.onTitleChange} disabled={props.disabled} />
      <RadioRow
        name="vr-upload-mode"
        legend="Upload mode"
        icon="view_column"
        items={MODE_ITEMS}
        value={props.mode}
        disabled={props.disabled}
        onChange={props.onModeChange}
      />
      {props.mode === "single" ? (
        <PageField page={props.page} onPageChange={props.onPageChange} disabled={props.disabled} />
      ) : (
        <FitField fitMode={props.fitMode} onFitChange={props.onFitChange} disabled={props.disabled} />
      )}
      <FolderField {...props} />
    </section>
  );
}
