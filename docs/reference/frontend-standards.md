# Frontend standards (web-dashboard)

All frontend code must follow these rules. They are enforced by ESLint and tests.

## Workflow
branch -> code -> test -> document -> PR -> merge. Branch names: `type/<issue>-short-name`.

## Commands (run in `web-dashboard/`)
- `pnpm lint` - `tsc --noEmit` plus ESLint (fails on errors).
- `pnpm lint:strict` - ESLint with zero warnings allowed.
- `pnpm test` - Vitest, Testing Library, and axe (`src/test/axe.ts`).

## Rules
- Time/space: lowest practical Big O; no O(n) lookups in render paths (use `Map`/`useMemo`).
- NASA Power of 10 (adapted): functions <= 60 lines, complexity <= 10, nesting <= 4,
  bounded loops and polling, no empty `catch`, check every return value, no `eval`.
- Accessibility (WCAG 2.2 AA, Norman/Krug usability): `eslint-plugin-jsx-a11y`, keyboard
  access, visible focus, live regions for async state, minimum text size 0.75rem,
  respect `prefers-reduced-motion`.

## Rollout
Legacy files emit warnings. When a PR touches or refactors a file, add it to `ENFORCED`
in `web-dashboard/eslint.config.js` so every rule becomes an error for that file.
Each component PR should include an axe test.

## Shared components
- `components/Dialog.tsx`: all modals. Provides `role="dialog"`, `aria-modal`, Escape to
  close, Tab trap, and focus return. Mark the initial control with `data-autofocus`
  (do not use `autoFocus`).

## Focus
- `vr-theme.css` defines a global `:focus-visible` ring (`--vr-focus-ring`). Never use
  `outline: none`/`0`; use a replacement ring with >= 3:1 contrast. Guarded by
  `src/styles/css-a11y.test.ts`.
- Minimum text size is `0.75rem` (12px); also guarded by `css-a11y.test.ts`.
- External links that open a new tab must name the destination and say "(opens in new tab)",
  and use `rel="noopener noreferrer"`.

## Status and errors
- Wrap async feedback in `useStatus()` from `components/StatusRegion.tsx`:
  `announce(text)` (polite, `role="status"`) and `alert(text)` (visible, `role="alert"`).
  Repeats within 15 s are de-duplicated, max 5 toasts. Never leave a `catch` empty for
  user-visible work; surface the failure or recovery.
- Chat message lists use `role="log"`; icon-only buttons need `aria-label`.

## Polling
- Use `usePoll` (`hooks/usePoll.ts`) for all repeated network work. It is single-timer
  (recursive `setTimeout`), bounded (`maxAttempts` + `onGiveUp`), backs off exponentially on
  failure, pauses while the tab is hidden, and aborts on unmount.
- Never `setInterval` a network call. Fan out with `mapWithLimit` (`lib/concurrency.ts`).
- Per-second UI clocks live in their own leaf component (`TurnCountdown`) so screens do not
  re-render every tick.

## Render-path lookups
- Resolve entities by id through a memoized `Map` (`foldersById`, `modelsById` in Documents),
  not `Array.find` per render. Derived booleans/lists used in render are `useMemo`'d.
- Virtualization evaluated and deferred: lists are scoped to one folder or one session roster
  (tens of rows). Revisit if a folder routinely exceeds ~200 rows.
