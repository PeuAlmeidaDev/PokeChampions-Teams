import { useEffect, type JSX } from "react";
import type { TeamDetail } from "@pokemon-champions/shared";
import { PokemonDetailCard } from "./PokemonDetailCard.js";

type Status = "loading" | "error" | "ready";

/**
 * Overlay showing a team's full config as a 2x3 grid of PokemonDetailCard.
 * Presentational + a small Esc/backdrop close affordance. Data (detail/status)
 * comes from the parent; this never fetches.
 */
export function TeamDetailModal({
  status,
  detail,
  onClose,
  onRetry,
}: {
  status: Status;
  detail: TeamDetail | null;
  onClose: () => void;
  onRetry: () => void;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-testid="modal-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 sm:p-8"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">Detalhe do time</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded px-2 py-1 text-slate-400 hover:bg-slate-800"
          >
            ✕
          </button>
        </div>

        {status === "loading" && <p className="text-slate-400">Carregando detalhe…</p>}

        {status === "error" && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-slate-300">Não foi possível carregar o detalhe.</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {status === "ready" && detail && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {detail.pokemon.map((set, i) => (
              <li key={`${set.species}-${i}`} className="h-full">
                <PokemonDetailCard set={set} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
