import { describe, expect, it, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { verifyCredentials } from "@/lib/verify-credentials";

const findUniqueMock = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("verifyCredentials", () => {
  beforeEach(() => {
    findUniqueMock.mockReset();
  });

  it("returns the user shape when the password is correct", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 10);
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "player@example.com",
      passwordHash,
    });

    const result = await verifyCredentials("player@example.com", "correct-password");

    expect(result).toEqual({ id: "user_1", email: "player@example.com" });
  });

  it("returns null when the password is wrong", async () => {
    const passwordHash = await bcrypt.hash("correct-password", 10);
    findUniqueMock.mockResolvedValue({
      id: "user_1",
      email: "player@example.com",
      passwordHash,
    });

    const result = await verifyCredentials("player@example.com", "wrong-password");

    expect(result).toBeNull();
  });

  it("returns null when the email is unknown", async () => {
    findUniqueMock.mockResolvedValue(null);

    const result = await verifyCredentials("nobody@example.com", "whatever-password");

    expect(result).toBeNull();
  });
});
