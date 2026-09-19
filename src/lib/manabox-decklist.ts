/**
 * A parsed ManaBox `.txt` decklist export.
 *
 * `commanderNames` is a deduped list of the names found in the
 * `// COMMANDER` section (no quantity - the API route forces commander
 * quantity to 1 regardless of what's in the file). `cards` is the mainboard,
 * with duplicate name lines (e.g. a foil and non-foil printing of the same
 * card) summed into a single entry per name.
 */
export interface ManaBoxDecklist {
  commanderNames: string[];
  cards: { name: string; quantity: number }[];
}

const COMMANDER_HEADER = /^\/\/\s*commander\s*$/i;
const COMMENT_LINE = /^\/\//;

// `<quantity> <name> (<setCode>) <collectorNumber>` with an optional
// trailing `*F*` foil marker. Only quantity and name are extracted - set
// code, collector number, and foil marker are discarded (this schema's
// `Card.name` is unique, so there's nothing to match a printing against).
const CARD_LINE = /^(\d+)\s+(.+?)\s+\([A-Za-z0-9]+\)\s+\S+(?:\s+\*F\*)?\s*$/;

/**
 * Parses a ManaBox `.txt` decklist export. Throws a descriptive `Error` on a
 * missing `// COMMANDER` header or a line that doesn't match the expected
 * `<qty> <name> (<set>) <num>` shape - unlike the lenient CSV collection
 * parser, a decklist line we can't parse means we can't trust the deck
 * we'd build from it, so we fail the whole import rather than skip it.
 */
export function parseManaBoxDecklist(text: string): ManaBoxDecklist {
  const lines = text.split(/\r?\n/);

  let sawCommanderHeader = false;
  let inCommanderSection = false;
  const commanderNames: string[] = [];
  const seenCommanderNames = new Set<string>();
  const cardQuantities = new Map<string, number>();

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      if (inCommanderSection) {
        inCommanderSection = false;
      }
      continue;
    }

    if (COMMANDER_HEADER.test(line)) {
      sawCommanderHeader = true;
      inCommanderSection = true;
      continue;
    }

    if (COMMENT_LINE.test(line)) {
      continue;
    }

    const match = CARD_LINE.exec(line);

    if (!match) {
      throw new Error(`ManaBox decklist line does not match the expected format: "${rawLine}"`);
    }

    const [, quantityText, name] = match;
    const quantity = Number(quantityText);

    if (inCommanderSection) {
      if (!seenCommanderNames.has(name)) {
        seenCommanderNames.add(name);
        commanderNames.push(name);
      }
      continue;
    }

    cardQuantities.set(name, (cardQuantities.get(name) ?? 0) + quantity);
  }

  if (!sawCommanderHeader) {
    throw new Error('ManaBox decklist is missing the "// COMMANDER" header');
  }

  const cards = Array.from(cardQuantities, ([name, quantity]) => ({ name, quantity }));

  return { commanderNames, cards };
}
