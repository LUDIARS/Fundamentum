/**
 * canonical JSON → ContentId。
 *
 * SRP: ハッシュ化のみ。直列化は canonical.ts。
 */
import { createHash } from "node:crypto";
import type { ContentId, JsonValue } from "../types.js";
import { canonicalize } from "./canonical.js";

/** content id の prefix。アルゴリズム/版を将来切り替えられるよう明示する。 */
export const CONTENT_ID_PREFIX = "fm1:";

/** 既に canonical 化された文字列から content id を作る (二重直列化を避ける内部用)。 */
export function contentIdFromCanonical(canonical: string): ContentId {
  return CONTENT_ID_PREFIX + createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** JSON 値から content id を作る。 */
export function contentIdOf(value: JsonValue): ContentId {
  return contentIdFromCanonical(canonicalize(value));
}

/** 文字列が本基盤の content id 形式かを判定する (sha256 hex = 64 桁)。 */
export function isContentId(s: string): boolean {
  return s.startsWith(CONTENT_ID_PREFIX) && /^[0-9a-f]{64}$/.test(s.slice(CONTENT_ID_PREFIX.length));
}
