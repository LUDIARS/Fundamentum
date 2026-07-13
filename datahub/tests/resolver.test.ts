import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ConflictLog } from "../src/conflict/conflict_log.js";
import { ConflictResolver, type ConflictItem } from "../src/conflict/resolver.js";
import type { ConflictJudge } from "../src/conflict/llm_judge.js";
import { payloadHash, type CommitRecord } from "../src/store/record.js";
import { AUTHOR_A, AUTHOR_B, fixedClock, jsonPayload, mkTmpDir } from "./helpers.js";
import { readJsonl } from "../src/util/jsonl.js";

function headRecord(payload = jsonPayload({ name: "torso", a: 1 })): CommitRecord {
  return {
    rev: 5,
    kind: "t.k",
    id: "a",
    author: AUTHOR_A,
    ts: "2026-07-13T00:00:00.000Z",
    hash: payloadHash(payload),
    payload,
  };
}

function item(payload: ConflictItem["payload"]): ConflictItem {
  return { kind: "t.k", id: "a", baseRev: 3, author: AUTHOR_B, payload };
}

describe("conflict/resolver", () => {
  const tmp = mkTmpDir("resolver");
  after(tmp.cleanup);

  it("superset は LLM を呼ばず決定的に解決する", async () => {
    const log = ConflictLog.open(join(tmp.dir, "superset"), fixedClock());
    let judgeCalls = 0;
    const judge: ConflictJudge = async () => {
      judgeCalls++;
      return { winner: "undecidable", reason: "呼ばれないはず" };
    };
    const resolver = new ConflictResolver(judge, log);
    const outcome = await resolver.resolve(item(jsonPayload({ name: "torso", a: 1, b: 2 })), headRecord());
    assert.equal(outcome.type, "auto");
    assert.equal(outcome.type === "auto" && outcome.winner, "incoming");
    assert.equal(outcome.type === "auto" && outcome.mode, "superset");
    assert.equal(judgeCalls, 0);
  });

  it("LLM winner=current で incoming 棄却 + ログが残る", async () => {
    const dir = join(tmp.dir, "llm-current");
    const log = ConflictLog.open(dir, fixedClock());
    const judge: ConflictJudge = async () => ({ winner: "current", reason: "current が詳細" });
    const resolver = new ConflictResolver(judge, log);
    const conflictItem = item(jsonPayload({ name: "torso", c: 9 }));
    const head = headRecord();
    const outcome = await resolver.resolve(conflictItem, head);
    assert.equal(outcome.type === "auto" && outcome.winner, "current");
    resolver.recordAuto(conflictItem, head, outcome as never);
    const events = readJsonl<{ event: string; mode: string; winner: string }>(
      join(dir, "conflicts.jsonl"),
    );
    assert.equal(events.length, 1);
    assert.equal(events[0]?.event, "auto-resolved");
    assert.equal(events[0]?.mode, "llm");
    assert.equal(events[0]?.winner, "current");
  });

  it("undecidable は pending になりリプレイで残る", async () => {
    const dir = join(tmp.dir, "pending");
    const log = ConflictLog.open(dir, fixedClock());
    const judge: ConflictJudge = async () => ({ winner: "undecidable", reason: "両方に固有情報" });
    const resolver = new ConflictResolver(judge, log);
    const outcome = await resolver.resolve(item(jsonPayload({ name: "torso", c: 9 })), headRecord());
    assert.equal(outcome.type, "pending");

    const reopened = ConflictLog.open(dir, fixedClock());
    assert.equal(reopened.listPending().length, 1);
    assert.match(reopened.listPending()[0]?.reason ?? "", /undecidable/);
  });

  it("judge=null (LLM 不在) は pending (llm-unavailable)", async () => {
    const log = ConflictLog.open(join(tmp.dir, "no-llm"), fixedClock());
    const resolver = new ConflictResolver(null, log);
    const outcome = await resolver.resolve(item(jsonPayload({ name: "x", c: 9 })), headRecord());
    assert.equal(outcome.type, "pending");
    assert.equal(outcome.type === "pending" && outcome.pending.reason, "llm-unavailable");
  });

  it("judge が throw しても pending として観測可能", async () => {
    const log = ConflictLog.open(join(tmp.dir, "llm-error"), fixedClock());
    const judge: ConflictJudge = async () => {
      throw new Error("timeout");
    };
    const resolver = new ConflictResolver(judge, log);
    const outcome = await resolver.resolve(item(jsonPayload({ name: "x", c: 9 })), headRecord());
    assert.equal(outcome.type, "pending");
    assert.match(outcome.type === "pending" ? outcome.pending.reason : "", /llm-error/);
  });

  it("手動解決で pending が解消される", async () => {
    const dir = join(tmp.dir, "manual");
    const log = ConflictLog.open(dir, fixedClock());
    const resolver = new ConflictResolver(null, log);
    const outcome = await resolver.resolve(item(jsonPayload({ name: "x", c: 9 })), headRecord());
    const conflictId = outcome.type === "pending" ? outcome.pending.conflictId : "";
    log.logManualResolved(conflictId, "incoming", 6);
    assert.equal(log.listPending().length, 0);
    assert.equal(ConflictLog.open(dir, fixedClock()).listPending().length, 0);
  });
});
