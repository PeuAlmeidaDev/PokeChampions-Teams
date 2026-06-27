/**
 * L2 disk cache for a team's detail, one file per team (data/cache/details/
 * <id>.json). One file per id avoids the read-modify-write races a shared map
 * would have under lazy single-flight. A missing or corrupt file degrades to
 * null — it must never break the request (server/CLAUDE.md graceful degradation).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TeamDetailSchema, type TeamDetail } from "@pokemon-champions/shared";

function fileFor(dir: string, id: string): string {
  return join(dir, `${id}.json`);
}

export async function readDetailCache(
  dir: string,
  id: string,
): Promise<TeamDetail | null> {
  let raw: string;
  try {
    raw = await readFile(fileFor(dir, id), "utf8");
  } catch {
    return null; // missing — not cached yet
  }
  try {
    const parsed = TeamDetailSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`[detail-cache] ignoring corrupt cache for ${id}`);
      return null;
    }
    return parsed.data;
  } catch {
    console.warn(`[detail-cache] ignoring corrupt cache for ${id}`);
    return null;
  }
}

export async function writeDetailCache(
  dir: string,
  id: string,
  detail: TeamDetail,
): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(fileFor(dir, id), JSON.stringify(detail, null, 2), "utf8");
}
