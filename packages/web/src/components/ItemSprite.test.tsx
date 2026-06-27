import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ItemSprite } from "./ItemSprite.js";

afterEach(cleanup);

describe("ItemSprite", () => {
  it("renders an img with the url and alt", () => {
    render(<ItemSprite url="https://img/av.png" alt="Assault Vest" />);
    const img = screen.getByAltText("Assault Vest") as HTMLImageElement;
    expect(img.src).toContain("https://img/av.png");
  });

  it("hides itself when the image fails to load", () => {
    render(<ItemSprite url="https://img/broken.png" alt="Assault Vest" />);
    fireEvent.error(screen.getByAltText("Assault Vest"));
    expect(screen.queryByAltText("Assault Vest")).toBeNull();
  });
});
