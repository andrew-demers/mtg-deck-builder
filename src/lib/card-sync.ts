import { prisma } from "@/lib/prisma";
import { isCommanderEligible } from "@/lib/commander-eligibility";
import type { ParsedCard } from "@/lib/mtgjson";

const CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Upserts parsed MTGJSON cards into the local `Card` table, keyed by name.
 * Runs in chunks of `CHUNK_SIZE` upserts in parallel rather than fully
 * sequential (too slow for ~35k cards) or fully parallel (too many
 * simultaneous connections).
 */
export async function syncCards(cards: ParsedCard[]): Promise<void> {
  for (const batch of chunk(cards, CHUNK_SIZE)) {
    await Promise.all(
      batch.map((card) => {
        const data = {
          manaCost: card.manaCost,
          manaValue: card.manaValue,
          colors: card.colors,
          colorIdentity: card.colorIdentity,
          type: card.type,
          types: card.types,
          supertypes: card.supertypes,
          subtypes: card.subtypes,
          oracleText: card.oracleText,
          legalities: card.legalities,
          scryfallOracleId: card.scryfallOracleId,
          isCommanderEligible: isCommanderEligible(card),
        };

        return prisma.card.upsert({
          where: { name: card.name },
          create: { name: card.name, ...data },
          update: data,
        });
      }),
    );
  }
}
