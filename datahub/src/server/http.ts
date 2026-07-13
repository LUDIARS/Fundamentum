/**
 * server/http — datahub の組み立てと HTTP サーバ。
 * 全依存 (LLM 判定 / 検査 / clock / timer) はここで配線し、テストは overrides で
 * スタブを明示注入する (自動フォールバックではなく組み立て時の選択)。
 */
import { createServer, type Server } from "node:http";
import { mkdirSync } from "node:fs";
import { loadConfig, repoRoot, type DatahubConfig } from "../config.js";
import { detectClaudeCli } from "../llm/claude_cli.js";
import { Store } from "../store/store.js";
import { AuthorRegistry } from "../store/authors.js";
import { OpLog } from "../store/oplog.js";
import { ConflictLog } from "../conflict/conflict_log.js";
import { ConflictResolver } from "../conflict/resolver.js";
import { makeClaudeConflictJudge, type ConflictJudge } from "../conflict/llm_judge.js";
import { SensitiveRules } from "../sensitive/rules.js";
import { SensitiveScreen } from "../sensitive/screen.js";
import { makeClaudeSensitiveChecker, type SensitiveChecker } from "../sensitive/llm_check.js";
import { BackupManager } from "../backup/backup.js";
import { PushHandler } from "./push_handler.js";
import { handleApi, type RouteDeps } from "./routes.js";
import { StaticUi } from "./static_ui.js";
import { vgWrite } from "../obs/vestigium.js";

export interface DatahubOverrides {
  config?: Partial<DatahubConfig>;
  /** テスト用: LLM 判定 / 検査のスタブ注入。undefined = claude CLI から配線 */
  judge?: ConflictJudge | null;
  checker?: SensitiveChecker | null;
  clock?: () => Date;
  setIntervalFn?: (fn: () => void, ms: number) => NodeJS.Timeout;
  /** 定期バックアップを起動するか (serve のみ true) */
  periodicBackup?: boolean;
}

export interface Datahub {
  server: Server;
  config: DatahubConfig;
  store: Store;
  authors: AuthorRegistry;
  conflictLog: ConflictLog;
  backup: BackupManager;
  llmStatus: { conflict: boolean; sensitive: boolean };
  listen(port?: number): Promise<number>;
  close(): Promise<void>;
}

export function createDatahub(overrides: DatahubOverrides = {}): Datahub {
  const config = loadConfig(overrides.config ?? {});
  mkdirSync(config.dataDir, { recursive: true });
  const clock = overrides.clock ?? (() => new Date());

  const store = Store.open(config.dataDir, clock);
  const authors = AuthorRegistry.open(config.dataDir, clock);
  const oplog = OpLog.open(config.dataDir, clock);
  const conflictLog = ConflictLog.open(config.dataDir, clock);
  const rules = SensitiveRules.open(config.dataDir, clock);

  // LLM 配線: overrides に明示指定があればそれを使う (テスト)。なければ claude CLI 検出。
  let judge: ConflictJudge | null;
  let checker: SensitiveChecker | null;
  if (overrides.judge !== undefined || overrides.checker !== undefined) {
    judge = overrides.judge ?? null;
    checker = overrides.checker ?? null;
  } else {
    const cli = detectClaudeCli();
    if (cli) {
      judge = makeClaudeConflictJudge(cli, config.llm.conflictModel, config.llm.timeoutMs);
      checker = makeClaudeSensitiveChecker(cli, config.llm.sensitiveModel, config.llm.timeoutMs);
      console.log(`[datahub] claude CLI 検出: ${cli.cmd} (conflict=${config.llm.conflictModel}, sensitive=${config.llm.sensitiveModel})`);
    } else {
      judge = null;
      checker = null;
      // 無言スキップ禁止: 不在は起動時に明示し、実行時は pending / reject として現れる
      console.warn(
        "[datahub] claude CLI が見つかりません。コンフリクト自動解決は pending、検査対象 kind の push は reject になります",
      );
    }
  }

  const resolver = new ConflictResolver(judge, conflictLog);
  const screen = new SensitiveScreen({
    rules,
    checker,
    kinds: config.kinds,
    dataDir: config.dataDir,
    maxCheckBytes: config.llm.maxCheckBytes,
    clock,
  });
  const backup = new BackupManager({
    dataDir: config.dataDir,
    retention: config.backup.retention,
    clock,
    stats: () => ({ headRev: store.headRev, records: store.recordCount }),
  });
  const pushHandler = new PushHandler({
    store,
    authors,
    resolver,
    screen,
    oplog,
    maxPayloadBytes: config.maxPayloadBytes,
    clock,
  });

  const llmStatus = { conflict: judge !== null, sensitive: checker !== null };
  const routeDeps: RouteDeps = {
    store,
    authors,
    oplog,
    conflictLog,
    backup,
    pushHandler,
    llmStatus,
    // items 配列ぶんの余裕 (payload 上限の 4 倍 + 64KB)
    maxBodyBytes: config.maxPayloadBytes * 4 + 65536,
  };
  const staticUi = new StaticUi(repoRoot());

  const server = createServer((req, res) => {
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const urlPath = new URL(req.url ?? "/", "http://localhost").pathname;
    if (staticUi.serve(urlPath, res)) return;
    void handleApi(routeDeps, req, res).then((handled) => {
      if (!handled) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ error: { code: "not-found", message: urlPath } }));
      }
    });
  });

  let stopBackup: (() => void) | null = null;
  if (overrides.periodicBackup) {
    stopBackup = backup.start(
      config.backup.intervalMinutes * 60_000,
      overrides.setIntervalFn ?? setInterval,
    );
  }

  return {
    server,
    config,
    store,
    authors,
    conflictLog,
    backup,
    llmStatus,
    listen(port?: number): Promise<number> {
      return new Promise((resolvePromise, rejectPromise) => {
        server.once("error", rejectPromise);
        server.listen(port ?? config.port, "127.0.0.1", () => {
          const addr = server.address();
          const bound = typeof addr === "object" && addr ? addr.port : config.port;
          vgWrite("info", "datahub listening", { port: bound });
          resolvePromise(bound);
        });
      });
    },
    close(): Promise<void> {
      stopBackup?.();
      return new Promise((resolvePromise) => server.close(() => resolvePromise()));
    },
  };
}
