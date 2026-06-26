import { useCallback, useEffect, useState, type JSX } from "react";
import type { Team } from "@pokemon-champions/shared";
import { fetchTeams } from "./api/client.js";
import { TeamGrid } from "./components/TeamGrid.js";

type Status = "loading" | "error" | "ready";

/**
 * The web app's imperative shell: fetches teams, tracks an explicit status, and
 * renders the matching view. An explicit status (not an empty array) keeps
 * "loading" distinct from "loaded but empty". Data access stays behind api/.
 */
export function App(): JSX.Element {
  const [status, setStatus] = useState<Status>("loading");
  const [teams, setTeams] = useState<Team[]>([]);

  const load = useCallback(() => {
    let active = true;
    setStatus("loading");
    fetchTeams()
      .then((res) => {
        if (!active) return;
        setTeams(res.teams);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (!active) return;
        // Degrade gracefully: surface an error state instead of a blank crash.
        console.error("Failed to load teams", err);
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Pokémon Champions</h1>

      {status === "loading" && <p className="text-slate-500">Carregando times…</p>}

      {status === "error" && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-slate-700">Não foi possível carregar os times.</p>
          <button
            type="button"
            onClick={load}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          <p className="mb-4 text-sm text-slate-600">
            {teams.length === 1
              ? "1 time campeão"
              : `${teams.length} times campeões`}
          </p>
          <TeamGrid teams={teams} />
        </>
      )}
    </main>
  );
}
