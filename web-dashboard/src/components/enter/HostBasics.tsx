import type { FormEvent } from "react";
import { MaterialIcon } from "../MaterialIcon";
import type { CopyKind } from "./helpers";
import type { AllowlistState } from "./useAllowlist";

import type { LaunchLinks } from "./useLaunchLinks";
import type { useSpaceActions } from "./useSpaceActions";

type SpaceActions = ReturnType<typeof useSpaceActions>;

type SpaceRowProps = {
  busy: boolean;
  visibility: "public" | "private";
  spaceKind: string;
  kioskEnabled: boolean;
  space: SpaceActions;
};

export function SpaceRow({ busy, visibility, spaceKind, kioskEnabled, space }: SpaceRowProps) {
  const isEvent = spaceKind === "event";
  return (
    <div className="vr-enter__host-ops-row" role="group" aria-label="Space settings">
      <span className="vr-enter__host-ops-row-label">Space</span>
      <button type="button" className="vr-enter__text-btn" onClick={() => void space.toggleVisibility()} disabled={busy}>
        <MaterialIcon name={visibility === "private" ? "lock" : "public"} />
        {visibility === "private" ? "Private" : "Public"}
      </button>
      <button
        type="button"
        className="vr-enter__text-btn"
        onClick={() => void space.toggleEventKind()}
        disabled={busy}
        title="Feature this space as an event on Home"
      >
        <MaterialIcon name={isEvent ? "event_available" : "event"} />
        {isEvent ? "Event" : "Exploration"}
      </button>
      <button
        type="button"
        className="vr-enter__text-btn"
        onClick={() => void space.toggleKiosk()}
        disabled={busy}
        title="Let museum guests join without Bluekey"
      >
        <MaterialIcon name={kioskEnabled ? "storefront" : "store"} />
        {kioskEnabled ? "Kiosk on" : "Kiosk off"}
      </button>
    </div>
  );
}

type CopyButtonProps = {
  kind: CopyKind;
  text: string;
  copied: CopyKind | null;
  onCopy: (kind: CopyKind, text: string) => void;
  icon: string;
  label: string;
  title?: string;
};

function CopyButton({ kind, text, copied, onCopy, icon, label, title }: CopyButtonProps) {
  return (
    <button
      type="button"
      className="vr-enter__text-btn"
      onClick={() => onCopy(kind, text)}
      disabled={!text}
      title={title}
    >
      <MaterialIcon name={icon} />
      {copied === kind ? "Copied" : label}
    </button>
  );
}

type InviteFormProps = { allowlist: AllowlistState };

function InviteForm({ allowlist }: InviteFormProps) {
  const { invite } = allowlist;
  return (
    <form className="vr-enter__invite-form" onSubmit={(e: FormEvent) => void invite.send(e)}>
      <input
        type="email"
        className="vr-enter__invite-input"
        placeholder="colleague@memphis.edu"
        value={invite.email}
        onChange={(e) => invite.setEmail(e.target.value)}
        aria-label="Invite email"
        required
      />
      <label className="vr-enter__allowlist-check">
        <input
          type="checkbox"
          checked={allowlist.addInviteToAllowlist}
          onChange={(e) => allowlist.setAddInviteToAllowlist(e.target.checked)}
        />
        Allowlist
      </label>
      <button type="submit" className="vr-enter__text-btn" disabled={invite.busy || !invite.email.trim()}>
        <MaterialIcon name="mail" />
        {invite.busy ? "Sending…" : "Email invite"}
      </button>
    </form>
  );
}

type ShareRowProps = {
  kioskEnabled: boolean;
  links: LaunchLinks;
  copied: CopyKind | null;
  onCopy: (kind: CopyKind, text: string) => void;
  hasShareUrl: boolean;
  onOpenShare: () => void;
  allowlist: AllowlistState;
};

export function ShareRow(props: ShareRowProps) {
  const { kioskEnabled, links, copied, onCopy } = props;
  const base = { copied, onCopy };
  return (
    <div className="vr-enter__host-ops-row" role="group" aria-label="Share">
      <span className="vr-enter__host-ops-row-label">Share</span>
      {kioskEnabled ? (
        <CopyButton {...base} kind="kiosk" text={links.kioskJoinText} icon="qr_code_2" label="Copy kiosk link" />
      ) : null}
      {links.observerUrl && links.observerLinkText ? (
        <CopyButton
          {...base}
          kind="observer"
          text={links.observerLinkText}
          icon="tv"
          label="Copy observer link"
          title="Full-screen museum wall WebGL link"
        />
      ) : null}
      <CopyButton {...base} kind="invite" text={links.inviteText} icon="content_copy" label="Copy invite" />
      {props.hasShareUrl ? (
        <button type="button" className="vr-enter__text-btn" onClick={props.onOpenShare}>
          <MaterialIcon name="qr_code_2" />
          Share QR
        </button>
      ) : null}
      <InviteForm allowlist={props.allowlist} />
    </div>
  );
}


