import { expect, it } from "vitest";
import { App } from "./App.js";

it("exports the App component", () => {
  expect(typeof App).toBe("function");
});
