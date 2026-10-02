// Prisma may expose either its P2034 error or the pg adapter's commit error.
export function isTransactionConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { code?: unknown; name?: unknown; cause?: { kind?: unknown } };
  return value.code === "P2034" || (value.name === "DriverAdapterError" && value.cause?.kind === "TransactionWriteConflict");
}
