import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { Team, TeamDetail } from "@pokemon-champions/shared";
import { fetchTeams, fetchTeamDetail } from "./api/client.js";
import { filterTeamsByPokemon } from "./lib/filterTeams.js";
import { PokemonSearch } from "./components/PokemonSearch.js";
import { TeamGrid } from "./components/TeamGrid.js";
import { TeamDetailModal } from "./components/TeamDetailModal.js";

type Status = "loading" | "error" | "ready";

/**
 * The web app's imperative shell: fetches teams, tracks an explicit status, and
 * renders the matching view. An explicit status (not an empty array) keeps
 * "loading" distinct from "loaded but empty". Data access stays behind api/.
 *
 * Modal state: selectedId drives whether the detail modal is open; openDetail
 * fetches the team's full config on demand and threads it to TeamDetailModal.
 */
export function App(): JSX.Element {
  const [status, setStatus] = useState<Status>("loading");
  const [teams, setTeams] = useState<Team[]>([]);
  const [query, setQuery] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [detailStatus, setDetailStatus] = useState<Status>("loading");

  const detailSeqRef = useRef(0);

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

  // Derived, not stored: filter the already-loaded teams client-side (no
  // refetch). Recompute only when the data or the query changes.
  const filteredTeams = useMemo(
    () => filterTeamsByPokemon(teams, query),
    [teams, query],
  );
  const isSearching = query.trim() !== "";

  const openDetail = useCallback((id: string) => {
    const seq = ++detailSeqRef.current;
    setSelectedId(id);
    setDetail(null);
    setDetailStatus("loading");
    fetchTeamDetail(id)
      .then((d) => {
        if (seq !== detailSeqRef.current) return;
        setDetail(d);
        setDetailStatus("ready");
      })
      .catch((err: unknown) => {
        if (seq !== detailSeqRef.current) return;
        console.error("Failed to load team detail", err);
        setDetailStatus("error");
      });
  }, []);

  const closeDetail = useCallback(() => {
    detailSeqRef.current++;
    setSelectedId(null);
    setDetail(null);
    setDetailStatus("loading");
  }, []);

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
          <PokemonSearch value={query} onChange={setQuery} />
          <p className="mb-4 text-sm text-slate-600">
            {filteredTeams.length === 1
              ? "1 time campeão"
              : `${filteredTeams.length} times campeões`}
          </p>
          {isSearching && filteredTeams.length === 0 ? (
            <p className="text-slate-500">Nenhum time com esse Pokémon.</p>
          ) : (
            <TeamGrid teams={filteredTeams} onOpenDetail={openDetail} />
          )}
        </>
      )}

      {selectedId && (
        <TeamDetailModal
          status={detailStatus}
          detail={detail}
          onClose={closeDetail}
          onRetry={() => openDetail(selectedId)}
        />
      )}
    </main>
  );
}
