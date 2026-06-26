/**
 * Fetches the champions sheet as CSV text. Lives in the shell because it does
 * network I/O; the pure parsing is `domain/csv`. Follows the sheet's 307
 * redirect, identifies itself with a descriptive User-Agent (good API citizen),
 * and refuses an empty/failed response so the orchestrator can surface a 503.
 */

export type FetchLike = typeof globalThis.fetch;

const USER_AGENT =
  "PokemonChampions/0.1 (+https://github.com/PeuAlmeidaDev/PokemonChampions)";

export async function fetchSheetCsv(
  url: string,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<string> {
  const res = await fetchImpl(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`sheet fetch failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  if (text.trim().length === 0) {
    throw new Error("sheet fetch returned an empty body");
  }
  return text;
}
