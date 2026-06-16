import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileBackend } from "../backend/file-backend.js";
import { Foundation } from "../foundation.js";

describe("FileBackend", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "fundamentum-test-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("は content を roundtrip する", async () => {
    const be = new FileBackend(dir);
    await be.putContent("fm1:" + "a".repeat(64), '{"x":1}');
    expect(await be.hasContent("fm1:" + "a".repeat(64))).toBe(true);
    expect(await be.getContent("fm1:" + "a".repeat(64))).toBe('{"x":1}');
  });

  it("は未知 content で null / false", async () => {
    const be = new FileBackend(dir);
    expect(await be.getContent("fm1:" + "f".repeat(64))).toBeNull();
    expect(await be.hasContent("fm1:" + "f".repeat(64))).toBe(false);
  });

  it("は keyed を roundtrip / list / delete する", async () => {
    const be = new FileBackend(dir);
    await be.putKeyed("part", "k1", "v1");
    await be.putKeyed("part", "k2", "v2");
    expect(await be.getKeyed("part", "k1")).toBe("v1");
    expect(await be.listKeys("part")).toEqual(["k1", "k2"]);
    await be.deleteKeyed("part", "k1");
    expect(await be.getKeyed("part", "k1")).toBeNull();
    expect(await be.listKeys("part")).toEqual(["k2"]);
  });

  it("は不在 partition の list で [] を返す", async () => {
    const be = new FileBackend(dir);
    expect(await be.listKeys("nope")).toEqual([]);
  });

  it("は fs 非安全な key (slash / unicode) も扱える", async () => {
    const be = new FileBackend(dir);
    await be.putKeyed("an/proj@v", "rule:a/b 日本語", "ok");
    expect(await be.getKeyed("an/proj@v", "rule:a/b 日本語")).toBe("ok");
    expect(await be.listKeys("an/proj@v")).toEqual(["rule:a/b 日本語"]);
  });

  it("は別インスタンスでも永続を読める", async () => {
    const fm1 = Foundation.onDisk(dir);
    const r = await fm1.master.put({ rule: "a" });
    await fm1.catalog.builder("an/proj").set("rule:a", r.id).commit();
    await fm1.user.set("p1", "rule:a", { local: true });

    const fm2 = Foundation.onDisk(dir);
    expect(await fm2.master.get(r.id)).toEqual({ rule: "a" });
    expect((await fm2.catalog.latest("an/proj"))!.entries["rule:a"]).toBe(r.id);
    expect(await fm2.user.get("p1", "rule:a")).toEqual({ local: true });
  });
});
