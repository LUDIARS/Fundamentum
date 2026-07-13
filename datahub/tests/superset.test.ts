import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideSuperset, payloadStrictSuperset } from "../src/conflict/superset.js";
import { jsonPayload, textPayload } from "./helpers.js";

describe("conflict/superset", () => {
  it("キー追加した JSON は superset 判定される", () => {
    const current = jsonPayload({ name: "torso", size: 1.5 });
    const incoming = jsonPayload({ name: "torso", size: 1.5, note: "追記" });
    assert.equal(decideSuperset(current, incoming), "incoming");
  });

  it("current 側が多い場合は current 勝ち", () => {
    const current = jsonPayload({ name: "torso", size: 1.5, note: "詳細" });
    const incoming = jsonPayload({ name: "torso" });
    assert.equal(decideSuperset(current, incoming), "current");
  });

  it("相互に異なる情報を持つ場合は判定しない (null)", () => {
    const current = jsonPayload({ name: "torso", a: 1 });
    const incoming = jsonPayload({ name: "torso", b: 2 });
    assert.equal(decideSuperset(current, incoming), null);
  });

  it("値の書き換えは superset ではない", () => {
    const current = jsonPayload({ size: 1.5 });
    const incoming = jsonPayload({ size: 2.0 });
    assert.equal(decideSuperset(current, incoming), null);
  });

  it("ネスト / 配列の包含 (要素追加) を認識する", () => {
    const current = jsonPayload({ nodes: [{ id: "a" }], edges: [] });
    const incoming = jsonPayload({ nodes: [{ id: "a" }, { id: "b" }], edges: [] });
    assert.equal(decideSuperset(current, incoming), "incoming");
  });

  it("配列は多重集合として比較する (重複要素の削減は包含でない)", () => {
    const current = jsonPayload({ xs: [1, 1, 2] });
    const incoming = jsonPayload({ xs: [1, 2] });
    assert.equal(payloadStrictSuperset(incoming, current), false);
  });

  it("text は部分文字列 + 長い方を superset とする", () => {
    const current = textPayload("sphere(0.5)");
    const incoming = textPayload("sphere(0.5) capsule(0.2)");
    assert.equal(decideSuperset(current, incoming), "incoming");
  });

  it("format が異なる payload は判定しない", () => {
    assert.equal(decideSuperset(textPayload("{}"), jsonPayload({})), null);
  });

  it("同一内容は strict superset ではない", () => {
    const p = jsonPayload({ a: 1 });
    assert.equal(payloadStrictSuperset(p, jsonPayload({ a: 1 })), false);
  });
});
