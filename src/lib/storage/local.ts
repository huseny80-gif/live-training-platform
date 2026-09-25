import fs from "fs/promises";
import path from "path";
import type { StorageAdapter, StoredFile } from "./types";

// Files are stored OUTSIDE public/ — never directly web-accessible
const STORAGE_ROOT = process.env.STORAGE_ROOT ?? path.join(process.cwd(), "uploads");

export class LocalStorageAdapter implements StorageAdapter {
  private root: string;

  constructor(root?: string) {
    this.root = root ?? STORAGE_ROOT;
  }

  private resolve(key: string): string {
    // Reject any key containing traversal sequences before normalization
    if (/\.\.[\\/]|[\\/]\.\./.test(key) || key.startsWith("..")) {
      throw new Error("PATH_TRAVERSAL_DETECTED");
    }
    const normalized = path.normalize(key);
    const resolved = path.join(this.root, normalized);
    // Double-check after normalization
    if (!resolved.startsWith(path.resolve(this.root) + path.sep) && resolved !== path.resolve(this.root)) {
      throw new Error("PATH_TRAVERSAL_DETECTED");
    }
    return resolved;
  }

  async save(key: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
    const absPath = this.resolve(key);
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, buffer);
    const stat = await fs.stat(absPath);
    return {
      key,
      absolutePath: absPath,
      sizeBytes: stat.size,
      mimeType,
      storedAt: new Date(),
    };
  }

  async read(key: string): Promise<Buffer> {
    const absPath = this.resolve(key);
    return fs.readFile(absPath);
  }

  async delete(key: string): Promise<void> {
    const absPath = this.resolve(key);
    await fs.unlink(absPath).catch(() => {});
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton — swappable to S3Adapter without changing call sites
export const storage = new LocalStorageAdapter();
