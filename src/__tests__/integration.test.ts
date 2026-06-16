import { describe, expect, it } from "vitest";
import { Foundation } from "../foundation.js";

/**
 * DESIGN §5 の利用シナリオ: 規定 (master) を catalog にまとめ、改訂時は diff の changed/added
 * だけ再解析すればよい (unchanged は content id 一致 = 解析キャッシュ命中)。user で上書きしても
 * master の決定性は汚れない、を端から端まで確認する。
 */
describe("Anatomia 風シナリオ (master 規定 + 更新差分 + user overlay)", () => {
  it("更新で変わるのは changed/added だけ、unchanged は id 一致", async () => {
    const fm = Foundation.inMemory();

    // v1: 規定ルール 3 本を catalog に束ねる
    const ruleA = await fm.master.put({ id: "no-cross-domain", severity: "block" });
    const ruleB = await fm.master.put({ id: "no-deep-coupling", severity: "warn" });
    const ruleC = await fm.master.put({ id: "spec-linked", severity: "info" });
    const v1 = await fm.catalog
      .builder("an/adventure")
      .set("no-cross-domain", ruleA.id)
      .set("no-deep-coupling", ruleB.id)
      .set("spec-linked", ruleC.id)
      .commit();

    // v2: B の severity を上げ (changed)、新ルール D を追加 (added)、A/C は据え置き
    const ruleBStrict = await fm.master.put({ id: "no-deep-coupling", severity: "block" });
    const ruleD = await fm.master.put({ id: "dod-layout", severity: "warn" });
    const v2 = await fm.catalog
      .builder("an/adventure")
      .set("no-deep-coupling", ruleBStrict.id)
      .set("dod-layout", ruleD.id)
      .commit();

    const d = fm.catalog.diff(v1, v2);
    expect(d.changed).toEqual(["no-deep-coupling"]);
    expect(d.added).toEqual(["dod-layout"]);
    expect(d.removed).toEqual([]);
    expect(d.unchanged.sort()).toEqual(["no-cross-domain", "spec-linked"]);

    // unchanged は content id がそのまま (= 再解析不要 / キャッシュ命中)
    expect(v2.entries["no-cross-domain"]).toBe(v1.entries["no-cross-domain"]);
    expect(v2.entries["spec-linked"]).toBe(v1.entries["spec-linked"]);
    // changed は別 id
    expect(v2.entries["no-deep-coupling"]).not.toBe(v1.entries["no-deep-coupling"]);
  });

  it("user overlay は規定を上書きするが master の決定性を汚さない", async () => {
    const fm = Foundation.inMemory();
    const ruleA = await fm.master.put({ id: "no-cross-domain", severity: "block" });
    await fm.catalog.builder("an/adventure").set("no-cross-domain", ruleA.id).commit();

    // project が severity を warn に緩める
    await fm.user.set("adventure", "no-cross-domain", { id: "no-cross-domain", severity: "warn" });

    const effective = await fm.resolve("adventure", "an/adventure", "no-cross-domain");
    expect(effective.source).toBe("user");
    expect(effective.value).toMatchObject({ severity: "warn" });

    // master 側の規定は無傷
    expect(await fm.master.get(ruleA.id)).toMatchObject({ severity: "block" });

    // 別 project では規定 (block) のまま
    const other = await fm.resolve("kuzu", "an/adventure", "no-cross-domain");
    expect(other.source).toBe("master");
    expect(other.value).toMatchObject({ severity: "block" });
  });
});
