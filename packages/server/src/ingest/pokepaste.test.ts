import { describe, it, expect, vi } from "vitest";
import { fetchPokepaste } from "./pokepaste.js";

function res(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("fetchPokepaste", () => {
  it("busca /json e devolve o campo paste", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { paste: "Pikachu\n- Thunderbolt", title: "" }));
    const paste = await fetchPokepaste("https://pokepast.es/abc", { fetchImpl });
    expect(paste).toBe("Pikachu\n- Thunderbolt");
    expect(fetchImpl).toHaveBeenCalledWith("https://pokepast.es/abc/json", expect.anything());
  });

  it("não dá retry em 404 e lança", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(404, {}));
    await expect(fetchPokepaste("https://pokepast.es/x", { fetchImpl })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("dá retry em 5xx e então sucesso", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(500, {}))
      .mockResolvedValueOnce(res(200, { paste: "ok" }));
    const paste = await fetchPokepaste("https://pokepast.es/y", { fetchImpl });
    expect(paste).toBe("ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("lança se o json não tiver o shape esperado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { nope: true }));
    await expect(fetchPokepaste("https://pokepast.es/z", { fetchImpl })).rejects.toThrow();
  });
});
