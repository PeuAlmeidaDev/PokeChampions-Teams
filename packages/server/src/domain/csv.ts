/**
 * Pure CSV parsing for the champions sheet. No I/O: a string goes in, domain
 * data comes out — this is the cheap-to-TDD core (server/CLAUDE.md). Fetching
 * the CSV from Google Sheets is a separate concern that lives in `ingest/`.
 */

// Columns are located by these header names, never by fixed position: the real
// sheet shuffles columns (CLAUDE.md hurdle #3). Confirm against the live header
// row when wiring real ingest (plan Task 9).
const HEADERS = {
  id: "Team ID",
  name: "Team Description",
  ownerName: "Full Name",
  ownerHandle: "Owner",
  tournament: "Tournament",
  rank: "Placement",
  pokepaste: "Pokepaste",
} as const;

/** Header pattern for the six Pokémon columns, e.g. "Pokemon 1".."Pokemon 6". */
const SPECIES_HEADER = /^Pok[eé]mon\s*\d+$/i;

/**
 * A team as read straight from the sheet, before sprites are resolved.
 * Intentionally NOT the shared `Team`: that contract needs PokeAPI sprite data
 * we don't have yet. Optional fields are null when the sheet omits them; the
 * species list drops blanks, so a partial paste yields fewer than six.
 */
export interface RawTeam {
  id: string;
  name: string;
  ownerName: string | null;
  ownerHandle: string | null;
  tournament: string | null;
  rank: string | null;
  pokepasteUrl: string;
  species: string[];
}

export function parseTeamsCsv(csv: string): RawTeam[] {
  const [headerLine, ...rows] = csv.trim().split("\n");
  if (headerLine === undefined) return [];

  const headers = headerLine.split(",");
  const col = (name: string): number => headers.indexOf(name);

  const idCol = col(HEADERS.id);
  const nameCol = col(HEADERS.name);
  const ownerNameCol = col(HEADERS.ownerName);
  const ownerHandleCol = col(HEADERS.ownerHandle);
  const tournamentCol = col(HEADERS.tournament);
  const rankCol = col(HEADERS.rank);
  const pokepasteCol = col(HEADERS.pokepaste);
  const speciesCols = headers
    .map((h, i) => (SPECIES_HEADER.test(h) ? i : -1))
    .filter((i) => i >= 0);

  // A cell value, or null when the column is absent/empty (optional fields).
  const opt = (cells: string[], i: number): string | null => {
    if (i < 0) return null;
    const v = cells[i]?.trim();
    return v ? v : null;
  };

  return rows.map((row) => {
    const cells = row.split(",");
    return {
      id: opt(cells, idCol) ?? "",
      name: opt(cells, nameCol) ?? "",
      ownerName: opt(cells, ownerNameCol),
      ownerHandle: opt(cells, ownerHandleCol),
      tournament: opt(cells, tournamentCol),
      rank: opt(cells, rankCol),
      pokepasteUrl: opt(cells, pokepasteCol) ?? "",
      species: speciesCols
        .map((i) => cells[i]?.trim() ?? "")
        .filter((s) => s.length > 0),
    };
  });
}
