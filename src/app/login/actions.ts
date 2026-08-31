"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export interface LoginActionState {
  error: string | null;
}

export async function loginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const email = formData.get("email");
  const password = formData.get("password");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/collection",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }

    throw error;
  }

  return { error: null };
}
