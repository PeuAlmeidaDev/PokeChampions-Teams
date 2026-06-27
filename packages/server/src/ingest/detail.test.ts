import { describe, it, expect, vi } from "vitest";
import { createTeamDetailService } from "./detail.js";
import { makeTeamsResponse } from "./detail.test-helpers.js";

function deps(overrides = {}) {
  return {
    getTeams: vi.fn().mockResolvedValue(
      makeTeamsResponse([{ id: "MB1", pokepasteUrl: "https://pokepast.es/abc" }]),
    ),
    fetchPokepaste: vi.fn().mockResolvedValue("Incineroar @ Assault Vest\nAbility: Intimidate\n- Fake Out"),
    resolveSprites: vi.fn().mockResolvedValue(new Map([["Incineroar", { spriteUrl: "https://img/inc.png", dexId: 727 }]])),
    readSpriteCache: vi.fn().mockResolvedValue(new Map()),
    writeSpriteCache: vi.fn().mockResolvedValue(undefined),
    resolveItemSprites: vi.fn().mockResolvedValue(new Map()),
    readItemCache: vi.fn().mockResolvedValue(new Map()),
    writeItemCache: vi.fn().mockResolvedValue(undefined),
    readDetailCache: vi.fn().mockResolvedValue(null),
    writeDetailCache: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("createTeamDetailService", () => {
  it("monta o detalhe: paste -> parse -> sprite -> assemble", async () => {
    const d = deps();
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(detail?.id).toBe("MB1");
    expect(detail?.pokemon[0]?.species).toBe("Incineroar");
    expect(detail?.pokemon[0]?.spriteUrl).toBe("https://img/inc.png");
    expect(d.writeDetailCache).toHaveBeenCalledWith("MB1", expect.objectContaining({ id: "MB1" }));
  });

  it("devolve do cache sem buscar o pokepaste", async () => {
    const cached = { id: "MB1", pokemon: [] };
    const d = deps({ readDetailCache: vi.fn().mockResolvedValue(cached) });
    const svc = createTeamDetailService(d);
    expect(await svc.getTeamDetail("MB1")).toEqual(cached);
    expect(d.fetchPokepaste).not.toHaveBeenCalled();
  });

  it("time inexistente devolve null", async () => {
    const d = deps();
    const svc = createTeamDetailService(d);
    expect(await svc.getTeamDetail("NOPE")).toBeNull();
    expect(d.fetchPokepaste).not.toHaveBeenCalled();
  });

  it("não resolve sprites já presentes no cache de sprite", async () => {
    const d = deps({
      readSpriteCache: vi.fn().mockResolvedValue(new Map([["Incineroar", { spriteUrl: "https://cached/inc.png", dexId: 727 }]])),
    });
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(d.resolveSprites).not.toHaveBeenCalled();
    expect(detail?.pokemon[0]?.spriteUrl).toBe("https://cached/inc.png");
  });

  it("single-flight: chamadas concorrentes pro mesmo id compartilham a promise", async () => {
    const d = deps();
    const svc = createTeamDetailService(d);
    await Promise.all([svc.getTeamDetail("MB1"), svc.getTeamDetail("MB1")]);
    expect(d.fetchPokepaste).toHaveBeenCalledTimes(1);
  });

  it("resolve item sprites e os inclui no detalhe", async () => {
    const resolveItemSprites = vi.fn().mockResolvedValue(new Map([["Assault Vest", "https://img/av.png"]]));
    const d = deps({ resolveItemSprites });
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(detail?.pokemon[0]?.itemSpriteUrl).toBe("https://img/av.png");
  });

  it("não re-busca item já presente no cache de itens", async () => {
    const resolveItemSprites = vi.fn().mockResolvedValue(new Map());
    const d = deps({
      resolveItemSprites,
      readItemCache: vi.fn().mockResolvedValue(new Map([["Assault Vest", "https://cached/av.png"]])),
    });
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(resolveItemSprites).not.toHaveBeenCalled();
    expect(detail?.pokemon[0]?.itemSpriteUrl).toBe("https://cached/av.png");
  });

  it("não cacheia detalhe vazio (pokepaste degenerado)", async () => {
    const d = deps({ fetchPokepaste: vi.fn().mockResolvedValue("") });
    const svc = createTeamDetailService(d);
    const detail = await svc.getTeamDetail("MB1");
    expect(detail).toEqual({ id: "MB1", pokemon: [] });
    expect(d.writeDetailCache).not.toHaveBeenCalled();
  });
});
