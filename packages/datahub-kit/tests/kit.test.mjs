// kit データテスト — 実 datahub サーバをプロセス内起動し、client.mjs で
// 各 format (json/graph/csv/text) の push→pull 往復・payload 完全一致を検証する。
// 前提: `npm run build` 済みの datahub (../../datahub/dist)。
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDatahub } from "../../../datahub/dist/src/server/http.js";
import { DatahubClient } from "../src/client.mjs";
import {
  authorDisplayName,
  conflictLines,
  healthLine,
  pullResponseLines,
  pushResponseLines,
} from "../src/render_model.mjs";

const AUTHOR = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const dataDir = mkdtempSync(join(tmpdir(), "fm-datahub-kit-"));
const hub = createDatahub({
  config: { dataDir, port: 0, kinds: { "test.free": { sensitiveCheck: false } } },
  judge: null,
  checker: async () => ({ verdict: "allow" }),
  clock: () => new Date("2026-07-13T00:00:00.000Z"),
});
const port = await hub.listen(0);
const client = new DatahubClient({ baseUrl: `http://127.0.0.1:${port}`, author: AUTHOR });

after(async () => {
  await hub.close();
  try {
    rmSync(dataDir, { recursive: true, force: true, maxRetries: 5 });
  } catch (e) {
    console.warn("[kit-test] tmp 掃除失敗:", e.message);
  }
});

describe("datahub-kit データテスト (実サーバ経路)", () => {
  it("health / 表示名登録", async () => {
    const health = await client.health();
    assert.equal(health.ok, true);
    assert.equal(healthLine(health).level, "ok");
    const registered = await client.registerAuthor("kit-tester");
    assert.equal(registered.name, "kit-tester");
    assert.equal(authorDisplayName((await client.authors()).authors, AUTHOR), "kit-tester");
  });

  it("json / graph / csv / text の push→pull 往復で payload が完全一致する", async () => {
    const samples = [
      { kind: "test.free", id: "persona", payload: { format: "json", data: { name: "架空", likes: ["a", "b"] } } },
      { kind: "test.free", id: "domain-graph", payload: { format: "graph", data: { nodes: [{ id: "n1" }], edges: [{ from: "n1", to: "n1" }] } } },
      { kind: "test.free", id: "table", payload: { format: "csv", data: "name,value\ntorso,1.5\n" } },
      { kind: "test.free", id: "note", payload: { format: "text", data: "共有メモ 改行\nあり" } },
    ];
    const pushed = await client.push(samples.map((s) => ({ ...s, baseRev: 0 })));
    assert.deepEqual(pushed.results.map((r) => r.status), ["committed", "committed", "committed", "committed"]);
    // push の戻りで採番 rev を受領
    assert.deepEqual(pushed.results.map((r) => r.rev), [1, 2, 3, 4]);

    const pulled = await client.pull(0);
    assert.equal(pulled.records.length, 4);
    for (let i = 0; i < samples.length; i++) {
      assert.deepEqual(pulled.records[i].payload, samples[i].payload, `payload 往復不一致: ${samples[i].id}`);
      assert.equal(pulled.records[i].author, AUTHOR);
      assert.ok(pulled.records[i].ts);
      assert.match(pulled.records[i].hash, /^sha256:/);
    }
    // 差分 pull: since=headRev で空
    assert.equal((await client.pull(pulled.headRev)).records.length, 0);
  });

  it("records は head のみ返す", async () => {
    await client.push([{ kind: "test.free", id: "note", baseRev: 4, payload: { format: "text", data: "v2" } }]);
    const heads = await client.records("test.");
    const note = heads.records.find((r) => r.id === "note");
    assert.equal(note.payload.data, "v2");
    assert.equal(heads.records.length, 4);
  });

  it("レスポンス表示行 (render_model) が各 status を人が読める形にする", async () => {
    const pushLines = pushResponseLines({
      headRev: 9,
      results: [
        { kind: "t.k", id: "a", status: "committed", rev: 9 },
        { kind: "t.k", id: "b", status: "rejected-sensitive", category: "email", reason: "遮断" },
        { kind: "t.k", id: "c", status: "conflict", conflictId: "c-1", reason: "undecidable" },
      ],
    });
    assert.equal(pushLines[0].level, "ok");
    assert.match(pushLines[0].text, /rev 9/);
    assert.equal(pushLines[1].level, "error");
    assert.match(pushLines[1].text, /遮断/);
    assert.equal(pushLines[2].level, "error");
    assert.match(pushLines[2].text, /c-1/);

    const pullLines = pullResponseLines({ headRev: 2, records: [{ rev: 2, kind: "t.k", id: "a", author: AUTHOR, payload: { format: "json" } }] }, 0);
    assert.match(pullLines[0].text, /1 件/);
    assert.equal(conflictLines([{ conflictId: "c-9", kind: "t", id: "i", baseRev: 1, headRev: 2, reason: "x" }])[0].level, "error");
  });

  it("author 未登録 / 接続不能はエラーとして観測できる", async () => {
    const stranger = new DatahubClient({
      baseUrl: `http://127.0.0.1:${port}`,
      author: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    });
    await assert.rejects(
      () => stranger.push([{ kind: "test.free", id: "x", baseRev: 0, payload: { format: "text", data: "y" } }]),
      /unknown-author|未登録/,
    );
    const offline = new DatahubClient({ baseUrl: "http://127.0.0.1:9", author: AUTHOR });
    await assert.rejects(() => offline.health(), /接続できません/);
  });
});
