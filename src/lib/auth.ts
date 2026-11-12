import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export async function getCurrentDbUser() {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const clerkUser = await currentUser();
  if (!clerkUser) {
    return null;
  }

  const email =
    clerkUser.emailAddresses[0]?.emailAddress ??
    `${clerkUser.id}@noemail.clerk.internal`;
  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    clerkUser.username ||
    null;

  const user = await prisma.user.upsert({
    where: { clerkId: userId },
    update: {
      email,
      name,
      imageUrl: clerkUser.imageUrl,
    },
    create: {
      clerkId: userId,
      email,
      name,
      imageUrl: clerkUser.imageUrl,
    },
  });

  return user;
}

export async function requireDbUser() {
  const user = await getCurrentDbUser();
  if (!user) {
    throw new Error("Unauthorized: you must be signed in.");
  }
  return user;
}
