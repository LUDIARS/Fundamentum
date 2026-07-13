import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SensitiveRules } from "../src/sensitive/rules.js";
import { SensitiveScreen } from "../src/sensitive/screen.js";
import type { SensitiveChecker } from "../src/sensitive/llm_check.js";
import { appendJsonl, readJsonl } from "../src/util/jsonl.js";
import { AUTHOR_A, fixedClock, jsonPayload, mkTmpDir, textPayload } from "./helpers.js";

describe("sensitive/rules", () => {
  const tmp = mkTmpDir("rules");
  after(tmp.cleanup);

  it("seed ルールでメール / 電話 / 秘密鍵を検知する", () => {
    const rules = SensitiveRules.open(join(tmp.dir, "seed"), fixedClock());
    assert.ok(rules.match("連絡先: taro@example.com"));
    assert.ok(rules.match("tel 090-1234-5678 まで"));
    assert.ok(rules.match("-----BEGIN RSA PRIVATE KEY-----"));
    assert.equal(rules.match('{"nodes":[{"id":"a"}],"edges":[]}'), null);
  });

  it("disable イベントでルールを無効化できる", () => {
    const dir = join(tmp.dir, "disable");
    const rules = SensitiveRules.open(dir, fixedClock());
    const hit = rules.match("taro@example.com");
    assert.ok(hit);
    appendJsonl(join(dir, "sensitive-rules.jsonl"), {
      event: "disable",
      ruleId: hit.ruleId,
      ts: "2026-07-13T00:00:00.000Z",
    });
    const reopened = SensitiveRules.open(dir, fixedClock());
    assert.equal(reopened.match("taro@example.com"), null);
  });

  it("学習パターンは canary 誤検知 / 不正 regex を却下する", () => {
    const rules = SensitiveRules.open(join(tmp.dir, "learn"), fixedClock());
    const before = rules.size;
    const adopted = rules.learn([
      { category: "too-broad", pattern: ".+" },
      { category: "broken", pattern: "([" },
      { category: "voice-actor-real-name", pattern: "声優[:：]\\s*[\\p{Script=Han}]{2,4}\\s?[\\p{Script=Han}]{2,4}(さん|氏)" },
    ]);
    assert.equal(adopted, 1);
    assert.equal(rules.size, before + 1);
    assert.ok(rules.match("声優: 山田 太郎さん"));
  });
});

describe("sensitive/screen", () => {
  const tmp = mkTmpDir("screen");
  after(tmp.cleanup);

  function makeScreen(
    dir: string,
    checker: SensitiveChecker | null,
    kinds: Record<string, { sensitiveCheck?: boolean }> = {},
  ): { screen: SensitiveScreen; rules: SensitiveRules } {
    const rules = SensitiveRules.open(dir, fixedClock());
    const screen = new SensitiveScreen({
      rules,
      checker,
      kinds,
      dataDir: dir,
      maxCheckBytes: 65536,
      clock: fixedClock(),
    });
    return { screen, rules };
  }

  it("未宣言 kind は既定で検査 ON、明示 OFF はスキップ", async () => {
    const dir = join(tmp.dir, "default-on");
    let called = 0;
    const checker: SensitiveChecker = async () => {
      called++;
      return { verdict: "allow" };
    };
    const { screen } = makeScreen(dir, checker, { "safe.kind": { sensitiveCheck: false } });
    assert.equal((await screen.screen({ kind: "unknown.kind", id: "x", author: AUTHOR_A, payload: jsonPayload({ ok: 1 }) })).ok, true);
    assert.equal(called, 1);
    assert.equal((await screen.screen({ kind: "safe.kind", id: "x", author: AUTHOR_A, payload: textPayload("taro@example.com") })).ok, true);
    assert.equal(called, 1); // OFF kind は ルール層も LLM 層も通らない
  });

  it("ルール層ヒットは LLM を呼ばず reject + redact 記録", async () => {
    const dir = join(tmp.dir, "rule-hit");
    let called = 0;
    const checker: SensitiveChecker = async () => {
      called++;
      return { verdict: "allow" };
    };
    const { screen } = makeScreen(dir, checker);
    const result = await screen.screen({
      kind: "discutere.persona",
      id: "p1",
      author: AUTHOR_A,
      payload: jsonPayload({ profile: "連絡は taro@example.com へ" }),
    });
    assert.equal(result.ok, false);
    assert.equal(called, 0);
    const logs = readJsonl<Record<string, unknown>>(join(dir, "sensitive.jsonl"));
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.layer, "rules");
    // redact: 検知値がログに含まれない
    assert.ok(!JSON.stringify(logs[0]).includes("taro@example.com"));
  });

  it("LLM reject は learnedPatterns でルール層が成長し、次回は決定的に落ちる", async () => {
    const dir = join(tmp.dir, "grow");
    let called = 0;
    const checker: SensitiveChecker = async () => {
      called++;
      return {
        verdict: "reject",
        category: "personal-address",
        reason: "実在住所を含む",
        learnedPatterns: [{ category: "personal-address", pattern: "東京都[\\s\\S]{0,20}\\d+-\\d+-\\d+" }],
      };
    };
    const { screen } = makeScreen(dir, checker);
    const payload = textPayload("納品先: 東京都某区某町 1-2-3");
    const first = await screen.screen({ kind: "d.p", id: "x", author: AUTHOR_A, payload });
    assert.equal(first.ok, false);
    assert.equal(called, 1);

    const second = await screen.screen({ kind: "d.p", id: "x", author: AUTHOR_A, payload });
    assert.equal(second.ok, false);
    assert.equal(called, 1); // 2 回目はルール層で決定的に reject (成長の検証)
  });

  it("reject レスポンス自体にも検知値を含めない", async () => {
    const dir = join(tmp.dir, "redact-response");
    const { screen } = makeScreen(dir, null); // ルール層のみで検証
    const result = await screen.screen({
      kind: "d.p",
      id: "x",
      author: AUTHOR_A,
      payload: textPayload("mail: hime@example.com"),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(!result.reason.includes("hime@example.com"));
      assert.ok(!result.category.includes("hime"));
    }
  });

  it("LLM 不在時の検査対象 kind は reject (無言スキップしない)", async () => {
    const dir = join(tmp.dir, "no-llm");
    const { screen } = makeScreen(dir, null);
    const result = await screen.screen({
      kind: "d.p",
      id: "x",
      author: AUTHOR_A,
      payload: jsonPayload({ harmless: true }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.category, "llm-unavailable");
  });

  it("LLM 実行失敗も reject として観測可能", async () => {
    const dir = join(tmp.dir, "llm-error");
    const checker: SensitiveChecker = async () => {
      throw new Error("spawn failed");
    };
    const { screen } = makeScreen(dir, checker);
    const result = await screen.screen({
      kind: "d.p",
      id: "x",
      author: AUTHOR_A,
      payload: jsonPayload({ v: 1 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.category, "llm-error");
  });
});
