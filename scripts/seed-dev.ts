/**
 * Seeds the local dev database with mock data for testing the UI: a demo
 * user who owns part of a small card pool, and one 100-card Simic deck with
 * three saved versions (graded, so score deltas show in version history).
 *
 * Safe to re-run: it only ever touches the demo user's data (replacing the
 * demo user's decks and collection) and only creates catalog cards that are
 * missing, so cards from `sync-cards` are never overwritten. Refuses to run
 * against a non-local database or in production unless `--force` is given.
 *
 * Usage: `npm run seed-dev [-- --force]`
 * Then sign in as demo@example.com / demo-password.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { GRADE_CATEGORIES } from "@/lib/deck-grade";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";

interface MockCard {
  name: string;
  manaCost: string | null;
  manaValue: number;
  colors: string[];
  type: string;
  oracleText?: string;
  priceUsd?: number;
  commander?: boolean;
}

const G = ["G"];
const U = ["U"];
const GU = ["G", "U"];
const none: string[] = [];

const COMMANDER: MockCard = {
  name: "Kinnan, Bonder Prodigy",
  manaCost: "{G}{U}",
  manaValue: 2,
  colors: GU,
  type: "Legendary Creature - Human Druid",
  oracleText:
    "Whenever you tap a nonland permanent for mana, add one additional mana of any type that permanent produced.",
  priceUsd: 2.5,
  commander: true,
};

const CORE: MockCard[] = [
  { name: "Sol Ring", manaCost: "{1}", manaValue: 1, colors: none, type: "Artifact", priceUsd: 1.5 },
  { name: "Arcane Signet", manaCost: "{2}", manaValue: 2, colors: none, type: "Artifact", priceUsd: 1.2 },
  { name: "Cultivate", manaCost: "{2}{G}", manaValue: 3, colors: G, type: "Sorcery", priceUsd: 0.4 },
  { name: "Kodama's Reach", manaCost: "{2}{G}", manaValue: 3, colors: G, type: "Sorcery", priceUsd: 0.5 },
  { name: "Rampant Growth", manaCost: "{1}{G}", manaValue: 2, colors: G, type: "Sorcery", priceUsd: 0.3 },
  {
    name: "Llanowar Elves",
    manaCost: "{G}",
    manaValue: 1,
    colors: G,
    type: "Creature - Elf Druid",
    priceUsd: 0.6,
  },
  {
    name: "Elvish Mystic",
    manaCost: "{G}",
    manaValue: 1,
    colors: G,
    type: "Creature - Elf Druid",
    priceUsd: 0.4,
  },
  {
    name: "Birds of Paradise",
    manaCost: "{G}",
    manaValue: 1,
    colors: G,
    type: "Creature - Bird",
    priceUsd: 2,
  },
  {
    name: "Wall of Roots",
    manaCost: "{1}{G}",
    manaValue: 2,
    colors: G,
    type: "Creature - Plant Wall",
    priceUsd: 0.5,
  },
  { name: "Rhystic Study", manaCost: "{2}{U}", manaValue: 3, colors: U, type: "Enchantment", priceUsd: 30 },
  { name: "Mystic Remora", manaCost: "{U}", manaValue: 1, colors: U, type: "Enchantment", priceUsd: 15 },
  { name: "Brainstorm", manaCost: "{U}", manaValue: 1, colors: U, type: "Instant", priceUsd: 1 },
  { name: "Counterspell", manaCost: "{U}{U}", manaValue: 2, colors: U, type: "Instant", priceUsd: 1.5 },
  { name: "Swan Song", manaCost: "{U}", manaValue: 1, colors: U, type: "Instant", priceUsd: 2 },
  { name: "Beast Within", manaCost: "{2}{G}", manaValue: 3, colors: G, type: "Instant", priceUsd: 1.5 },
  {
    name: "Eternal Witness",
    manaCost: "{1}{G}{G}",
    manaValue: 3,
    colors: G,
    type: "Creature - Human Shaman",
    priceUsd: 1.2,
  },
  {
    name: "Reclamation Sage",
    manaCost: "{2}{G}",
    manaValue: 3,
    colors: G,
    type: "Creature - Elf Shaman",
    priceUsd: 0.3,
  },
  {
    name: "Craterhoof Behemoth",
    manaCost: "{5}{G}{G}{G}",
    manaValue: 8,
    colors: G,
    type: "Creature - Beast",
    priceUsd: 25,
  },
  {
    name: "Temur Sabertooth",
    manaCost: "{2}{G}{G}",
    manaValue: 4,
    colors: G,
    type: "Creature - Cat",
    priceUsd: 1,
  },
  {
    name: "Eldritch Evolution",
    manaCost: "{1}{G}{G}",
    manaValue: 3,
    colors: G,
    type: "Sorcery",
    priceUsd: 3,
  },
  { name: "Command Tower", manaCost: null, manaValue: 0, colors: none, type: "Land", priceUsd: 0.5 },
  { name: "Exotic Orchard", manaCost: null, manaValue: 0, colors: none, type: "Land", priceUsd: 0.4 },
  { name: "Breeding Pool", manaCost: null, manaValue: 0, colors: none, type: "Land", priceUsd: 15 },
  { name: "Yavimaya Coast", manaCost: null, manaValue: 0, colors: none, type: "Land", priceUsd: 4 },
  { name: "Simic Guildgate", manaCost: null, manaValue: 0, colors: none, type: "Land", priceUsd: 0.2 },
  { name: "Reliquary Tower", manaCost: null, manaValue: 0, colors: none, type: "Land", priceUsd: 3 },
];

/** Cards that differ between versions, so each version has a visible diff. */
const SWAPS: MockCard[][] = [
  [
    { name: "Divination", manaCost: "{2}{U}", manaValue: 3, colors: U, type: "Sorcery", priceUsd: 0.2 },
    {
      name: "Gigantosaurus",
      manaCost: "{G}{G}{G}{G}{G}",
      manaValue: 5,
      colors: G,
      type: "Creature - Dinosaur",
      priceUsd: 0.3,
    },
    { name: "Treetop Village", manaCost: null, manaValue: 0, colors: none, type: "Land", priceUsd: 0.5 },
  ],
  [
    { name: "Cyclonic Rift", manaCost: "{1}{U}", manaValue: 2, colors: U, type: "Instant", priceUsd: 25 },
    {
      name: "Sylvan Library",
      manaCost: "{1}{G}",
      manaValue: 2,
      colors: G,
      type: "Enchantment",
      priceUsd: 25,
    },
    { name: "Treetop Village", manaCost: null, manaValue: 0, colors: none, type: "Land", priceUsd: 0.5 },
  ],
  [
    { name: "Cyclonic Rift", manaCost: "{1}{U}", manaValue: 2, colors: U, type: "Instant", priceUsd: 25 },
    {
      name: "Sylvan Library",
      manaCost: "{1}{G}",
      manaValue: 2,
      colors: G,
      type: "Enchantment",
      priceUsd: 25,
    },
    { name: "Mana Drain", manaCost: "{U}{U}", manaValue: 2, colors: U, type: "Instant", priceUsd: 80 },
  ],
];

