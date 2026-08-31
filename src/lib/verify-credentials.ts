import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export interface VerifiedUser {
  id: string;
  email: string;
}

/**
 * Looks up a user by email and checks the given password against the stored
 * bcrypt hash. Returns the user (without the password hash) on success, or
 * `null` if the email is unknown or the password does not match.
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<VerifiedUser | null> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return null;
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    return null;
  }

  return { id: user.id, email: user.email };
}
