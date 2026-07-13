/**
 * author_identity — PC 単位の Author UUID (UUIDv4) のローカル保存。
 * リポジトリ内には置かない (git 共有で PC 間衝突するため)。保存先は
 * FUNDAMENTUM_AUTHOR_FILE > OS のユーザ状態ディレクトリ。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { isUuidV4 } from "./store/record.js";

export interface AuthorIdentity {
  author: string;
  name?: string;
  /** push/pull で確認した最後の rev (次回 pull の since) */
  lastRev?: number;
}

export function authorFilePath(): string {
  if (process.env.FUNDAMENTUM_AUTHOR_FILE) return process.env.FUNDAMENTUM_AUTHOR_FILE;
  const base =
    process.platform === "win32"
      ? (process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"))
      : (process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state"));
  return join(base, "fundamentum", "author.json");
}

/** 読み込み (無ければ UUIDv4 を生成して保存) */
export function loadOrCreateIdentity(): AuthorIdentity {
  const file = authorFilePath();
  if (existsSync(file)) {
    let parsed: AuthorIdentity;
    try {
      parsed = JSON.parse(readFileSync(file, "utf8")) as AuthorIdentity;
    } catch (e) {
      throw new Error(
        `[author] ${file} が破損しています (手で修復するか削除して再生成): ${(e as Error).message}`,
      );
    }
    if (!parsed.author || !isUuidV4(parsed.author)) {
      throw new Error(`[author] ${file} の author が UUIDv4 ではありません: ${parsed.author}`);
    }
    return parsed;
  }
  const identity: AuthorIdentity = { author: randomUUID() };
  saveIdentity(identity);
  return identity;
}

export function saveIdentity(identity: AuthorIdentity): void {
  const file = authorFilePath();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(identity, null, 2), "utf8");
}
