import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSprites } from "./sprites.js";

const pokeOk = (id: number, sprite: string | null) =>
  new Response(JSON.stringify({ id, sprites: { front_default: sprite } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const status = (code: number) => new Response("", { status: code });

const base = "https://poke/api/v2";

describe("resolveSprites", () => {
  it("resolves a species to its sprite url and dex id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pokeOk(25, "https://img/pikachu.png"));

    const map = await resolveSprites(["Pikachu"], { baseUrl: base, fetchImpl });

    expect(map.get("Pikachu")).toEqual({
      spriteUrl: "https://img/pikachu.png",
      dexId: 25,
    });
  });

  it("dedupes repeated species into a single fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(pokeOk(25, "https://img/pikachu.png"));

    await resolveSprites(["Pikachu", "Pikachu", "Pikachu"], { baseUrl: base, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a 404 and tries the next candidate", async () => {
    // Staraptor-Mega -> tries "staraptor-mega" (404) then "staraptor" (200).
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(404))
      .mockResolvedValueOnce(pokeOk(398, "https://img/staraptor.png"));

    const map = await resolveSprites(["Staraptor-Mega"], { baseUrl: base, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2); // one per candidate, no retry
    expect(map.get("Staraptor-Mega")?.dexId).toBe(398);
  });

  it("omits a species whose candidates all miss, and logs it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(status(404));
    const logger = { warn: vi.fn() };

    const map = await resolveSprites(["Totally-Fake"], { baseUrl: base, fetchImpl, logger });

    expect(map.has("Totally-Fake")).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("treats a 200 with null front_default as a miss (tries next candidate)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(pokeOk(670, null)) // floette-mega: no sprite
      .mockResolvedValueOnce(pokeOk(670, "https://img/floette.png")); // floette

    const map = await resolveSprites(["Floette-Mega"], { baseUrl: base, fetchImpl });

    expect(map.get("Floette-Mega")?.spriteUrl).toBe("https://img/floette.png");
  });
});

describe("resolveSprites — 5xx/network retry path", () => {
  // These exercise the real backoff() setTimeout. Fake timers + advancing the
  // pending promise keep the suite fast (no real 200ms/400ms sleeps).
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a network exception twice then succeeds (3 attempts)", async () => {
    // "Pikachu" -> first candidate "pikachu" is retried until it succeeds.
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce(pokeOk(25, "https://img/pikachu.png"));

    const promise = resolveSprites(["Pikachu"], { baseUrl: base, fetchImpl });
    await vi.runAllTimersAsync();
    const map = await promise;

    expect(fetchImpl).toHaveBeenCalledTimes(3); // attempts 0,1 retry; 2 succeeds
    expect(map.get("Pikachu")?.dexId).toBe(25);
  });

  it("retries two 500s then succeeds (3 attempts)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(pokeOk(25, "https://img/pikachu.png"));

    const promise = resolveSprites(["Pikachu"], { baseUrl: base, fetchImpl });
    await vi.runAllTimersAsync();
    const map = await promise;

    expect(fetchImpl).toHaveBeenCalledTimes(3); // attempts 0,1 retry; 2 succeeds
    expect(map.get("Pikachu")?.spriteUrl).toBe("https://img/pikachu.png");
  });

  it("gives up after the retry cap and omits the species (3 attempts)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const logger = { warn: vi.fn() };

    const promise = resolveSprites(["Pikachu"], { baseUrl: base, fetchImpl, logger });
    await vi.runAllTimersAsync();
    const map = await promise;

    expect(fetchImpl).toHaveBeenCalledTimes(3); // MAX_5XX_RETRIES=2 -> 3 total
    expect(map.has("Pikachu")).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
