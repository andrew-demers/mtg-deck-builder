import { prisma } from "@/lib/prisma";

export interface UpsertCollectionEntryInput {
  quantity: number;
  foil: boolean;
  setCode?: string | null;
  sourceScryfallId?: string | null;
  /**
   * "set" (default): the quantity on conflict is replaced by `quantity`,
   * for reconciling a full collection snapshot (e.g. a re-imported ManaBox
   * export) against what's already stored, without double-counting.
   * "add": the quantity on conflict is added to the existing value, for
   * recording newly-identified cards (e.g. resolving a single unmatched
   * import row) on top of whatever is already owned.
   */
  onConflict?: "set" | "add";
}

/**
 * Adds or reconciles a `CollectionEntry` for a matched card, keyed on
 * (userId, cardId, foil). This is a read-then-write rather than a single
 * upsert because the conflict quantity can be either set or added depending
 * on the caller, and setCode/sourceScryfallId also need to refresh from the
 * latest import - fine for import/resolution volumes, not a hot path.
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
    const quantity =
      input.onConflict === "add" ? existing.quantity + input.quantity : input.quantity;

    await prisma.collectionEntry.update({
      where: { id: existing.id },
      data: {
        quantity,
        setCode: input.setCode,
        sourceScryfallId: input.sourceScryfallId,
      },
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
