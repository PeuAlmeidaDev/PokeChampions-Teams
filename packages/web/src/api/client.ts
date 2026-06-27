/**
 * The web app's only door to data: talks to our own `/api`, never to the sheet
 * or PokeAPI directly (web/CLAUDE.md). The response is re-validated against the
 * shared contract here — an anti-corruption layer, so server↔web drift fails
 * loudly in dev instead of rendering garbage. Components stay fetch-free and
 * receive ready data via props.
 */

import {
  TeamsResponseSchema,
  type TeamsResponse,
  TeamDetailSchema,
  type TeamDetail,
} from "@pokemon-champions/shared";

export async function fetchTeams(): Promise<TeamsResponse> {
  const res = await fetch("/api/teams");
  if (!res.ok) {
    throw new Error(`Failed to fetch teams: HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  return TeamsResponseSchema.parse(json);
}

export async function fetchTeamDetail(id: string): Promise<TeamDetail> {
  const res = await fetch(`/api/teams/${encodeURIComponent(id)}/detail`);
  if (!res.ok) {
    throw new Error(`Failed to fetch team detail: HTTP ${res.status}`);
  }
  const json: unknown = await res.json();
  return TeamDetailSchema.parse(json);
}
