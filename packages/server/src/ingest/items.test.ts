import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveItemSprites } from "./items.js";

const itemOk = (sprite: string | null) =>
  new Response(JSON.stringify({ id: 1, name: "x", sprites: { default: sprite } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
const status = (code: number) => new Response("", { status: code });
const base = "https://poke/api/v2";

describe("resolveItemSprites", () => {
  it("resolves an item name to its sprite url", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(itemOk("https://img/assault-vest.png"));
    const map = await resolveItemSprites(["Assault Vest"], { baseUrl: base, fetchImpl });
    expect(map.get("Assault Vest")).toBe("https://img/assault-vest.png");
    expect(fetchImpl).toHaveBeenCalledWith(`${base}/item/assault-vest`);
  });

  it("dedupes repeated items into a single fetch", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(itemOk("https://img/x.png"));
    await resolveItemSprites(["Leftovers", "Leftovers"], { baseUrl: base, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("omits an item on 404 (no retry) and logs it", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(status(404));
    const logger = { warn: vi.fn() };
    const map = await resolveItemSprites(["Made Up Item"], { baseUrl: base, fetchImpl, logger });
    expect(map.has("Made Up Item")).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // never retry a 404
    expect(logger.warn).toHaveBeenCalled();
  });

  it("treats a 200 with null sprites.default as a miss", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(itemOk(null));
    const map = await resolveItemSprites(["Weird Item"], { baseUrl: base, fetchImpl });
    expect(map.has("Weird Item")).toBe(false);
  });
});

describe("resolveItemSprites — 5xx/network retry path", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("retries two 500s then succeeds (3 attempts)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(status(500))
      .mockResolvedValueOnce(itemOk("https://img/leftovers.png"));
    const promise = resolveItemSprites(["Leftovers"], { baseUrl: base, fetchImpl });
    await vi.runAllTimersAsync();
    const map = await promise;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(map.get("Leftovers")).toBe("https://img/leftovers.png");
  });

  it("gives up after the retry cap and omits the item (3 attempts)", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const logger = { warn: vi.fn() };
    const promise = resolveItemSprites(["Leftovers"], { baseUrl: base, fetchImpl, logger });
    await vi.runAllTimersAsync();
    const map = await promise;
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(map.has("Leftovers")).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
