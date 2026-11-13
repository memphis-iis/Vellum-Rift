import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "info" | "error";
type Toast = { id: number; kind: ToastKind; text: string };

export type StatusApi = {
  /** Polite announcement (role=status). */
  announce: (text: string) => void;
  /** Assertive, visible error (role=alert). */
  alert: (text: string) => void;
};

const NOOP: StatusApi = { announce: () => undefined, alert: () => undefined };
const StatusContext = createContext<StatusApi>(NOOP);

/** Upper bounds keep memory and screen-reader chatter constant (NASA rule 2). */
const MAX_TOASTS = 5;
const MAX_REMEMBERED = 50;
const DEDUPE_MS = 15_000;
const TTL_MS: Record<ToastKind, number> = { info: 6_000, error: 12_000 };

export function useStatus(): StatusApi {
  return useContext(StatusContext);
}

/** Toast queue with de-duplication so polling failures cannot spam. */
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const recent = useRef(new Map<string, number>());
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, text: string) => {
      const now = Date.now();
      const key = `${kind}:${text}`;
      const last = recent.current.get(key);
      if (last !== undefined && now - last < DEDUPE_MS) return;
      if (recent.current.size >= MAX_REMEMBERED) recent.current.clear();
      recent.current.set(key, now);
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, kind, text }].slice(-MAX_TOASTS));
      timers.current.set(id, window.setTimeout(() => dismiss(id), TTL_MS[kind]));
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((handle) => window.clearTimeout(handle));
  }, []);

  return { toasts, push, dismiss };
}

function ToastList({
  toasts,
  role,
  onDismiss,
}: {
  toasts: Toast[];
  role: "status" | "alert";
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className={`vr-status-region__list vr-status-region__list--${role}`}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-atomic="false"
    >
      {toasts.map((t) => (
        <p key={t.id} className={`vr-status-region__toast vr-status-region__toast--${t.kind}`}>
          <span>{t.text}</span>
          <button
            type="button"
            className="vr-status-region__dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </p>
      ))}
    </div>
  );
}

/**
 * App-wide live regions. Both regions stay mounted so assistive tech
 * registers them before content changes; errors are also shown visually.
 */
export function StatusProvider({ children }: { children: ReactNode }) {
  const { toasts, push, dismiss } = useToasts();
  const api = useMemo<StatusApi>(
    () => ({ announce: (t) => push("info", t), alert: (t) => push("error", t) }),
    [push],
  );

  return (
    <StatusContext.Provider value={api}>
      {children}
      <div className="vr-status-region">
        <ToastList toasts={toasts.filter((t) => t.kind === "info")} role="status" onDismiss={dismiss} />
        <ToastList toasts={toasts.filter((t) => t.kind === "error")} role="alert" onDismiss={dismiss} />
      </div>
    </StatusContext.Provider>
  );
}
