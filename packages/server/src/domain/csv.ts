/**
 * Pure CSV parsing for the champions sheet. No I/O: a string goes in, domain
 * data comes out — this is the cheap-to-TDD core (server/CLAUDE.md). Fetching
 * the CSV from Google Sheets is a separate concern that lives in `ingest/`.
 */

/**
 * A team as read straight from the sheet, before sprites are resolved.
 * Intentionally NOT the shared `Team`: that contract needs PokeAPI sprite data
 * we don't have yet. This is the honest intermediate shape for the first slice.
 */
export interface RawTeam {
  id: string;
  name: string;
  pokepasteUrl: string;
}

export function parseTeamsCsv(csv: string): RawTeam[] {
  const [headerLine, ...rows] = csv.trim().split("\n");
  if (headerLine === undefined) return [];

  const headers = headerLine.split(",");
  const idCol = headers.indexOf("Team ID");
  const nameCol = headers.indexOf("Team Description");
  const pokepasteCol = headers.indexOf("Pokepaste");

  return rows.map((row) => {
    const cells = row.split(",");
    return {
      id: cells[idCol] ?? "",
      name: cells[nameCol] ?? "",
      pokepasteUrl: cells[pokepasteCol] ?? "",
    };
  });
}
