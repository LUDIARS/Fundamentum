import { describe, expect, it } from "vitest";
import { canonicalize } from "../hash/canonical.js";
import { CONTENT_ID_PREFIX, contentIdOf, isContentId } from "../hash/content-id.js";

describe("canonicalize", () => {
  it("はキー順に依存しない", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it("は入れ子のキーもソートする", () => {
    const x = canonicalize({ z: { y: 1, x: 2 }, a: [3, { d: 4, c: 5 }] });
    const y = canonicalize({ a: [3, { c: 5, d: 4 }], z: { x: 2, y: 1 } });
    expect(x).toBe(y);
  });

  it("は配列の順序を保つ (順序は意味)", () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
  });

  it("は -0 を 0 に正規化する", () => {
    expect(canonicalize(-0)).toBe(canonicalize(0));
  });

  it("は非有限数で throw する", () => {
    expect(() => canonicalize(Infinity as unknown as number)).toThrow();
    expect(() => canonicalize(NaN as unknown as number)).toThrow();
  });

  it("は undefined / 関数で throw する", () => {
    expect(() => canonicalize(undefined as never)).toThrow();
    expect(() => canonicalize((() => 1) as never)).toThrow();
  });
});

describe("contentIdOf", () => {
  it("は同一内容 (キー順違い含む) で同じ id", () => {
    expect(contentIdOf({ a: 1, b: 2 })).toBe(contentIdOf({ b: 2, a: 1 }));
  });

  it("は内容が違えば違う id", () => {
    expect(contentIdOf({ a: 1 })).not.toBe(contentIdOf({ a: 2 }));
  });

  it("は fm1: prefix + sha256 hex 形式", () => {
    const id = contentIdOf({ hello: "world" });
    expect(id.startsWith(CONTENT_ID_PREFIX)).toBe(true);
    expect(isContentId(id)).toBe(true);
  });

  it("isContentId は非 id 文字列を弾く", () => {
    expect(isContentId("not-an-id")).toBe(false);
    expect(isContentId("fm1:zzz")).toBe(false);
  });
});
