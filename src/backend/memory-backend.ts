/**
 * MemoryBackend — in-memory な StorageBackend 実装。
 *
 * 既定の backend。hermetic (プロセス内・永続なし)。テストと一時利用向け。
 *
 * SRP: メモリ上の出し入れのみ。
 */
import type { StorageBackend } from "./backend.js";

export class MemoryBackend implements StorageBackend {
  private readonly content = new Map<string, string>();
  /** partition → (key → value)。 */
  private readonly keyed = new Map<string, Map<string, string>>();

  async getContent(id: string): Promise<string | null> {
    return this.content.has(id) ? this.content.get(id)! : null;
  }

  async putContent(id: string, canonical: string): Promise<void> {
    this.content.set(id, canonical);
  }

  async hasContent(id: string): Promise<boolean> {
    return this.content.has(id);
  }

  async getKeyed(partition: string, key: string): Promise<string | null> {
    const p = this.keyed.get(partition);
    if (!p) return null;
    return p.has(key) ? p.get(key)! : null;
  }

  async putKeyed(partition: string, key: string, json: string): Promise<void> {
    let p = this.keyed.get(partition);
    if (!p) {
      p = new Map<string, string>();
      this.keyed.set(partition, p);
    }
    p.set(key, json);
  }

  async deleteKeyed(partition: string, key: string): Promise<void> {
    this.keyed.get(partition)?.delete(key);
  }

  async listKeys(partition: string, prefix?: string): Promise<string[]> {
    const p = this.keyed.get(partition);
    if (!p) return [];
    const keys = [...p.keys()];
    const filtered = prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
    return filtered.sort();
  }
}
