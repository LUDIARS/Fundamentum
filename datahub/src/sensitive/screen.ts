/**
 * sensitive/screen — push 時センシティブ検査の入口。
 * kind 設定 (既定 ON / 明示 OFF のみスキップ) → ①決定的ルール層 → ②LLM 層 (Haiku)。
 * reject は sensitive.jsonl へ redact 済みで記録し、LLM の learnedPatterns で
 * ルール層を成長させる。LLM 不在時の検査対象 kind は reject (無言スキップ禁止)。
 */
import { join } from "node:path";
import { appendJsonl } from "../util/jsonl.js";
import { payloadText, type Payload } from "../store/record.js";
import type { KindConfig } from "../config.js";
import type { SensitiveRules } from "./rules.js";
import type { SensitiveChecker } from "./llm_check.js";

export interface ScreenInput {
  kind: string;
  id: string;
  author: string;
  payload: Payload;
}

export type ScreenResult =
  | { ok: true }
  | { ok: false; category: string; reason: string };

export class SensitiveScreen {
  private readonly logFile: string;

  constructor(
    private readonly deps: {
      rules: SensitiveRules;
      checker: SensitiveChecker | null;
      kinds: Record<string, KindConfig>;
      dataDir: string;
      maxCheckBytes: number;
      clock: () => Date;
    },
  ) {
    this.logFile = join(deps.dataDir, "sensitive.jsonl");
  }

  /** kind が検査対象か (未宣言 kind は fail-safe で ON) */
  isCheckEnabled(kind: string): boolean {
    return this.deps.kinds[kind]?.sensitiveCheck !== false;
  }

  async screen(input: ScreenInput): Promise<ScreenResult> {
    if (!this.isCheckEnabled(input.kind)) return { ok: true };

    const fullText = payloadText(input.payload);
    const text =
      fullText.length > this.deps.maxCheckBytes
        ? fullText.slice(0, this.deps.maxCheckBytes)
        : fullText;

    const ruleHit = this.deps.rules.match(text);
    if (ruleHit) {
      return this.reject(input, {
        layer: "rules",
        category: ruleHit.category,
        ruleId: ruleHit.ruleId,
        reason: `決定的ルール (${ruleHit.category}) に該当`,
      });
    }

    if (!this.deps.checker) {
      return this.reject(input, {
        layer: "llm",
        category: "llm-unavailable",
        reason: "検査 LLM (claude CLI) が利用できないため、検査対象 kind の push を拒否",
      });
    }

    let verdict;
    try {
      verdict = await this.deps.checker({ kind: input.kind, id: input.id, text });
    } catch (e) {
      console.error(`[datahub/sensitive] LLM 検査失敗 (${input.kind}/${input.id}):`, e);
      return this.reject(input, {
        layer: "llm",
        category: "llm-error",
        reason: `検査 LLM の実行に失敗したため拒否: ${(e as Error).message.slice(0, 160)}`,
      });
    }

    if (verdict.verdict === "reject") {
      const learned = verdict.learnedPatterns?.length
        ? this.deps.rules.learn(verdict.learnedPatterns)
        : 0;
      return this.reject(input, {
        layer: "llm",
        category: verdict.category ?? "sensitive",
        reason: verdict.reason ?? "センシティブ判定",
        learned,
      });
    }
    return { ok: true };
  }

  private reject(
    input: ScreenInput,
    detail: { layer: "rules" | "llm"; category: string; reason: string; ruleId?: string; learned?: number },
  ): ScreenResult {
    // redact 原則: payload・検知値は記録しない (kind/id/author/カテゴリ/短い理由のみ)
    appendJsonl(this.logFile, {
      kind: input.kind,
      id: input.id,
      author: input.author,
      verdict: "reject",
      layer: detail.layer,
      category: detail.category,
      ...(detail.ruleId ? { ruleId: detail.ruleId } : {}),
      ...(detail.learned !== undefined ? { learned: detail.learned } : {}),
      reason: detail.reason,
      ts: this.deps.clock().toISOString(),
    });
    return { ok: false, category: detail.category, reason: detail.reason };
  }
}
