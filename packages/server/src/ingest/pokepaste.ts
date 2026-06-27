/**
 * Fetches a team's pokepaste as raw Showdown text (the `/json` endpoint returns
 * { author, notes, paste, title }; we only need `paste`). Shell: network I/O.
 * Good API citizen — descriptive User-Agent, backoff retry ONLY on 5xx/network,
 * NEVER on 404 (a 404 is a bad URL, not transient). Validates the JSON shape at
 * the boundary. Throws on definitive failure so the orchestrator surfaces a 503.
 */

import { z } from "zod";
import type { FetchLike } from "./sheet.js";

const USER_AGENT =
  "PokemonChampions/0.1 (+https://github.com/PeuAlmeidaDev/PokemonChampions)";

const PokepasteJsonSchema = z.object({ paste: z.string() });

const MAX_5XX_RETRIES = 2;
const backoff = (attempt: number) =>
  new Promise((r) => setTimeout(r, 200 * 2 ** attempt));

export interface FetchPokepasteOptions {
  fetchImpl?: FetchLike;
}

export async function fetchPokepaste(
  url: string,
  opts: FetchPokepasteOptions = {},
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const jsonUrl = `${url.replace(/\/+$/, "")}/json`;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetchImpl(jsonUrl, { headers: { "User-Agent": USER_AGENT } });
    } catch (err) {
      if (attempt < MAX_5XX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw err; // network failure after retries
    }

    if (response.status >= 500) {
      if (attempt < MAX_5XX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw new Error(`pokepaste fetch failed: ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(`pokepaste fetch failed: ${response.status}`); // 404 etc — never retry
    }

    const parsed = PokepasteJsonSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error("pokepaste json shape unexpected");
    }
    return parsed.data.paste;
  }
}