const GOAL = "Ramp into Craterhoof Behemoth and win by turn 8 while holding up counter magic";

/** Per-category scores for each version; the overall score is their mean. */
const GRADES: { goal: string; scores: number[]; summary: string }[] = [
  {
    goal: "Win with big green creatures",
    scores: [60, 58, 70, 52, 45, 50, 65],
    summary: "Solid ramp but little card flow or interaction. Add draw and counters.",
  },
  {
    goal: GOAL,
    scores: [66, 64, 74, 62, 60, 58, 68],
    summary: "Rift and Sylvan Library add reach and selection. Needs more protection for the finisher.",
  },
  {
    goal: GOAL,
    scores: [68, 66, 74, 62, 72, 64, 68],
    summary: "Mana Drain gives real protection. Consider a second tutor effect for consistency.",
  },
];

const BASICS: MockCard[] = [
  { name: "Forest", manaCost: null, manaValue: 0, colors: none, type: "Basic Land - Forest", priceUsd: 0.1 },
  { name: "Island", manaCost: null, manaValue: 0, colors: none, type: "Basic Land - Island", priceUsd: 0.1 },
];

function isLocalDatabase(): boolean {
  try {
    return ["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(
      new URL(process.env.DATABASE_URL ?? "").hostname,
    );
  } catch {
    return false;
  }
}

/** Creates the card only if it's missing, so synced catalog data wins. */
async function ensureCard(card: MockCard): Promise<string> {
  const [typeLine, subtypeLine = ""] = card.type.split(" - ");
  const words = typeLine.split(" ");
  const supertypes = words.filter((word) => ["Basic", "Legendary", "Snow"].includes(word));
  const identity = card.colors.length > 0 || card.type.includes("Land") ? card.colors : none;
  const created = await prisma.card.upsert({
    where: { name: card.name },
    update: {},
    create: {
      name: card.name,
      manaCost: card.manaCost,
      manaValue: card.manaValue,
      colors: card.colors,
      colorIdentity: card.commander ? GU : identity,
      type: card.type,
      types: words.filter((word) => !supertypes.includes(word)),
      supertypes,
      subtypes: subtypeLine ? subtypeLine.split(" ") : [],
      oracleText: card.oracleText ?? null,
      legalities: { commander: "legal" },
      isCommanderEligible: card.commander ?? false,
      priceUsd: card.priceUsd ?? null,
    },
  });
  return created.id;
}

