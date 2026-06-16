import { describe, expect, it } from "vitest";
import { Foundation } from "../foundation.js";

async function seeded() {
  const fm = Foundation.inMemory();
  const rule = await fm.master.put({ rule: "no-cross-domain", severity: "block" });
  await fm.catalog.builder("an/proj").set("rule:ncd", rule.id).commit();
  return { fm, ruleId: rule.id };
}

describe("Resolver", () => {
  it("は user 未設定なら master を返す", async () => {
    const { fm, ruleId } = await seeded();
    const r = await fm.resolve("project-1", "an/proj", "rule:ncd");
    expect(r.source).toBe("master");
    expect(r.id).toBe(ruleId);
    expect(r.value).toEqual({ rule: "no-cross-domain", severity: "block" });
  });

  it("は user の live 値が master を上書きする", async () => {
    const { fm } = await seeded();
    await fm.user.set("project-1", "rule:ncd", { rule: "no-cross-domain", severity: "warn" });
    const r = await fm.resolve("project-1", "an/proj", "rule:ncd");
    expect(r.source).toBe("user");
    expect(r.value).toEqual({ rule: "no-cross-domain", severity: "warn" });
    expect(r.id).toBeNull();
  });

  it("は user の tombstone が master を隠す", async () => {
    const { fm } = await seeded();
    await fm.user.set("project-1", "rule:ncd", { x: 1 });
    await fm.user.delete("project-1", "rule:ncd");
    const r = await fm.resolve("project-1", "an/proj", "rule:ncd");
    expect(r.source).toBe("user");
    expect(r.value).toBeNull();
  });

  it("は master にも user にも無ければ none", async () => {
    const { fm } = await seeded();
    const r = await fm.resolve("project-1", "an/proj", "rule:missing");
    expect(r.source).toBe("none");
    expect(r.value).toBeNull();
  });

  it("は overlay が scope 単位 (他 scope は master のまま)", async () => {
    const { fm } = await seeded();
    await fm.user.set("project-1", "rule:ncd", { severity: "warn" });
    expect((await fm.resolve("project-1", "an/proj", "rule:ncd")).source).toBe("user");
    expect((await fm.resolve("project-2", "an/proj", "rule:ncd")).source).toBe("master");
  });

  it("resolveAll は master 名 ∪ user key を統合する", async () => {
    const { fm } = await seeded();
    await fm.user.set("project-1", "rule:extra", { local: true });
    const all = await fm.resolveAll("project-1", "an/proj");
    const byName = Object.fromEntries(all.map((r) => [r.key, r.source]));
    expect(byName).toEqual({ "rule:ncd": "master", "rule:extra": "user" });
  });
});
