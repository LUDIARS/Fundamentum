import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createDatahub, type Datahub } from "../src/server/http.js";
import type { ConflictJudge } from "../src/conflict/llm_judge.js";
import type { SensitiveChecker } from "../src/sensitive/llm_check.js";
import type { KindConfig } from "../src/config.js";
import { AUTHOR_A, AUTHOR_B, fixedClock, jsonPayload, mkTmpDir } from "./helpers.js";

const OPEN_KINDS: Record<string, KindConfig> = {
  "fundamentum.skeleton": { sensitiveCheck: false },
  "test.free": { sensitiveCheck: false },
};

interface Booted {
  hub: Datahub;
  base: string;
}

async function boot(opts: {
  dataDir: string;
  judge?: ConflictJudge | null;
  checker?: SensitiveChecker | null;
  kinds?: Record<string, KindConfig>;
  maxPayloadBytes?: number;
}): Promise<Booted> {
  const hub = createDatahub({
    config: {
      dataDir: opts.dataDir,
      port: 0,
      kinds: opts.kinds ?? OPEN_KINDS,
      ...(opts.maxPayloadBytes ? { maxPayloadBytes: opts.maxPayloadBytes } : {}),
    },
    judge: opts.judge ?? null,
    checker: opts.checker ?? null,
    clock: fixedClock(),
  });
  const port = await hub.listen(0);
  return { hub, base: `http://127.0.0.1:${port}` };
}

async function post<T>(base: string, path: string, body: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function get<T>(base: string, path: string): Promise<{ status: number; body: T }> {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: (await res.json()) as T };
}

function pushBody(author: string, kind: string, id: string, baseRev: number, data: unknown) {
  return { author, items: [{ kind, id, baseRev, payload: jsonPayload(data) }] };
}

interface PushResult {
  headRev: number;
  results: Array<Record<string, unknown> & { status: string; rev?: number }>;
}

