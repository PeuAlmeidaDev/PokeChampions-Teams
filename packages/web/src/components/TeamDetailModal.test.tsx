import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { TeamDetailModal } from "./TeamDetailModal.js";
import { makeTeamDetail, makeDetailedPokemon } from "../test/factories.js";

afterEach(cleanup);

describe("TeamDetailModal", () => {
  it("ready: renderiza um card por Pokémon", () => {
    const detail = makeTeamDetail({
      pokemon: [makeDetailedPokemon(), makeDetailedPokemon({ species: "Flutter Mane" })],
    });
    render(<TeamDetailModal status="ready" detail={detail} onClose={() => {}} onRetry={() => {}} />);
    expect(screen.getByText("Incineroar")).toBeTruthy();
    expect(screen.getByText("Flutter Mane")).toBeTruthy();
  });

  it("loading: mostra estado de carregamento", () => {
    render(<TeamDetailModal status="loading" detail={null} onClose={() => {}} onRetry={() => {}} />);
    expect(screen.getByText(/carregando/i)).toBeTruthy();
  });

  it("error: mostra erro e botão de retry", () => {
    const onRetry = vi.fn();
    render(<TeamDetailModal status="error" detail={null} onClose={() => {}} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("fecha no Esc", () => {
    const onClose = vi.fn();
    render(<TeamDetailModal status="ready" detail={makeTeamDetail()} onClose={onClose} onRetry={() => {}} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("fecha no clique do backdrop", () => {
    const onClose = vi.fn();
    render(<TeamDetailModal status="ready" detail={makeTeamDetail()} onClose={onClose} onRetry={() => {}} />);
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("clique na panel interna NÃO fecha o modal (stopPropagation)", () => {
    const onClose = vi.fn();
    const detail = makeTeamDetail();
    render(<TeamDetailModal status="ready" detail={detail} onClose={onClose} onRetry={() => {}} />);
    // Pega a panel interna (que tem stopPropagation) e clica nela
    const panel = screen.getByText(/Detalhe do time/i).parentElement;
    fireEvent.click(panel!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
