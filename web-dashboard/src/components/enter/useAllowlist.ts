import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  addAllowlistEmail,
  fetchAllowlist,
  inviteToSession,
  removeAllowlistEntry,
  type AllowlistEntry,
} from "../../api/gameState";
import { inviteResultMessage } from "./helpers";
import type { HostRunner } from "./useHostRunner";

type AllowlistContext = {
  host: HostRunner;
  sessionId: string | null;
  isHost: boolean;
  visibility: "public" | "private";
};

function useAllowlistEntries(sessionId: string | null, isHost: boolean) {
  const [entries, setEntries] = useState<AllowlistEntry[]>([]);

  useEffect(() => {
    if (!sessionId || !isHost) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    fetchAllowlist(sessionId)
      .then((next) => {
        if (!cancelled) setEntries(next);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, isHost]);

  const refresh = useCallback(
    async (id: string) => setEntries(await fetchAllowlist(id)),
    [],
  );
  return { entries, refresh };
}

export function useAllowlist({ host, sessionId, isHost, visibility }: AllowlistContext) {
  const { entries, refresh } = useAllowlistEntries(sessionId, isHost);
  const [email, setEmail] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [addInviteToAllowlist, setAddInviteToAllowlist] = useState(true);

  useEffect(() => {
    setAddInviteToAllowlist(visibility === "private");
  }, [visibility]);

  const onAdd = (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;
    void host.act("Allowlist add failed", async (id) => {
      await addAllowlistEmail(id, value);
      await refresh(id);
      setEmail("");
      return `Added ${value} to allowlist`;
    });
  };

  const onRemove = (entryId: string) =>
    host.act("Allowlist remove failed", async (id) => {
      await removeAllowlistEntry(id, entryId);
      await refresh(id);
    });

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault();
    const to = inviteEmail.trim();
    if (!sessionId || !to || inviteBusy || !isHost) return;
    setInviteBusy(true);
    host.setStatus(null);
    try {
      const result = await inviteToSession(sessionId, to, { addToAllowlist: addInviteToAllowlist });
      host.setStatus(inviteResultMessage(result));
      if (addInviteToAllowlist) await refresh(sessionId);
      setInviteEmail("");
    } catch (err) {
      host.setStatus(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  };

  return {
    entries,
    email,
    setEmail,
    onAdd,
    onRemove,
    invite: { email: inviteEmail, setEmail: setInviteEmail, busy: inviteBusy, send: sendInvite },
    addInviteToAllowlist,
    setAddInviteToAllowlist,
  };
}

export type AllowlistState = ReturnType<typeof useAllowlist>;
