import { describe, expect, it, vi } from "vitest";
import { fetchSheetCsv } from "./sheet.js";

const ok = (body: string) =>
  new Response(body, { status: 200, headers: { "content-type": "text/csv" } });

describe("fetchSheetCsv", () => {
  it("returns the body text on 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok("Team ID,Team Description\nMB1,Sun"));
    await expect(fetchSheetCsv("https://sheet", fetchImpl)).resolves.toContain("MB1");
  });

  it("sends a descriptive User-Agent and follows redirects", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok("x,y\n1,2"));
    await fetchSheetCsv("https://sheet", fetchImpl);

    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init.redirect).toBe("follow");
    expect(String(init.headers["User-Agent"])).toMatch(/PokemonChampions/i);
  });

  it("throws on a non-OK response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 500 }));
    await expect(fetchSheetCsv("https://sheet", fetchImpl)).rejects.toThrow(/500/);
  });

  it("throws on an empty body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok("   "));
    await expect(fetchSheetCsv("https://sheet", fetchImpl)).rejects.toThrow(/empty/i);
  });
});
