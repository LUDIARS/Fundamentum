import { describe, expect, it } from "vitest";
import { MemoryBackend } from "../backend/memory-backend.js";
import { UserStore } from "../user/user-store.js";

function userStore() {
  return new UserStore(new MemoryBackend());
}

describe("UserStore", () => {
  it("は set した値を get できる", async () => {
    const u = userStore();
    await u.set("proj-1", "threshold", { warn: 0.8 });
    expect(await u.get("proj-1", "threshold")).toEqual({ warn: 0.8 });
  });

  it("は未設定 key で null", async () => {
    const u = userStore();
    expect(await u.get("proj-1", "nope")).toBeNull();
  });

  it("は set のたびに revision を増やす", async () => {
    const u = userStore();
    const r1 = await u.set("p", "k", 1);
    const r2 = await u.set("p", "k", 2);
    expect(r1.revision).toBe(1);
    expect(r2.revision).toBe(2);
    expect(await u.get("p", "k")).toBe(2);
  });

  it("は delete で tombstone を積み get が null になる", async () => {
    const u = userStore();
    await u.set("p", "k", 1);
    const t = await u.delete("p", "k");
    expect(t.deleted).toBe(true);
    expect(t.revision).toBe(2);
    expect(await u.get("p", "k")).toBeNull();
    expect((await u.getRecord("p", "k"))!.deleted).toBe(true);
  });

  it("history は tombstone 含む全リビジョンを古い順で返す", async () => {
    const u = userStore();
    await u.set("p", "k", 1);
    await u.delete("p", "k");
    await u.set("p", "k", 3);
    const h = await u.history("p", "k");
    expect(h.map((r) => ({ rev: r.revision, del: r.deleted, v: r.value }))).toEqual([
      { rev: 1, del: false, v: 1 },
      { rev: 2, del: true, v: null },
      { rev: 3, del: false, v: 3 },
    ]);
  });

  it("list は live key だけ返す (tombstone を除外)", async () => {
    const u = userStore();
    await u.set("p", "a", 1);
    await u.set("p", "b", 2);
    await u.delete("p", "b");
    expect(await u.list("p")).toEqual(["a"]);
  });

  it("は scope が独立している", async () => {
    const u = userStore();
    await u.set("p1", "k", "one");
    await u.set("p2", "k", "two");
    expect(await u.get("p1", "k")).toBe("one");
    expect(await u.get("p2", "k")).toBe("two");
  });
});
