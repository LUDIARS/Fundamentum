/**
 * 決定的 canonical JSON 直列化。
 *
 * content addressing の心臓: 「意味が同じ値 → 同じ文字列 → 同じハッシュ」を保証する。
 * オブジェクトのキーを再帰的にソートし、`JSON.stringify` の実装差・キー順差を排除する。
 *
 * SRP: 直列化のみ。ハッシュ化は content-id.ts。
 */
import type { JsonValue } from "../types.js";

/**
 * `value` を決定的な文字列へ直列化する。
 * - オブジェクトのキーは昇順ソート。
 * - 非有限数 (NaN / Infinity) や undefined / 関数等は決定的に表せないため throw。
 */
export function canonicalize(value: JsonValue): string {
  return write(value);
}

function write(v: JsonValue): string {
  if (v === null) return "null";

  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false";
    case "number":
      if (!Number.isFinite(v)) {
        throw new Error(`Fundamentum: 非有限数は canonicalize できない: ${JSON.stringify(v)}`);
      }
      // JSON.stringify は -0 を "0" に正規化し、整数/小数の表記も決定的。
      return JSON.stringify(v);
    case "string":
      return JSON.stringify(v);
    case "object": {
      if (Array.isArray(v)) {
        return "[" + v.map(write).join(",") + "]";
      }
      const obj = v as { [key: string]: JsonValue };
      const keys = Object.keys(obj).sort();
      return (
        "{" +
        keys.map((k) => JSON.stringify(k) + ":" + write(obj[k]!)).join(",") +
        "}"
      );
    }
    default:
      // bigint / symbol / function / undefined
      throw new Error(`Fundamentum: canonicalize 非対応の型: ${typeof v}`);
  }
}
