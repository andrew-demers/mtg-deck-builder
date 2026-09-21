import ReactMarkdown, { type Components } from "react-markdown";

const headingClassName = "mt-3 font-sans text-sm font-bold normal-case text-foreground first:mt-0";

const components: Components = {
  h1: ({ children }) => <h3 className={headingClassName}>{children}</h3>,
  h2: ({ children }) => <h3 className={headingClassName}>{children}</h3>,
  h3: ({ children }) => <h3 className={headingClassName}>{children}</h3>,
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="mb-1 last:mb-0">{children}</li>,
  code: ({ children }) => (
    <code className="rounded border border-border bg-surface px-1 py-0.5 text-xs">{children}</code>
  ),
};

/**
 * Renders LLM-generated free text (deck critiques/descriptions) as markdown
 * instead of showing raw `#`/`**`/backtick syntax to the user. Headings are
 * downsized from the app's global h1-h6 styling (uppercase display font)
 * since that's sized for page titles, not text inside a card.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm text-muted">
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
