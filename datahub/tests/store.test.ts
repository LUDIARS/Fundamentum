import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Store } from "../src/store/store.js";
import { AuthorRegistry } from "../src/store/authors.js";
import { AUTHOR_A, AUTHOR_B, fixedClock, jsonPayload, mkTmpDir } from "./helpers.js";

describe("store/store + revlog", () => {
  const tmp = mkTmpDir("store");
  after(tmp.cleanup);

  it("採番は単調増加し、リプレイで往復一致する", () => {
    const dir = join(tmp.dir, "roundtrip");
    const store = Store.open(dir, fixedClock());
    const r1 = store.commit({ kind: "t.k", id: "a", author: AUTHOR_A, payload: jsonPayload({ v: 1 }) });
    const r2 = store.commit({ kind: "t.k", id: "b", author: AUTHOR_A, payload: jsonPayload({ v: 2 }) });
    const r3 = store.commit({ kind: "t.k", id: "a", author: AUTHOR_B, payload: jsonPayload({ v: 3 }) });
    assert.deepEqual([r1.rev, r2.rev, r3.rev], [1, 2, 3]);

    const reopened = Store.open(dir, fixedClock());
    assert.equal(reopened.headRev, 3);
    assert.equal(reopened.recordCount, 2);
    assert.deepEqual(reopened.head("t.k", "a")?.payload, jsonPayload({ v: 3 }));
    assert.equal(reopened.head("t.k", "a")?.rev, 3);
  });

  it("pullSince は境界を含まず rev 昇順で返す", () => {
    const dir = join(tmp.dir, "pull");
    const store = Store.open(dir, fixedClock());
    for (let i = 1; i <= 5; i++) {
      store.commit({ kind: i % 2 ? "odd.k" : "even.k", id: `x${i}`, author: AUTHOR_A, payload: jsonPayload({ i }) });
    }
    assert.deepEqual(store.pullSince(0).map((r) => r.rev), [1, 2, 3, 4, 5]);
    assert.deepEqual(store.pullSince(3).map((r) => r.rev), [4, 5]);
    assert.deepEqual(store.pullSince(5), []);
    assert.deepEqual(store.pullSince(0, "odd.").map((r) => r.rev), [1, 3, 5]);
  });

  it("heads は各 (kind,id) の最新のみ返す", () => {
    const dir = join(tmp.dir, "heads");
    const store = Store.open(dir, fixedClock());
    store.commit({ kind: "t.k", id: "a", author: AUTHOR_A, payload: jsonPayload({ v: 1 }) });
    store.commit({ kind: "t.k", id: "a", author: AUTHOR_A, payload: jsonPayload({ v: 2 }) });
    store.commit({ kind: "u.k", id: "b", author: AUTHOR_A, payload: jsonPayload({ v: 3 }) });
    const heads = store.heads();
    assert.deepEqual(heads.map((r) => [r.kind, r.id, r.rev]), [["t.k", "a", 2], ["u.k", "b", 3]]);
    assert.deepEqual(store.heads("u.").map((r) => r.rev), [3]);
  });

  it("rev 連番の破れは起動時に fail-fast", () => {
    const dir = join(tmp.dir, "broken");
    const store = Store.open(dir, fixedClock());
    store.commit({ kind: "t.k", id: "a", author: AUTHOR_A, payload: jsonPayload({ v: 1 }) });
    const file = join(dir, "revlog.jsonl");
    const line = readFileSync(file, "utf8").trim().replace('"rev":1', '"rev":7');
    writeFileSync(file, `${line}\n`, "utf8");
    assert.throws(() => Store.open(dir, fixedClock()), /rev 連番が破れています/);
  });

  it("破損 JSONL 行は行番号付きで fail-fast", () => {
    const dir = join(tmp.dir, "corrupt");
    const store = Store.open(dir, fixedClock());
    store.commit({ kind: "t.k", id: "a", author: AUTHOR_A, payload: jsonPayload({ v: 1 }) });
    appendFileSync(join(dir, "revlog.jsonl"), "{broken\n", "utf8");
    assert.throws(() => Store.open(dir, fixedClock()), /revlog\.jsonl:2/);
  });
});

describe("store/authors", () => {
  const tmp = mkTmpDir("authors");
  after(tmp.cleanup);

  it("upsert / firstSeen 保持 / リプレイ再構成", () => {
    const registry = AuthorRegistry.open(tmp.dir, fixedClock());
    registry.upsert(AUTHOR_A, "neco");
    registry.upsert(AUTHOR_A, "neco2");
    registry.upsert(AUTHOR_B, "kaz");

    const reopened = AuthorRegistry.open(tmp.dir, fixedClock("2026-07-14T00:00:00.000Z"));
    const a = reopened.get(AUTHOR_A);
    assert.equal(a?.name, "neco2");
    assert.equal(a?.firstSeen, "2026-07-13T00:00:00.000Z");
    assert.equal(a?.lastSeen, "2026-07-13T00:00:01.000Z");
    assert.equal(reopened.list().length, 2);
    assert.equal(reopened.has(AUTHOR_B), true);
  });

  it("UUIDv4 以外 / 空名は拒否", () => {
    const registry = AuthorRegistry.open(join(tmp.dir, "strict"), fixedClock());
    assert.throws(() => registry.upsert("not-a-uuid", "x"), /UUIDv4/);
    assert.throws(() => registry.upsert(AUTHOR_A, "  "), /name が空/);
  });
});
