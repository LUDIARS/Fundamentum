import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BackupManager } from "../src/backup/backup.js";
import { fixedClock, mkTmpDir } from "./helpers.js";

describe("backup/backup", () => {
  const tmp = mkTmpDir("backup");
  after(tmp.cleanup);

  function seedDataDir(dir: string): void {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "revlog.jsonl"), '{"rev":1}\n', "utf8");
    writeFileSync(join(dir, "authors.jsonl"), '{"author":"a"}\n', "utf8");
  }

  it("バックアップは対象ファイルのコピー + meta.json を作る", () => {
    const dir = join(tmp.dir, "run");
    seedDataDir(dir);
    const manager = new BackupManager({
      dataDir: dir,
      retention: 5,
      clock: fixedClock(),
      stats: () => ({ headRev: 1, records: 1 }),
    });
    const info = manager.run();
    assert.ok(existsSync(join(info.dir, "revlog.jsonl")));
    assert.equal(readFileSync(join(info.dir, "revlog.jsonl"), "utf8"), '{"rev":1}\n');
    const meta = JSON.parse(readFileSync(join(info.dir, "meta.json"), "utf8")) as { headRev: number };
    assert.equal(meta.headRev, 1);
    assert.equal(manager.list().length, 1);
    assert.equal(manager.list()[0]?.headRev, 1);
  });

  it("retention 超過分は古い順に削除される", () => {
    const dir = join(tmp.dir, "retention");
    seedDataDir(dir);
    const manager = new BackupManager({
      dataDir: dir,
      retention: 3,
      clock: fixedClock(),
      stats: () => ({ headRev: 0, records: 0 }),
    });
    for (let i = 0; i < 5; i++) manager.run();
    const dirs = readdirSync(join(dir, "backups")).sort();
    assert.equal(dirs.length, 3);
    // fixedClock は +1s 刻み: 最古 2 つ (00:00:00 / 00:00:01) が消えている
    assert.ok(dirs[0]?.includes("00-00-02"));
  });

  it("定期実行は注入タイマーで発火し、停止関数で止まる", () => {
    const dir = join(tmp.dir, "periodic");
    seedDataDir(dir);
    const manager = new BackupManager({
      dataDir: dir,
      retention: 10,
      clock: fixedClock(),
      stats: () => ({ headRev: 0, records: 0 }),
    });
    let scheduled: (() => void) | null = null;
    const stop = manager.start(60_000, (fn) => {
      scheduled = fn;
      return { unref() {} } as unknown as NodeJS.Timeout;
    });
    assert.ok(scheduled);
    (scheduled as unknown as () => void)();
    (scheduled as unknown as () => void)();
    assert.equal(manager.list().length, 2);
    stop();
  });
});
