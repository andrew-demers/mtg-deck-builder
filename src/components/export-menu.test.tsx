import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ExportMenu from "@/components/export-menu";

describe("ExportMenu", () => {
  it("starts closed and lists each export type", () => {
    render(<ExportMenu deckId="deck_1" />);

    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /export/i }));

    expect(screen.getByRole("menuitem", { name: "CSV" }).getAttribute("href")).toBe("/api/decks/deck_1/export");
    expect(screen.getByRole("menuitem", { name: "Arena" }).getAttribute("href")).toBe(
      "/api/decks/deck_1/export?format=arena",
    );
    expect(screen.getByRole("menuitem", { name: "MTGO" }).getAttribute("href")).toBe(
      "/api/decks/deck_1/export?format=mtgo",
    );
  });

  it("closes on escape and on an outside click", () => {
    render(<ExportMenu deckId="deck_1" />);
    const button = screen.getByRole("button", { name: /export/i });

    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
