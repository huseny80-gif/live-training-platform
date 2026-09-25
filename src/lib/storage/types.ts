export interface StoredFile {
  key: string;          // logical path within the storage namespace
  absolutePath: string; // never exposed to clients
  sizeBytes: number;
  mimeType: string;
  storedAt: Date;
}

export interface StorageAdapter {
  /** Save a file buffer; returns the opaque storage key */
  save(key: string, buffer: Buffer, mimeType: string): Promise<StoredFile>;
  /** Read file bytes by key */
  read(key: string): Promise<Buffer>;
  /** Delete file by key */
  delete(key: string): Promise<void>;
  /** Check file exists */
  exists(key: string): Promise<boolean>;
}
