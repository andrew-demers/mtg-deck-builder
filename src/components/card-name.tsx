"use client";

import { useState } from "react";

interface CardNameProps {
  name: string;
  oracleText: string | null;
}

/**
 * Renders a card's name as a toggle that pops up its oracle text below the
 * name - the cheapest way to let a player see what a card does everywhere
 * it's listed as plain text, without a card-image lookup.
 */
export default function CardName({ name, oracleText }: CardNameProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!oracleText) {
    return <span>{name}</span>;
  }

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="underline decoration-dotted decoration-muted"
      >
        {name}
      </button>
      {isOpen ? (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-10 mt-1 w-64 whitespace-pre-wrap rounded border border-border bg-surface p-3 text-xs font-normal text-muted"
        >
          {oracleText}
        </span>
      ) : null}
    </span>
  );
}
