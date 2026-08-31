import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyCredentials } from "@/lib/verify-credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;

        if (!email || !password) {
          return null;
        }

        return verifyCredentials(email, password);
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ auth: session, request }) => {
      const isOnCollection = request.nextUrl.pathname.startsWith("/collection");

      if (isOnCollection) {
        return !!session?.user;
      }

      return true;
    },
  },
});
