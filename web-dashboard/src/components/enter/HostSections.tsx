import { useId } from "react";
import { ROTATION_MINUTE_PRESETS } from "../../api/sessions";
import type { GameSession } from "../../api/gameState";
import { MaterialIcon } from "../MaterialIcon";
import { TurnCountdown } from "../TurnCountdown";
import type { AllowlistState } from "./useAllowlist";
import type { DemoAdminState } from "./useDemoAdmin";
import type { DepthState } from "./useDepthScale";
import type { useSpaceActions } from "./useSpaceActions";

export function DepthControl({ depth }: { depth: DepthState }) {
  return (
    <>
      <label className="vr-enter__depth" title="Live Z relief on Quest / WebGL / desktop">
        <span className="vr-enter__depth-label">
          <MaterialIcon name="height" />
          Depth
        </span>
        <input
          type="range"
          className="vr-enter__depth-range"
          min={0}
          max={5}
          step={0.05}
          value={depth.draft}
          disabled={depth.busy}
          onChange={(e) => depth.setDraft(Number(e.target.value))}
          aria-valuetext={`${depth.draft.toFixed(2)}×`}
        />
        <span className="vr-enter__depth-value">{depth.draft.toFixed(2)}×</span>
      </label>
      {depth.error ? <p className="vr-enter__depth-error">{depth.error}</p> : null}
    </>
  );
}

const DEMO_CATEGORIES = ["Manuscripts", "Medieval", "Forgery", "Handwriting", "Examples"];

function DemoFields({ demo, busy }: { demo: DemoAdminState; busy: boolean }) {
  const catId = useId();
  const sumId = useId();
  const listId = useId();
  return (
    <>
      <div className="vr-enter__demo-field">
        <label htmlFor={catId}>Category</label>
        <input
          id={catId}
          list={listId}
          className="vr-enter__invite-input"
          value={demo.category}
          onChange={(e) => demo.setCategory(e.target.value)}
          maxLength={64}
          disabled={busy}
        />
        <datalist id={listId}>
          {DEMO_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </datalist>
      </div>
      <div className="vr-enter__demo-field">
        <label htmlFor={sumId}>Summary</label>
        <input
          id={sumId}
          className="vr-enter__invite-input"
          value={demo.summary}
          onChange={(e) => demo.setSummary(e.target.value)}
          maxLength={280}
          placeholder="Short blurb for the catalog"
          disabled={busy}
        />
      </div>
    </>
  );
}

export function DemoAdminPanel({ demo, busy }: { demo: DemoAdminState; busy: boolean }) {
  return (
    <section className="vr-enter__demo-admin" aria-label="Try now demo catalog">
      <p className="vr-enter__demo-admin-title">
        <MaterialIcon name="auto_awesome" />
        Try now catalog
      </p>
      <DemoFields demo={demo} busy={busy} />
      <div className="vr-enter__demo-actions">
        <button
          type="button"
          className="vr-enter__text-btn"
          onClick={() => demo.save(true)}
          disabled={busy}
          title="Requires a playlist; enables kiosk for guests"
        >
          <MaterialIcon name={demo.enabled ? "published_with_changes" : "publish"} />
          {demo.enabled ? "Update demo" : "Publish as demo"}
        </button>
        {demo.enabled ? (
          <button type="button" className="vr-enter__text-btn" onClick={() => demo.save(false)} disabled={busy}>
            <MaterialIcon name="unpublished" />
            Unpublish
          </button>
        ) : null}
      </div>
    </section>
  );
}

type TurnTimerProps = {
  busy: boolean;
  session: GameSession | null;
  ended: boolean;
  space: ReturnType<typeof useSpaceActions>;
};

export function TurnTimer({ busy, session, ended, space }: TurnTimerProps) {
  return (
    <section className="vr-enter__turn-timer" aria-label="Turn timer">
      <span className="vr-enter__turn-label">Turn timer</span>
      {ROTATION_MINUTE_PRESETS.map((minutes) => (
        <button
          key={minutes}
          type="button"
          className="vr-enter__text-btn"
          onClick={() => void space.startTurn(minutes)}
          disabled={busy}
          title={`Start a ${minutes}-minute turn`}
        >
          <MaterialIcon name="timer" />
          {minutes} min
        </button>
      ))}
      <TurnCountdown session={session} ticking />
      <button
        type="button"
        className="vr-btn vr-btn--primary vr-enter__turn-reset"
        onClick={() => void space.resetTurn()}
        disabled={busy || ended}
        title="End the current turn and reset the experience"
      >
        <MaterialIcon name="restart_alt" />
        Reset
      </button>
    </section>
  );
}

type AllowlistPanelProps = { allowlist: AllowlistState; busy: boolean; visibility: "public" | "private" };

function AllowlistList({ allowlist, busy }: Pick<AllowlistPanelProps, "allowlist" | "busy">) {
  return (
    <ul className="vr-enter__allowlist-list">
      {allowlist.entries.map((entry) => (
        <li key={entry.id}>
          <span>{entry.email || entry.subjectSub || "entry"}</span>
          <button
            type="button"
            className="vr-enter__text-btn"
            onClick={() => void allowlist.onRemove(entry.id)}
            disabled={busy}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AllowlistPanel({ allowlist, busy, visibility }: AllowlistPanelProps) {
  return (
    <section className="vr-enter__allowlist" aria-label="Space allowlist">
      <form className="vr-enter__invite-form" onSubmit={allowlist.onAdd}>
        <span className="vr-enter__allowlist-label">Allowlist</span>
        <input
          type="email"
          className="vr-enter__invite-input"
          placeholder="add@memphis.edu"
          value={allowlist.email}
          onChange={(e) => allowlist.setEmail(e.target.value)}
          aria-label="Allowlist email"
        />
        <button type="submit" className="vr-enter__text-btn" disabled={busy || !allowlist.email.trim()}>
          <MaterialIcon name="person_add" />
          Add
        </button>
      </form>
      {allowlist.entries.length ? (
        <AllowlistList allowlist={allowlist} busy={busy} />
      ) : (
        <p className="vr-enter__allowlist-empty">
          {visibility === "private"
            ? "Private space - add emails (or check Allowlist on invite)."
            : "Optional allowlist (used if you switch to Private)."}
        </p>
      )}
    </section>
  );
}
