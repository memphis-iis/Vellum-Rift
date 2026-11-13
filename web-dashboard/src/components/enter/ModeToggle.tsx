import type { EnterMode } from "./helpers";

type ModeToggleProps = {
  mode: EnterMode;
  onChange: (mode: EnterMode) => void;
};

const MODES: { id: EnterMode; label: string; title?: string }[] = [
  { id: "play", label: "Play" },
  { id: "observer", label: "Observer", title: "Museum wall - auto camera, chat, radar" },
];

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div className="vr-enter__mode" role="group" aria-label="Enter mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`vr-enter__mode-btn${mode === m.id ? " is-active" : ""}`}
          onClick={() => onChange(m.id)}
          aria-pressed={mode === m.id}
          title={m.title}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
