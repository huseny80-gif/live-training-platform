import { LocalStorageAdapter } from "./local";
import type { StorageAdapter } from "./types";

export type { StorageAdapter, StoredFile } from "./types";

function createStorageAdapter(): StorageAdapter {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    // Dynamic require so the vercel-blob package is only loaded in production
    // (avoids errors in local dev when @vercel/blob is present but token is absent)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { VercelBlobAdapter } = require("./vercel-blob") as typeof import("./vercel-blob");
    return new VercelBlobAdapter();
  }
  return new LocalStorageAdapter();
}

export const storage = createStorageAdapter();
