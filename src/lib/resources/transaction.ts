import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
export async function resourceTransaction<T>(action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(action, { isolationLevel: "Serializable", timeout: 20000, maxWait: 10000 }); }
    catch(error) {
      if (attempt === 2 || !error || typeof error !== "object" || !("code" in error) || error.code !== "P2034") throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw new Error("RESOURCE_CONFLICT");
}
