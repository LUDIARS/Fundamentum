/**
 * config — 設定 loader。既定値はリポジトリ管理下の config/datahub.json (HARNESS §1)、
 * env は上書きのみ。相対 dataDir は repo root 基準で決定的に解決する (cwd 非依存)。
 * ポートの正本は Excubitor catalog (`fundamentum-datahub`) — ここは fallback 既定。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface KindConfig {
  sensitiveCheck?: boolean;
}

export interface DatahubConfig {
  port: number;
  /** 絶対パスへ解決済み */
  dataDir: string;
  maxPayloadBytes: number;
  backup: { intervalMinutes: number; retention: number };
  llm: {
    conflictModel: string;
    sensitiveModel: string;
    timeoutMs: number;
    maxCheckBytes: number;
  };
  kinds: Record<string, KindConfig>;
}

/** datahub パッケージ root (dist/src/config.js から 2 段上) */
export function packageRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

/** Fundamentum リポジトリ root */
export function repoRoot(): string {
  return resolve(packageRoot(), "..");
}

export function defaultConfigPath(): string {
  return join(packageRoot(), "config", "datahub.json");
}

export function loadConfig(overrides: Partial<DatahubConfig> = {}): DatahubConfig {
  const path = process.env.FUNDAMENTUM_DATAHUB_CONFIG ?? defaultConfigPath();
  if (!existsSync(path)) throw new Error(`[config] 設定ファイルがありません: ${path}`);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`[config] ${path} の parse に失敗: ${(e as Error).message}`);
  }

  const merged = { ...raw, ...overrides } as DatahubConfig & { dataDir: string };
  const envPort = process.env.FUNDAMENTUM_DATAHUB_PORT;
  if (envPort !== undefined && overrides.port === undefined) merged.port = Number(envPort);
  const envDir = process.env.FUNDAMENTUM_DATAHUB_DIR;
  if (envDir !== undefined && overrides.dataDir === undefined) merged.dataDir = envDir;

  const config: DatahubConfig = {
    ...merged,
    dataDir: isAbsolute(merged.dataDir) ? merged.dataDir : join(repoRoot(), merged.dataDir),
  };
  validate(config, path);
  return config;
}

function validate(c: DatahubConfig, source: string): void {
  const fail = (msg: string): never => {
    throw new Error(`[config] ${source}: ${msg}`);
  };
  if (!Number.isInteger(c.port) || c.port < 0 || c.port > 65535) fail(`port 不正: ${c.port}`);
  if (!c.dataDir) fail("dataDir が空です");
  if (!Number.isInteger(c.maxPayloadBytes) || c.maxPayloadBytes <= 0) fail("maxPayloadBytes 不正");
  if (!c.backup || c.backup.intervalMinutes <= 0 || c.backup.retention <= 0) fail("backup 設定不正");
  if (!c.llm?.conflictModel || !c.llm?.sensitiveModel) fail("llm モデル設定不正");
  if (!Number.isInteger(c.llm.timeoutMs) || c.llm.timeoutMs <= 0) fail("llm.timeoutMs 不正");
  if (!Number.isInteger(c.llm.maxCheckBytes) || c.llm.maxCheckBytes <= 0)
    fail("llm.maxCheckBytes 不正");
  if (c.kinds === null || typeof c.kinds !== "object") fail("kinds 設定不正");
}
