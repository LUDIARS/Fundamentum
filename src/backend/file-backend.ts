/**
 * FileBackend — ディスク永続な StorageBackend 実装。
 *
 * レイアウト (root = dir):
 *  - content: `content/<aa>/<hash>.json`   (aa = hash 先頭 2 桁で sharding)
 *  - keyed:   `keyed/<enc(partition)>/<enc(key)>.json`  (enc = base64url、fs 安全)
 *
 * 書込みは tmp + rename で atomic (クラッシュで半端な内容を読ませない)。content は内容
 * ハッシュキーゆえ冪等で、複数書込みが衝突しない (Anatomia createFileStore と同方針)。
 * 壊れた/読めないエントリは miss 扱い (crash させない)。
 *
 * SRP: ファイルシステムへの出し入れのみ。
 */
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CONTENT_ID_PREFIX } from "../hash/content-id.js";
import type { StorageBackend } from "./backend.js";

function enc(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function dec(s: string): string {
  return Buffer.from(s, "base64url").toString("utf8");
}

export class FileBackend implements StorageBackend {
  constructor(private readonly dir: string) {}

  // --- content ---

  private contentPath(id: string): { dir: string; file: string } {
    const hex = id.startsWith(CONTENT_ID_PREFIX) ? id.slice(CONTENT_ID_PREFIX.length) : id;
    const shard = hex.slice(0, 2) || "00";
    const d = join(this.dir, "content", shard);
    return { dir: d, file: join(d, `${hex}.json`) };
  }

  async getContent(id: string): Promise<string | null> {
    try {
      return await readFile(this.contentPath(id).file, "utf8");
    } catch {
      return null;
    }
  }

  async putContent(id: string, canonical: string): Promise<void> {
    const { dir, file } = this.contentPath(id);
    await this.atomicWrite(dir, file, canonical);
  }

  async hasContent(id: string): Promise<boolean> {
    try {
      await readFile(this.contentPath(id).file, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  // --- keyed ---

  private partitionDir(partition: string): string {
    return join(this.dir, "keyed", enc(partition));
  }
  private keyedPath(partition: string, key: string): string {
    return join(this.partitionDir(partition), `${enc(key)}.json`);
  }

  async getKeyed(partition: string, key: string): Promise<string | null> {
    try {
      return await readFile(this.keyedPath(partition, key), "utf8");
    } catch {
      return null;
    }
  }

  async putKeyed(partition: string, key: string, json: string): Promise<void> {
    await this.atomicWrite(this.partitionDir(partition), this.keyedPath(partition, key), json);
  }

  async deleteKeyed(partition: string, key: string): Promise<void> {
    try {
      await rm(this.keyedPath(partition, key));
    } catch {
      // 不在なら no-op。
    }
  }

  async listKeys(partition: string, prefix?: string): Promise<string[]> {
    let files: string[];
    try {
      files = await readdir(this.partitionDir(partition));
    } catch {
      return [];
    }
    const keys = files
      .filter((f) => f.endsWith(".json"))
      .map((f) => dec(f.slice(0, -".json".length)));
    const filtered = prefix ? keys.filter((k) => k.startsWith(prefix)) : keys;
    return filtered.sort();
  }

  // --- shared ---

  private async atomicWrite(dir: string, file: string, content: string): Promise<void> {
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, file);
  }
}
