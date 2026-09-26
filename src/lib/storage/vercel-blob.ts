import { put, del, head, get } from "@vercel/blob";
import type { StorageAdapter, StoredFile } from "./types";

export class VercelBlobAdapter implements StorageAdapter {
  async save(key: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
    const blob = await put(key, buffer, {
      access: "private",
      contentType: mimeType,
      addRandomSuffix: false,
    });
    return {
      key: blob.url,
      absolutePath: blob.url,
      sizeBytes: buffer.length,
      mimeType,
      storedAt: new Date(),
    };
  }

  async read(key: string): Promise<Buffer> {
    // Private blobs require an authenticated fetch — get() attaches the
    // BLOB_READ_WRITE_TOKEN as a bearer header; a plain fetch(url) would 403.
    // useCache:false bypasses CDN caching so we never receive a 304 with a
    // null stream for a blob we just uploaded.
    const result = await get(key, { access: "private", useCache: false });
    if (!result) throw new Error("BLOB_READ_FAILED: not_found");
    if (!result.stream) throw new Error("BLOB_READ_FAILED: empty_stream");
    const arrayBuffer = await new Response(result.stream).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(key: string): Promise<void> {
    await del(key);
  }

  async exists(key: string): Promise<boolean> {
    try {
      await head(key);
      return true;
    } catch {
      return false;
    }
  }
}
