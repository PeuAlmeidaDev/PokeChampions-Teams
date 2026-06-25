/**
 * TEMPORARY SEAM — marked to die. Hand-written sample data so the whole pipe
 * (parse -> assemble -> contract -> API -> React) can run end-to-end before the
 * real `ingest/` (sheet + pokepaste + PokeAPI over the network) exists.
 *
 * When ingest lands, delete this module and its test, and point the route at
 * the real source. Pure on purpose: it lives in `domain/` and exposes the same
 * shape ingest will (`() => Team[]`), so the swap is a one-line change.
 */

import type { Team } from "@pokemon-champions/shared";
import { assembleTeams } from "./assemble.js";
import { parseTeamsCsv } from "./csv.js";

const SAMPLE_CSV = [
  "Team ID,Team Description,Pokepaste",
  "MB1,Sun Offense,https://pokepast.es/sample-sun",
  "MB2,Trick Room Hard,https://pokepast.es/sample-tr",
  "MB3,Rain Balance,https://pokepast.es/sample-rain",
].join("\n");

export function sampleTeams(): Team[] {
  return assembleTeams(parseTeamsCsv(SAMPLE_CSV), new Map());
}
