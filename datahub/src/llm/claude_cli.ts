/**
 * llm/claude_cli — claude CLI (`claude -p`) の検出と JSON 応答実行。
 * LUDIARS 方針: LLM は claude CLI 経由・API キー不使用。プロンプトは stdin 渡し
 * (引数渡しの quoting / インジェクションを避ける)。不在は null を返し、呼び出し側が
 * reject / pending として観測可能に扱う (無言スタブへのフォールバック禁止)。
 */
import { spawnSync } from "node:child_process";
import { spawnOneShot as spawn } from "@ludiars/one-shot";

export interface ClaudeCli {
  cmd: string;
}

/**
 * claude CLI を検出する。FUNDAMENTUM_DATAHUB_LLM=0 で明示無効化
 * (テスト / CI 用。health の llm:false として観測される)。
 */
export function detectClaudeCli(): ClaudeCli | null {
  if (process.env.FUNDAMENTUM_DATAHUB_LLM === "0") return null;
  const candidates = process.env.FUNDAMENTUM_DATAHUB_CLAUDE
    ? [process.env.FUNDAMENTUM_DATAHUB_CLAUDE]
    : ["claude", "claude.cmd", "claude.exe"];
  for (const cmd of candidates) {
    try {
      const probe = spawnSync(cmd, ["--version"], { timeout: 20000, windowsHide: true });
      if (probe.status === 0) return { cmd };
    } catch {
      // 候補コマンド不在 (ENOENT 等) は次の候補を試す
    }
  }
  return null;
}

export interface ClaudeJsonRequest {
  model: string;
  prompt: string;
  timeoutMs: number;
}

/** claude -p を実行し、応答から最初の JSON オブジェクトを厳格に取り出す */
export function runClaudeJson(cli: ClaudeCli, req: ClaudeJsonRequest): Promise<unknown> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cli.cmd, ["-p", "--model", req.model], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      rejectPromise(new Error(`[claude-cli] timeout ${req.timeoutMs}ms (model=${req.model})`));
    }, req.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")));
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(`[claude-cli] spawn 失敗: ${err.message}`));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        rejectPromise(
          new Error(`[claude-cli] exit ${code}: ${stderr.slice(0, 500) || "(stderr なし)"}`),
        );
        return;
      }
      try {
        resolvePromise(extractJson(stdout));
      } catch (e) {
        rejectPromise(e as Error);
      }
    });

    child.stdin.write(req.prompt, "utf8");
    child.stdin.end();
  });
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // 前置き付き応答から最初の {...} ブロックを取り出す
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`[claude-cli] 応答に JSON がありません: ${trimmed.slice(0, 200)}`);
  }
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch (e) {
    throw new Error(`[claude-cli] 応答 JSON の parse に失敗: ${(e as Error).message}`);
  }
}
