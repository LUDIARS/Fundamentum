/**
 * store/record — datahub の基本データ型と payload の正規化ハッシュ。
 * 契約の正本: spec/interface/datahub-api.md / spec/data/datahub-store.md
 */
import { createHash } from "node:crypto";

export type PayloadFormat = "json" | "graph" | "csv" | "text";

export const PAYLOAD_FORMATS: readonly PayloadFormat[] = ["json", "graph", "csv", "text"];

export interface Payload {
  format: PayloadFormat;
  /** json/graph: 任意 JSON 値, csv/text: string */
  data: unknown;
}

export interface ResolutionNote {
  mode: "superset" | "llm" | "manual";
  winner: "incoming" | "current";
  /** 敗者側の rev (current 勝ちのとき incoming は rev を持たないため head rev) */
  againstRev: number;
  reason: string;
}

/** revlog の 1 コミット (= pull で配布される単位) */
export interface CommitRecord {
  rev: number;
  kind: string;
  id: string;
  author: string;
  ts: string;
  hash: string;
  payload: Payload;
  resolution?: ResolutionNote;
}

export function recordKey(kind: string, id: string): string {
  // kind は KIND_RE で改行を含まないため "\n" 区切りで一意に復元できる
  return kind + "\n" + id;
}

/** kind = <サービス>.<種別> 名前空間 (英数 . _ - のみ) */
export const KIND_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

/** キーソートで正規化した JSON 文字列 (hash / superset 比較の共通基盤) */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = sortKeysDeep(src[key]);
    return out;
  }
  return value;
}

export function payloadHash(payload: Payload): string {
  const digest = createHash("sha256").update(canonicalJson(payload), "utf8").digest("hex");
  return `sha256:${digest}`;
}

/** 検査・LLM 判定へ渡すテキスト表現 (csv/text は生文字列、json/graph は正規化 JSON) */
export function payloadText(payload: Payload): string {
  if (payload.format === "csv" || payload.format === "text") return String(payload.data);
  return canonicalJson(payload.data);
}

export function isValidPayload(value: unknown): value is Payload {
  if (value === null || typeof value !== "object") return false;
  const p = value as Partial<Payload>;
  if (!PAYLOAD_FORMATS.includes(p.format as PayloadFormat)) return false;
  if (p.format === "csv" || p.format === "text") return typeof p.data === "string";
  return p.data !== undefined;
}

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4_RE.test(value);
}
