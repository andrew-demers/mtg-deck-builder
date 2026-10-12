"use client";

import { useState, type ReactNode } from "react";

interface CollapsibleCardProps {
  title: string;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

// The body stays mounted while collapsed so in-progress state (inputs,
// selections) survives a toggle.
export default function CollapsibleCard({
  title,
  actions,
  defaultOpen = true,
  children,
}: CollapsibleCardProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex items-center gap-2 text-sm font-medium text-muted"
        >
          <span
            aria-hidden="true"
            className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          {title}
        </button>
        {actions}
      </div>
      <div hidden={!open} className="flex flex-col gap-3">
        {children}
      </div>
    </div>
  );
}
