import { useCallback, useRef, useState } from "react";
import type { TeamDetail } from "@pokemon-champions/shared";
import { fetchTeamDetail } from "../api/client.js";

type Status = "loading" | "error" | "ready";

export interface UseTeamDetail {
  /** The open team's id, or null when the modal is closed. */
  selectedId: string | null;
  /** Loaded config for the open team, or null while loading/errored. */
  detail: TeamDetail | null;
  /** Fetch status of the open team's detail. */
  status: Status;
  /** Open the modal for a team and fetch its detail on demand. */
  open: (id: string) => void;
  /** Close the modal and drop the loaded detail. */
  close: () => void;
}

/**
 * Encapsulates the team-detail modal's state and on-demand fetching, keeping
 * App as a thin shell. A monotonic seq ref guards against a stale response
 * (e.g. a slow request resolving after the user opened another team or closed
 * the modal) overwriting fresher state. Data access stays behind api/.
 */
export function useTeamDetail(): UseTeamDetail {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  const seqRef = useRef(0);

  const open = useCallback((id: string) => {
    const seq = ++seqRef.current;
    setSelectedId(id);
    setDetail(null);
    setStatus("loading");
    fetchTeamDetail(id)
      .then((d) => {
        if (seq !== seqRef.current) return;
        setDetail(d);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (seq !== seqRef.current) return;
        console.error("Failed to load team detail", err);
        setStatus("error");
      });
  }, []);

  const close = useCallback(() => {
    seqRef.current++;
    setSelectedId(null);
    setDetail(null);
    setStatus("loading");
  }, []);

  return { selectedId, detail, status, open, close };
}
