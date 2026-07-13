/**
 * conflict/llm_judge — コンフリクトの LLM 判定 (第 2 層)。
 * 判定関数はインタフェース (ConflictJudge) で注入可能 — テストはスタブを明示注入し、
 * 本番配線は makeClaudeConflictJudge (claude -p) を使う。
 */
import { type ClaudeCli, runClaudeJson } from "../llm/claude_cli.js";
import { payloadText, type Payload } from "../store/record.js";

export interface ConflictJudgeInput {
  kind: string;
  id: string;
  current: { rev: number; author: string; payload: Payload };
  incoming: { author: string; payload: Payload };
}

export interface ConflictVerdict {
  winner: "current" | "incoming" | "undecidable";
  reason: string;
}

export type ConflictJudge = (input: ConflictJudgeInput) => Promise<ConflictVerdict>;

const EXCERPT_BYTES = 8192;

export function makeClaudeConflictJudge(
  cli: ClaudeCli,
  model: string,
  timeoutMs: number,
): ConflictJudge {
  return async (input) => {
    const prompt = buildPrompt(input);
    const raw = await runClaudeJson(cli, { model, prompt, timeoutMs });
    return parseVerdict(raw);
  };
}

function excerpt(payload: Payload): string {
  const text = payloadText(payload);
  if (text.length <= EXCERPT_BYTES) return text;
  return `${text.slice(0, EXCERPT_BYTES)}\n...(truncated ${text.length - EXCERPT_BYTES} chars)`;
}

function buildPrompt(input: ConflictJudgeInput): string {
  return [
    "あなたは共有データ hub のコンフリクト判定器です。",
    `レコード (kind=${input.kind}, id=${input.id}) に対して、既存データ (current, rev=${input.current.rev}) と`,
    "新規 push (incoming) が競合しています。",
    "",
    "判定基準: 機械的に「情報量が多い側」(相手側の情報を実質すべて包含し、追加・詳細化のみ",
    "している側) が明確に存在する場合のみ、その側を winner としてください。",
    "双方が相手に無い情報を持つ / 同一情報の書き換えで優劣不明 → undecidable。",
    "",
    "=== current ===",
    excerpt(input.current.payload),
    "",
    "=== incoming ===",
    excerpt(input.incoming.payload),
    "",
    "出力は次の JSON オブジェクト 1 個のみ (説明文・コードフェンス禁止):",
    '{"winner": "current" | "incoming" | "undecidable", "reason": "日本語で 1-2 文"}',
  ].join("\n");
}

function parseVerdict(raw: unknown): ConflictVerdict {
  const v = raw as Partial<ConflictVerdict>;
  if (
    (v.winner === "current" || v.winner === "incoming" || v.winner === "undecidable") &&
    typeof v.reason === "string"
  ) {
    return { winner: v.winner, reason: v.reason };
  }
  throw new Error(`[conflict-judge] 判定 JSON が契約外です: ${JSON.stringify(raw).slice(0, 200)}`);
}