async function main(): Promise<void> {
  if (!process.argv.includes("--force") && (process.env.NODE_ENV === "production" || !isLocalDatabase())) {
    throw new Error("Refusing to seed a non-local database. Pass --force if you really mean it.");
  }

  const ids = new Map<string, string>();
  for (const card of [COMMANDER, ...CORE, ...SWAPS.flat(), ...BASICS]) {
    if (!ids.has(card.name)) ids.set(card.name, await ensureCard(card));
  }
  const id = (name: string) => ids.get(name) as string;

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10) },
  });

  // Replace only the demo user's own data; children go first because the
  // foreign keys are ON DELETE RESTRICT.
  const oldDecks = { deck: { userId: user.id } };
  await prisma.deckVersionCard.deleteMany({ where: { version: oldDecks } });
  await prisma.deckVersion.deleteMany({ where: oldDecks });
  await prisma.deckCard.deleteMany({ where: oldDecks });
  await prisma.deck.deleteMany({ where: { userId: user.id } });
  await prisma.collectionEntry.deleteMany({ where: { userId: user.id } });

  // The demo user owns the commander and every other core card, plus
  // the cheap swaps, so both "Not owned" and owned suggestions show up.
  const owned = [COMMANDER, ...CORE.filter((_, index) => index % 2 === 0), SWAPS[0][0], SWAPS[0][1]];
  await prisma.collectionEntry.createMany({
    data: [
      ...owned.map((card) => ({ userId: user.id, cardId: id(card.name), quantity: 1 })),
      ...BASICS.map((card) => ({ userId: user.id, cardId: id(card.name), quantity: 20 })),
    ],
  });

  const versionCards = SWAPS.map((swap) => {
    const names = [...CORE, ...swap]
      .map((card) => card.name)
      .filter((name, index, all) => all.indexOf(name) === index);
    // Fill to 100 with basics, split between the two colors.
    const basicsNeeded = 100 - 1 - names.length;
    const forests = Math.ceil(basicsNeeded / 2);
    return [
      { cardId: id(COMMANDER.name), quantity: 1, isCommander: true },
      ...names.map((name) => ({ cardId: id(name), quantity: 1, isCommander: false })),
      { cardId: id("Forest"), quantity: forests, isCommander: false },
      { cardId: id("Island"), quantity: basicsNeeded - forests, isCommander: false },
    ];
  });

  const latest = versionCards[versionCards.length - 1];
  const deck = await prisma.deck.create({
    data: {
      userId: user.id,
      name: "Seed: Simic Ramp",
      commanderCardId: id(COMMANDER.name),
      goal: GOAL,
      description:
        "Ramps aggressively with Kinnan and mana dorks, then finds **Craterhoof Behemoth** to end the game, holding up counterspells as protection.",
      critique:
        "## Strengths\nPlenty of early ramp.\n\n## Weaknesses\nLow on card draw and repeatable protection for the finisher.",
      cards: { create: latest },
    },
  });

  const descriptions = [
    "Initial version",
    "Swapped Divination and Gigantosaurus for Rift and Library",
    "Added Mana Drain over Treetop Village",
  ];
  for (const [index, cards] of versionCards.entries()) {
    const grade = GRADES[index];
    await prisma.deckVersion.create({
      data: {
        deckId: deck.id,
        number: index + 1,
        description: descriptions[index],
        commanderCardId: id(COMMANDER.name),
        gradeGoal: grade.goal,
        gradeScore: Math.round(grade.scores.reduce((sum, score) => sum + score, 0) / grade.scores.length),
        gradeBreakdown: GRADE_CATEGORIES.map((category, position) => ({
          category,
          score: grade.scores[position],
          note: `Mock note for ${category.toLowerCase()}.`,
        })),
        gradeSummary: grade.summary,
        cards: { create: cards },
      },
    });
  }

  console.log(
    `Seeded ${DEMO_EMAIL} (password: ${DEMO_PASSWORD}) with deck "${deck.name}" and ${versionCards.length} versions.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