describe("server e2e", () => {
  const tmp = mkTmpDir("e2e");
  after(tmp.cleanup);

  it("health → author 登録 → push → 戻り rev 受領 → pull 差分往復", async () => {
    const { hub, base } = await boot({ dataDir: join(tmp.dir, "happy") });
    try {
      const health = await get<{ ok: boolean; llm: { conflict: boolean } }>(base, "/v1/health");
      assert.equal(health.body.ok, true);
      assert.equal(health.body.llm.conflict, false);

      // author 未登録の push は拒否
      const early = await post<{ error: { code: string } }>(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 0, { v: 1 }));
      assert.equal(early.status, 400);
      assert.equal(early.body.error.code, "unknown-author");

      assert.equal((await post(base, "/v1/authors", { author: AUTHOR_A, name: "neco" })).status, 200);
      assert.equal((await post(base, "/v1/authors", { author: AUTHOR_B, name: "kaz" })).status, 200);

      // push の戻りで採番 rev を受け取る
      const p1 = await post<PushResult>(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 0, { v: 1 }));
      assert.equal(p1.body.results[0]?.status, "committed");
      assert.equal(p1.body.results[0]?.rev, 1);
      assert.equal(p1.body.headRev, 1);

      // B が pull で A の差分を受領
      const pull = await get<{ headRev: number; records: Array<{ rev: number; author: string }> }>(base, "/v1/pull?since=0");
      assert.equal(pull.body.headRev, 1);
      assert.equal(pull.body.records.length, 1);
      assert.equal(pull.body.records[0]?.author, AUTHOR_A);

      // 同一 payload は unchanged (冪等)
      const p2 = await post<PushResult>(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 1, { v: 1 }));
      assert.equal(p2.body.results[0]?.status, "unchanged");
      assert.equal(p2.body.results[0]?.rev, 1);

      // B が最新 baseRev で更新
      const p3 = await post<PushResult>(base, "/v1/push", pushBody(AUTHOR_B, "test.free", "a", 1, { v: 2 }));
      assert.equal(p3.body.results[0]?.status, "committed");
      assert.equal(p3.body.results[0]?.rev, 2);

      const authors = await get<{ authors: Array<{ name: string }> }>(base, "/v1/authors");
      assert.deepEqual(authors.body.authors.map((a) => a.name).sort(), ["kaz", "neco"]);
    } finally {
      await hub.close();
    }
  });

  it("コンフリクト: LLM スタブで自動解決し resolution が返る", async () => {
    const judge: ConflictJudge = async (input) =>
      (input.incoming.payload.data as { rich?: boolean }).rich
        ? { winner: "incoming", reason: "incoming が情報量豊富" }
        : { winner: "current", reason: "current が情報量豊富" };
    const { hub, base } = await boot({ dataDir: join(tmp.dir, "conflict"), judge });
    try {
      await post(base, "/v1/authors", { author: AUTHOR_A, name: "neco" });
      await post(base, "/v1/authors", { author: AUTHOR_B, name: "kaz" });
      await post(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 0, { v: 1, a: 1 }));
      await post(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 1, { v: 2, b: 2 }));

      // B は rev1 しか知らない状態で異なる内容を push → LLM 判定 incoming 勝ち
      const win = await post<PushResult>(base, "/v1/push", pushBody(AUTHOR_B, "test.free", "a", 1, { v: 3, rich: true }));
      assert.equal(win.body.results[0]?.status, "resolved-incoming");
      assert.equal(win.body.results[0]?.rev, 3);
      assert.deepEqual((win.body.results[0]?.resolution as { winner: string }).winner, "incoming");

      // current 勝ち: incoming 棄却で head 維持
      const lose = await post<PushResult>(base, "/v1/push", pushBody(AUTHOR_B, "test.free", "a", 1, { v: 9, rich: false }));
      assert.equal(lose.body.results[0]?.status, "resolved-current");
      assert.equal(lose.body.results[0]?.headRev, 3);
      assert.equal(lose.body.headRev, 3);
    } finally {
      await hub.close();
    }
  });

  it("pending → 一覧 → 手動解決 → 新 rev", async () => {
    const judge: ConflictJudge = async () => ({ winner: "undecidable", reason: "優劣不明" });
    const { hub, base } = await boot({ dataDir: join(tmp.dir, "pending"), judge });
    try {
      await post(base, "/v1/authors", { author: AUTHOR_A, name: "neco" });
      await post(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 0, { v: 1, a: 1 }));
      await post(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 1, { v: 2, b: 2 }));
      const conflicted = await post<PushResult>(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 1, { v: 7, c: 3 }));
      assert.equal(conflicted.body.results[0]?.status, "conflict");
      const conflictId = conflicted.body.results[0]?.conflictId as string;
      assert.ok(conflictId);

      const list = await get<{ conflicts: Array<{ conflictId: string }> }>(base, "/v1/conflicts");
      assert.equal(list.body.conflicts.length, 1);

      const resolved = await post<{ status: string; rev?: number }>(base, "/v1/conflicts/resolve", {
        conflictId,
        winner: "incoming",
      });
      assert.equal(resolved.body.status, "resolved-incoming");
      assert.equal(resolved.body.rev, 3);
      assert.equal((await get<{ conflicts: unknown[] }>(base, "/v1/conflicts")).body.conflicts.length, 0);
    } finally {
      await hub.close();
    }
  });

  it("センシティブ検査: 検査対象 kind の reject と値の非エコー", async () => {
    const checker: SensitiveChecker = async () => ({
      verdict: "reject",
      category: "personal-contact",
      reason: "個人の連絡先を含むため共有不可",
    });
    const { hub, base } = await boot({ dataDir: join(tmp.dir, "sensitive"), checker, kinds: {} });
    try {
      await post(base, "/v1/authors", { author: AUTHOR_A, name: "neco" });
      // seed ルールに掛からない内容にして LLM 層 (スタブ) まで届かせる
      const secret = "自宅は千代田区一番町1-2-303号室";
      const result = await post<PushResult>(
        base,
        "/v1/push",
        pushBody(AUTHOR_A, "discutere.persona", "p1", 0, { contact: secret }),
      );
      assert.equal(result.body.results[0]?.status, "rejected-sensitive");
      assert.equal(result.body.results[0]?.category, "personal-contact");
      assert.ok(!JSON.stringify(result.body).includes(secret));
      assert.equal(result.body.headRev, 0); // コミットされない
    } finally {
      await hub.close();
    }
  });

  it("payload 上限超過は item 単位の error", async () => {
    const { hub, base } = await boot({ dataDir: join(tmp.dir, "limit"), maxPayloadBytes: 256 });
    try {
      await post(base, "/v1/authors", { author: AUTHOR_A, name: "neco" });
      const result = await post<PushResult>(
        base,
        "/v1/push",
        pushBody(AUTHOR_A, "test.free", "big", 0, { blob: "x".repeat(1000) }),
      );
      assert.equal(result.body.results[0]?.status, "error");
      assert.match(String(result.body.results[0]?.error), /上限/);
    } finally {
      await hub.close();
    }
  });

  it("kind 不正 / baseRev 不正は item error、author 不正は 400", async () => {
    const { hub, base } = await boot({ dataDir: join(tmp.dir, "validate") });
    try {
      await post(base, "/v1/authors", { author: AUTHOR_A, name: "neco" });
      const bad = await post<PushResult>(base, "/v1/push", {
        author: AUTHOR_A,
        items: [
          { kind: "no spaces allowed", id: "a", baseRev: 0, payload: jsonPayload({}) },
          { kind: "test.free", id: "a", baseRev: -1, payload: jsonPayload({}) },
          { kind: "test.free", id: "a", baseRev: 0, payload: { format: "csv", data: 123 } },
        ],
      });
      assert.deepEqual(bad.body.results.map((r) => r.status), ["error", "error", "error"]);

      const badAuthor = await post<{ error: { code: string } }>(base, "/v1/push", pushBody("nope", "test.free", "a", 0, {}));
      assert.equal(badAuthor.status, 400);
    } finally {
      await hub.close();
    }
  });

  it("oplog / backup API / 再起動リプレイ", async () => {
    const dataDir = join(tmp.dir, "lifecycle");
    const { hub, base } = await boot({ dataDir });
    try {
      await post(base, "/v1/authors", { author: AUTHOR_A, name: "neco" });
      await post(base, "/v1/push", pushBody(AUTHOR_A, "test.free", "a", 0, { v: 1 }));
      await get(base, "/v1/pull?since=0");

      const log = await get<{ entries: Array<{ op: string }> }>(base, "/v1/log?limit=10");
      assert.deepEqual(log.body.entries.map((e) => e.op), ["pull", "push", "authors"]);

      const backup = await post<{ ok: boolean; headRev: number }>(base, "/v1/backup", {});
      assert.equal(backup.body.ok, true);
      assert.equal(backup.body.headRev, 1);
      const backups = await get<{ backups: Array<{ headRev: number }> }>(base, "/v1/backups");
      assert.equal(backups.body.backups.length, 1);
    } finally {
      await hub.close();
    }

    // 再起動: リプレイで headRev / head 内容が一致する
    const second = await boot({ dataDir });
    try {
      const health = await get<{ headRev: number; records: number }>(second.base, "/v1/health");
      assert.equal(health.body.headRev, 1);
      assert.equal(health.body.records, 1);
      const records = await get<{ records: Array<{ payload: { data: { v: number } } }> }>(second.base, "/v1/records");
      assert.equal(records.body.records[0]?.payload.data.v, 1);
    } finally {
      await second.hub.close();
    }
  });
});
