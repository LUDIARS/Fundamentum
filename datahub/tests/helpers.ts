/**
 * tests/helpers — テスト共通の一時ディレクトリ / 決定的 clock / payload ビルダ。
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Payload } from "../src/store/record.js";

export function mkTmpDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), `fm-datahub-${prefix}-`));
  return {
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
      } catch (e) {
        // Windows のファイルロック起因の後始末失敗はテスト自体を落とさないが観測はする
        console.warn(`[tests] tmp dir 掃除失敗: ${dir}`, e);
      }
    },
  };
}

/** 決定的 clock: 固定 epoch から呼び出しごとに +1s */
export function fixedClock(startIso = "2026-07-13T00:00:00.000Z"): () => Date {
  let tick = 0;
  const base = new Date(startIso).getTime();
  return () => new Date(base + 1000 * tick++);
}

export function jsonPayload(data: unknown): Payload {
  return { format: "json", data };
}

export function textPayload(data: string): Payload {
  return { format: "text", data };
}

export const AUTHOR_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const AUTHOR_B = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";
