/**
 * Pure CSV parsing for the champions sheet. No I/O: a string goes in, domain
 * data comes out — this is the cheap-to-TDD core (server/CLAUDE.md). Fetching
 * the CSV from Google Sheets is a separate concern that lives in `ingest/`.
 *
 * Uses `csv-parse` (RFC4180 compliant) so that:
 *  - quoted fields containing commas are parsed correctly, and
 *  - quoted fields containing embedded newlines span multiple physical lines.
 */
import { parse } from "csv-parse/sync";

// Column headers as they appear in the LIVE VGCPastes Google Sheets export.
// Located BY NAME so a column shuffle does not silently break extraction
// (CLAUDE.md hurdle #3).
const HEADERS = {
  id: "Team ID",
  name: "Team Description",
  ownerName: "Full Name",
  ownerHandle: "Owner",
  // The live sheet uses these exact strings (verified by probing the export):
  tournament: "Tournament / Event",
  rank: "Rank",
  pokepaste: "Pokepaste",
  // The 6 species live in this column AND the next 5 (which have BLANK headers).
  // We cannot find the blank headers by name; we use offset from this one.
  speciesFirst: "Pokemon Text for Copypasta",
} as const;

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
  // Parse the whole sheet with a proper RFC4180 parser.
  // relax_column_count: banner rows are short (ragged).
  // bom: Google Sheets sometimes prepends a UTF-8 BOM.
  const records = parse(csv, {
    relax_column_count: true,
    bom: true,
  }) as string[][];

  // Skip banner rows: the real header is the FIRST record that contains "Team ID".
  // (Records 0 and 1 are banner rows in the live sheet; we locate dynamically so
  // the code is resilient if the sheet ever gains/loses a banner row.)
  const headerIdx = records.findIndex((r) => r.includes(HEADERS.id));
  if (headerIdx < 0) return [];

  const header = records[headerIdx];
  if (header === undefined) return [];

  // Locate each column by name. Returns -1 when the column is absent.
  const col = (name: string): number => header.indexOf(name);

  const idCol = col(HEADERS.id);
  const nameCol = col(HEADERS.name);
  const ownerNameCol = col(HEADERS.ownerName);
  const ownerHandleCol = col(HEADERS.ownerHandle);
  const tournamentCol = col(HEADERS.tournament);
  const rankCol = col(HEADERS.rank);
  const pokepasteCol = col(HEADERS.pokepaste);

  // Species block: "Pokemon Text for Copypasta" is the FIRST species column;
  // the next 5 have blank headers and are located by numeric offset.
  const speciesStart = col(HEADERS.speciesFirst);

  // Returns the trimmed cell value, or null when the column is absent/empty.
  const opt = (cells: string[], i: number): string | null => {
    if (i < 0) return null;
    const v = cells[i]?.trim();
    return v ? v : null;
  };

  const results: RawTeam[] = [];

  for (let i = headerIdx + 1; i < records.length; i++) {
    const cells = records[i];
    if (cells === undefined) continue;

    const id = opt(cells, idCol) ?? "";
    // Drop rows whose Team ID is empty: these are banner remnants or trailing
    // blank rows that csv-parse parsed as a single-cell empty record.
    if (!id) continue;

    // Collect the 6 species from the named column + 5 offsets; drop blanks.
    const species: string[] =
      speciesStart >= 0
        ? ([0, 1, 2, 3, 4, 5] as const)
            .map((offset) => cells[speciesStart + offset]?.trim() ?? "")
            .filter((s) => s.length > 0)
        : [];

    results.push({
      id,
      name: opt(cells, nameCol) ?? "",
      ownerName: opt(cells, ownerNameCol),
      ownerHandle: opt(cells, ownerHandleCol),
      tournament: opt(cells, tournamentCol),
      rank: opt(cells, rankCol),
      pokepasteUrl: opt(cells, pokepasteCol) ?? "",
      species,
    });
  }

  return results;
}
