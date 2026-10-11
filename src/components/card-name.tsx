"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface CardNameProps {
  name: string;
  oracleText: string | null;
}

const POPUP_WIDTH = 256;
const POPUP_MAX_HEIGHT = 240;
const GAP = 8;

interface PopupPosition {
  top: number;
  left: number;
}

/**
 * Renders a card's name as a toggle that pops up its oracle text next to the
 * name - the cheapest way to let a player see what a card does everywhere
 * it's listed as plain text, without a card-image lookup.
 *
 * The popup is portaled to `document.body` with fixed positioning so a
 * scrollable or `overflow: hidden` ancestor (e.g. a card list with a max
 * height) can't clip it. It flips above the name when there's no room below,
 * and closes on outside click, scroll or resize rather than drifting away
 * from the name.
 */
export default function CardName({ name, oracleText }: CardNameProps) {
  const [position, setPosition] = useState<PopupPosition | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const isOpen = position !== null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        close();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    // Capture so scrolling any ancestor container closes it too.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [isOpen]);

  if (!oracleText) {
    return <span>{name}</span>;
  }

  function toggle() {
    if (isOpen || !buttonRef.current) {
      setPosition(null);
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const fitsBelow = rect.bottom + GAP + POPUP_MAX_HEIGHT <= window.innerHeight;
    const top = fitsBelow ? rect.bottom + GAP : Math.max(GAP, rect.top - GAP - POPUP_MAX_HEIGHT);
    const left = Math.min(Math.max(GAP, rect.left), window.innerWidth - POPUP_WIDTH - GAP);
    setPosition({ top, left });
  }

  return (
    <span className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="underline decoration-dotted decoration-muted"
      >
        {name}
      </button>
      {position
        ? createPortal(
            <span
              ref={popupRef}
              role="tooltip"
              style={{ top: position.top, left: position.left, width: POPUP_WIDTH, maxHeight: POPUP_MAX_HEIGHT }}
              className="fixed z-50 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-surface p-3 text-xs font-normal text-muted shadow-lg"
            >
              {oracleText}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
