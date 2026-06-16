import { describe, expect, it } from "vitest";
import { MemoryBackend } from "../backend/memory-backend.js";
import { CatalogStore } from "../master/catalog.js";
import { MasterStore } from "../master/master-store.js";

function fixtures() {
  const backend = new MemoryBackend();
  return { backend, master: new MasterStore(backend), catalog: new CatalogStore(backend) };
}

describe("MasterStore", () => {
  it("は put した値を id で取り出せる", async () => {
    const { master } = fixtures();
    const rec = await master.put({ rule: "no-cross-domain" });
    expect(await master.get(rec.id)).toEqual({ rule: "no-cross-domain" });
  });

  it("は同一内容を dedup する (同 id)", async () => {
    const { master } = fixtures();
    const a = await master.put({ x: 1, y: 2 });
    const b = await master.put({ y: 2, x: 1 });
    expect(a.id).toBe(b.id);
  });

  it("は未知 id で null を返す", async () => {
    const { master } = fixtures();
    expect(await master.get("fm1:" + "0".repeat(64))).toBeNull();
  });

  it("putAll は入力順の record を返す", async () => {
    const { master } = fixtures();
    const recs = await master.putAll([{ a: 1 }, { b: 2 }]);
    expect(recs).toHaveLength(2);
    expect(await master.get(recs[0]!.id)).toEqual({ a: 1 });
    expect(await master.get(recs[1]!.id)).toEqual({ b: 2 });
  });
});

describe("CatalogStore", () => {
  it("は builder で初版を作る (version 1)", async () => {
    const { master, catalog } = fixtures();
    const r = await master.put({ rule: "a" });
    const cat = await catalog.builder("an/proj").set("rule:a", r.id).commit();
    expect(cat.version).toBe(1);
    expect(cat.parent).toBeNull();
    expect(cat.entries["rule:a"]).toBe(r.id);
  });

  it("は更新で version を増やし parent を繋ぐ", async () => {
    const { master, catalog } = fixtures();
    const r1 = await master.put({ rule: "a" });
    const r2 = await master.put({ rule: "a2" });
    const v1 = await catalog.builder("an/proj").set("rule:a", r1.id).commit();
    const v2 = await catalog.builder("an/proj").set("rule:a", r2.id).commit();
    expect(v2.version).toBe(2);
    expect(v2.parent).toBe(v1.id);
    expect((await catalog.latest("an/proj"))!.id).toBe(v2.id);
  });

  it("は差分の無い commit を no-op にする", async () => {
    const { master, catalog } = fixtures();
    const r = await master.put({ rule: "a" });
    const v1 = await catalog.builder("an/proj").set("rule:a", r.id).commit();
    const v2 = await catalog.builder("an/proj").set("rule:a", r.id).commit();
    expect(v2.id).toBe(v1.id);
    expect(v2.version).toBe(1);
  });

  it("diff は added/removed/changed/unchanged を返す", async () => {
    const { master, catalog } = fixtures();
    const a = await master.put({ v: "a" });
    const a2 = await master.put({ v: "a2" });
    const b = await master.put({ v: "b" });
    const c = await master.put({ v: "c" });
    const v1 = await catalog
      .builder("an/proj")
      .set("keep", b.id)
      .set("change", a.id)
      .set("drop", c.id)
      .commit();
    const v2 = await catalog
      .builder("an/proj")
      .set("change", a2.id)
      .remove("drop")
      .set("new", c.id)
      .commit();
    const d = catalog.diff(v1, v2);
    expect(d.added).toEqual(["new"]);
    expect(d.removed).toEqual(["drop"]);
    expect(d.changed).toEqual(["change"]);
    expect(d.unchanged).toEqual(["keep"]);
  });

  it("history は latest 先頭で全版を返す", async () => {
    const { master, catalog } = fixtures();
    const r1 = await master.put({ v: 1 });
    const r2 = await master.put({ v: 2 });
    await catalog.builder("an/proj").set("x", r1.id).commit();
    await catalog.builder("an/proj").set("x", r2.id).commit();
    const hist = await catalog.history("an/proj");
    expect(hist.map((c) => c.version)).toEqual([2, 1]);
  });

  it("version(name, n) で過去版を引ける", async () => {
    const { master, catalog } = fixtures();
    const r1 = await master.put({ v: 1 });
    const r2 = await master.put({ v: 2 });
    const v1 = await catalog.builder("an/proj").set("x", r1.id).commit();
    await catalog.builder("an/proj").set("x", r2.id).commit();
    expect((await catalog.version("an/proj", 1))!.id).toBe(v1.id);
  });

  it("names は head のある catalog を列挙する", async () => {
    const { master, catalog } = fixtures();
    const r = await master.put({ v: 1 });
    await catalog.builder("an/a").set("x", r.id).commit();
    await catalog.builder("an/b").set("x", r.id).commit();
    expect(await catalog.names()).toEqual(["an/a", "an/b"]);
  });
});
