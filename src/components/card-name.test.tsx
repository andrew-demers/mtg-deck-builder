import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import CardName from "@/components/card-name";

describe("CardName", () => {
  it("renders plain text when there is no oracle text", () => {
    render(<CardName name="Forest" oracleText={null} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the popup outside the list container so overflow can't clip it", () => {
    const { container } = render(
      <div style={{ overflowY: "auto" }}>
        <CardName name="Hexproof Lands" oracleText="Lands you control have hexproof." />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hexproof Lands" }));

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.textContent).toBe("Lands you control have hexproof.");
    expect(container.contains(tooltip)).toBe(false);
  });

  it("closes on a second click and on an outside click", () => {
    render(<CardName name="Card" oracleText="Text" />);
    const button = screen.getByRole("button", { name: "Card" });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.click(button);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
});
