/**
 * backup/backup — store ディレクトリの定期 + 手動バックアップと retention sweep。
 * append-only JSONL のみを対象とするため単純コピーで安全。タイマー / 時刻は注入可能。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TARGET_FILES = [
  "revlog.jsonl",
  "authors.jsonl",
  "conflicts.jsonl",
  "sensitive-rules.jsonl",
  "sensitive.jsonl",
  "oplog.jsonl",
] as const;

export interface BackupMeta {
  ts: string;
  headRev: number;
  records: number;
  bytes: number;
}

export interface BackupInfo extends BackupMeta {
  dir: string;
}

export interface BackupManagerOptions {
  dataDir: string;
  retention: number;
  clock: () => Date;
  /** バックアップ時点の headRev / record 数の提供元 (Store) */
  stats: () => { headRev: number; records: number };
}

export class BackupManager {
  private readonly backupsDir: string;

  constructor(private readonly opts: BackupManagerOptions) {
    this.backupsDir = join(opts.dataDir, "backups");
  }

  /** 即時バックアップ。作成ディレクトリ情報を返す */
  run(): BackupInfo {
    const ts = this.opts.clock().toISOString();
    const dirName = ts.replace(/:/g, "-"); // Windows パス互換
    const dir = join(this.backupsDir, dirName);
    mkdirSync(dir, { recursive: true });

    let bytes = 0;
    for (const name of TARGET_FILES) {
      const src = join(this.opts.dataDir, name);
      if (!existsSync(src)) continue;
      copyFileSync(src, join(dir, name));
      bytes += statSync(src).size;
    }
    const { headRev, records } = this.opts.stats();
    const meta: BackupMeta = { ts, headRev, records, bytes };
    writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    this.sweep();
    return { dir, ...meta };
  }

  /** 保持数を超えた古いバックアップを削除 (ディレクトリ名 = ISO 時刻順) */
  private sweep(): void {
    const dirs = this.listDirs();
    const excess = dirs.length - this.opts.retention;
    for (let i = 0; i < excess; i++) {
      const dir = dirs[i];
      if (dir) rmSync(join(this.backupsDir, dir), { recursive: true, force: true });
    }
  }

  list(): BackupInfo[] {
    return this.listDirs().map((name) => {
      const dir = join(this.backupsDir, name);
      const metaPath = join(dir, "meta.json");
      let meta: BackupMeta = { ts: name, headRev: -1, records: -1, bytes: -1 };
      if (existsSync(metaPath)) {
        try {
          meta = JSON.parse(readFileSync(metaPath, "utf8")) as BackupMeta;
        } catch (e) {
          console.warn(`[datahub/backup] meta.json 読込失敗 (${dir}):`, e);
        }
      }
      return { dir, ...meta };
    });
  }

  private listDirs(): string[] {
    if (!existsSync(this.backupsDir)) return [];
    return readdirSync(this.backupsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }

  /**
   * 定期実行を開始し、停止関数を返す。setInterval は注入可能 (テスト決定性)。
   * 失敗は観測可能に error ログし、次周期で再試行する (hub 本体は止めない)。
   */
  start(
    intervalMs: number,
    setIntervalFn: (fn: () => void, ms: number) => NodeJS.Timeout = setInterval,
  ): () => void {
    const timer = setIntervalFn(() => {
      try {
        const info = this.run();
        console.log(`[datahub/backup] 定期バックアップ完了: ${info.dir} (headRev=${info.headRev})`);
      } catch (e) {
        console.error("[datahub/backup] 定期バックアップ失敗 (次周期で再試行):", e);
      }
    }, intervalMs);
    timer.unref?.();
    return () => clearInterval(timer);
  }
}
