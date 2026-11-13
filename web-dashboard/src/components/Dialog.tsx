import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type DialogProps = {
  /** id of the heading element that names the dialog */
  titleId: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
};

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
}

/** Moves focus into the dialog on mount and restores it on unmount. */
function useFocusScope(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    const target = root.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(root)[0] ?? root;
    target.focus();
    return () => {
      if (previous && previous.isConnected) previous.focus();
    };
  }, [ref]);
}

/** Wraps Tab / Shift+Tab inside the dialog. */
function trapTab(event: KeyboardEvent, root: HTMLElement) {
  const items = focusables(root);
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) {
    event.preventDefault();
    return;
  }
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === root)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Accessible modal: role=dialog, aria-modal, Escape closes, Tab is trapped,
 * focus moves in on open and returns to the trigger on close.
 * Mark the preferred initial control with `data-autofocus`.
 */
export function Dialog({ titleId, onClose, className = "", children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusScope(ref);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      } else if (event.key === "Tab") {
        trapTab(event, root);
      }
    };
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="vr-docs__dialog-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`vr-docs__dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
