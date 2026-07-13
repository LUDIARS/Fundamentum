/**
 * sensitive/llm_check — センシティブ検査の LLM 層 (Haiku)。
 * 検査関数はインタフェース (SensitiveChecker) で注入可能。本番配線は
 * makeClaudeSensitiveChecker (claude -p --model haiku)。
 * 応答の reason には検知値を引用させない (ブラックボックス / redact 原則)。
 */
import { type ClaudeCli, runClaudeJson } from "../llm/claude_cli.js";

export interface SensitiveCheckInput {
  kind: string;
  id: string;
  /** payloadText() 済みテキスト (maxCheckBytes へ切り詰めは呼び出し側) */
  text: string;
}

export interface SensitiveVerdict {
  verdict: "allow" | "reject";
  category?: string;
  reason?: string;
  learnedPatterns?: Array<{ category: string; pattern: string }>;
}

export type SensitiveChecker = (input: SensitiveCheckInput) => Promise<SensitiveVerdict>;

export function makeClaudeSensitiveChecker(
  cli: ClaudeCli,
  model: string,
  timeoutMs: number,
): SensitiveChecker {
  return async (input) => {
    const raw = await runClaudeJson(cli, { model, prompt: buildPrompt(input), timeoutMs });
    return parseVerdict(raw);
  };
}

function buildPrompt(input: SensitiveCheckInput): string {
  return [
    "あなたは制作チームの共有データ hub の push 時スクリーニング器 (ブラックボックス検査) です。",
    "以下のデータに「個人のセンシティブな情報」が含まれるか判定してください。",
    "",
    "reject すべきもの: 実在個人の連絡先 (メール/電話/住所)、政府発行番号、決済情報、",
    "認証情報 (パスワード/トークン/秘密鍵)、実在個人の健康・信条等の機微情報、",
    "実在人物の私的情報 (声優・スタッフの個人情報を含む)。",
    "allow すべきもの: ゲーム制作用の共有データ — 架空キャラクターのペルソナ設定、",
    "ゲーム内ボイス台本、ドメイン知識グラフ、ワークツリー/パラメータ/座標などの技術データ。",
    "",
    `kind=${input.kind} id=${input.id}`,
    "=== データ ===",
    input.text,
    "=== ここまで ===",
    "",
    "厳守: reason に検知した値そのもの (メールアドレスや番号など) を引用しないこと。",
    "learnedPatterns には、reject 時のみ、同種データを機械検知できる一般化した",
    "JavaScript 正規表現を 0〜3 個返してよい (値そのものではなく形式のパターン)。",
    "出力は次の JSON オブジェクト 1 個のみ (説明文・コードフェンス禁止):",
    '{"verdict": "allow" | "reject", "category": "...", "reason": "...", "learnedPatterns": [{"category": "...", "pattern": "..."}]}',
  ].join("\n");
}

function parseVerdict(raw: unknown): SensitiveVerdict {
  const v = raw as Partial<SensitiveVerdict>;
  if (v.verdict !== "allow" && v.verdict !== "reject") {
    throw new Error(`[sensitive-check] 判定 JSON が契約外です: ${JSON.stringify(raw).slice(0, 200)}`);
  }
  return {
    verdict: v.verdict,
    ...(typeof v.category === "string" ? { category: v.category } : {}),
    ...(typeof v.reason === "string" ? { reason: v.reason } : {}),
    ...(Array.isArray(v.learnedPatterns) ? { learnedPatterns: v.learnedPatterns } : {}),
  };
}
