import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import bcryptjs from "bcryptjs";
import { z } from "zod";
import { authConfig } from "./auth.config";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const instructor = await prisma.instructor.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            isActive: true,
          },
        });

        if (!instructor || !instructor.isActive) return null;
        if (!instructor.passwordHash) return null;

        const valid = await bcryptjs.compare(password, instructor.passwordHash);
        if (!valid) return null;

        return {
          id: instructor.id,
          email: instructor.email,
          name: instructor.name,
        };
      },
    }),
  ],
  cookies: {
    sessionToken: {
      options: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.instructorId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.instructorId) {
        session.user.id = token.instructorId as string;
      }
      return session;
    },
  },
});
