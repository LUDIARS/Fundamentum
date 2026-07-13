/**
 * conflict/superset — 決定的スーパーセット判定 (コンフリクト解決の第 1 層)。
 * 「片方がもう片方の全情報を包含し、追加情報のみ持つ」ときだけ勝者を返す。
 * 保守的に倒す: 判定できないケースは null (→ LLM 層へ)。
 */
import { canonicalJson, type Payload } from "../store/record.js";

/** a が b を真に包含するか (a ⊃ b, a ≠ b) */
export function payloadStrictSuperset(a: Payload, b: Payload): boolean {
  if (a.format !== b.format) return false;
  if (a.format === "csv" || a.format === "text") {
    const at = String(a.data);
    const bt = String(b.data);
    return at.length > bt.length && at.includes(bt);
  }
  return jsonContains(a.data, b.data) && canonicalJson(a.data) !== canonicalJson(b.data);
}

export function decideSuperset(
  current: Payload,
  incoming: Payload,
): "current" | "incoming" | null {
  if (payloadStrictSuperset(incoming, current)) return "incoming";
  if (payloadStrictSuperset(current, incoming)) return "current";
  return null;
}

/** container が contained の全キー・値を再帰的に含むか */
function jsonContains(container: unknown, contained: unknown): boolean {
  if (Array.isArray(contained)) {
    if (!Array.isArray(container)) return false;
    // 多重集合としての包含 (順序不問・要素の重複を考慮)
    const pool = [...container];
    for (const item of contained) {
      const at = pool.findIndex((c) => jsonContains(c, item) && jsonContains(item, c));
      if (at < 0) return false;
      pool.splice(at, 1);
    }
    return true;
  }
  if (contained !== null && typeof contained === "object") {
    if (container === null || typeof container !== "object" || Array.isArray(container)) {
      return false;
    }
    const src = contained as Record<string, unknown>;
    const dst = container as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      if (!(key in dst)) return false;
      if (!jsonContains(dst[key], src[key])) return false;
    }
    return true;
  }
  return Object.is(container, contained);
}
