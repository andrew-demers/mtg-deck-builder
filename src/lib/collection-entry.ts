import { prisma } from "@/lib/prisma";

export interface UpsertCollectionEntryInput {
  quantity: number;
  foil: boolean;
  setCode?: string | null;
  sourceScryfallId?: string | null;
}

/**
 * Adds a `CollectionEntry` for a matched card, incrementing the quantity on
 * an existing (userId, cardId, foil) entry rather than overwriting it. This
 * is a read-then-write rather than a single upsert because the `quantity` on
 * conflict needs to be *added to* the existing value, not overwritten - fine
 * for import/resolution volumes, not a hot path.
 */
export async function upsertCollectionEntry(
  userId: string,
  cardId: string,
  input: UpsertCollectionEntryInput,
): Promise<void> {
  const existing = await prisma.collectionEntry.findUnique({
    where: { userId_cardId_foil: { userId, cardId, foil: input.foil } },
  });

  if (existing) {
    await prisma.collectionEntry.update({
      where: { id: existing.id },
      data: { quantity: existing.quantity + input.quantity },
    });
    return;
  }

  await prisma.collectionEntry.create({
    data: {
      userId,
      cardId,
      quantity: input.quantity,
      foil: input.foil,
      setCode: input.setCode,
      sourceScryfallId: input.sourceScryfallId,
    },
  });
}
