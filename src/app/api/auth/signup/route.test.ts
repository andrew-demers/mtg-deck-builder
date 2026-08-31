import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { POST } from "@/app/api/auth/signup/route";

const createMock = prisma.user.create as unknown as ReturnType<typeof vi.fn>;

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("creates a user on valid input", async () => {
    createMock.mockResolvedValue({
      id: "user_1",
      email: "player@example.com",
      passwordHash: "hashed",
    });

    const response = await POST(
      buildRequest({ email: "player@example.com", password: "password123" }),
    );
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data).toEqual({ id: "user_1", email: "player@example.com" });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a password shorter than 8 characters", async () => {
    const response = await POST(buildRequest({ email: "player@example.com", password: "short" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeTruthy();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("rejects a duplicate email with 409", async () => {
    createMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const response = await POST(
      buildRequest({ email: "player@example.com", password: "password123" }),
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toBeTruthy();
  });
});
