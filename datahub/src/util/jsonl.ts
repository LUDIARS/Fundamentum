/**
 * util/jsonl — append-only JSONL の読み書き。datahub の全永続ファイル共通。
 * 1 行 1 イベント / UTF-8 / LF。破損行は握りつぶさず行番号付きで fail-fast。
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  const out: T[] = [];
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch (e) {
      throw new Error(`[jsonl] ${file}:${i + 1} の parse に失敗: ${(e as Error).message}`);
    }
  }
  return out;
}

export function appendJsonl(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
}
