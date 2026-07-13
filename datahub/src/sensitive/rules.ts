/**
 * sensitive/rules — 成長型検査の決定的ルール層。
 * seed ルール (コード定数) を初回に sensitive-rules.jsonl へ投入し、LLM の
 * learnedPatterns 追記で成長する。無効化は disable イベント行の追記 (append-only)。
 * 学習パターンは canary 検証 (無害データに反応しない) を通ったものだけ採用する。
 */
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { appendJsonl, readJsonl } from "../util/jsonl.js";

export interface SensitiveRule {
  ruleId: string;
  category: string;
  pattern: string;
  patternType: "regex";
  source: "seed" | "llm-learned" | "manual";
  ts: string;
}

interface DisableEvent {
  event: "disable";
  ruleId: string;
  ts: string;
}

type RuleLine = SensitiveRule | DisableEvent;

export interface RuleMatch {
  ruleId: string;
  category: string;
}

/** 無害な共有データの代表例。学習パターンがこれに反応したら採用しない */
const CANARIES = [
  '{"nodes":[{"id":"a"}],"edges":[]}',
  '{"blend":0.06,"joints":[[0,1,0]],"bones":[{"a":0,"b":1,"radius":0.14}]}',
  "name,value\ntorso,1.5\nhead,0.4",
  "smooth-union sphere(0.5) capsule(0.2)",
  "ゲーム用の共有パラメータ設定です",
];

const SEED_RULES: ReadonlyArray<Omit<SensitiveRule, "ruleId" | "ts">> = [
  {
    category: "email",
    pattern: "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}",
    patternType: "regex",
    source: "seed",
  },
  {
    category: "phone-jp",
    pattern: "(?:\\+81[- ]?|0)\\d{1,4}[- ]\\d{1,4}[- ]\\d{3,4}(?!\\d)",
    patternType: "regex",
    source: "seed",
  },
  {
    category: "postal-address-jp",
    pattern: "〒\\s?\\d{3}[-−]?\\d{4}",
    patternType: "regex",
    source: "seed",
  },
  {
    category: "my-number",
    pattern: "(?:マイナンバー|個人番号)\\D{0,8}\\d{12}",
    patternType: "regex",
    source: "seed",
  },
  {
    category: "credit-card",
    pattern: "\\b\\d{4}[- ]\\d{4}[- ]\\d{4}[- ]\\d{4}\\b",
    patternType: "regex",
    source: "seed",
  },
  {
    category: "credential",
    pattern: "(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})",
    patternType: "regex",
    source: "seed",
  },
  {
    category: "credential",
    pattern: "(?:\"|')?(?:password|passwd|secret)(?:\"|')?\\s*[:=]\\s*(?:\"|')[^\"']{4,}",
    patternType: "regex",
    source: "seed",
  },
  {
    category: "private-key",
    pattern: "-----BEGIN [A-Z ]*PRIVATE KEY-----",
    patternType: "regex",
    source: "seed",
  },
];

export class SensitiveRules {
  private active = new Map<string, { rule: SensitiveRule; regex: RegExp }>();

  private constructor(
    private readonly file: string,
    private readonly clock: () => Date,
  ) {}

  static open(dataDir: string, clock: () => Date): SensitiveRules {
    const rules = new SensitiveRules(join(dataDir, "sensitive-rules.jsonl"), clock);
    if (!existsSync(rules.file)) rules.seedInitial();
    for (const line of readJsonl<RuleLine>(rules.file)) {
      if ("event" in line && line.event === "disable") {
        rules.active.delete(line.ruleId);
        continue;
      }
      const rule = line as SensitiveRule;
      try {
        rules.active.set(rule.ruleId, { rule, regex: new RegExp(rule.pattern, "u") });
      } catch (e) {
        // 壊れた学習パターンで hub 全体を止めない。観測可能に warn して該当ルールのみ捨てる
        console.warn(`[datahub/sensitive] ルール ${rule.ruleId} の regex 不正 (無視):`, e);
      }
    }
    return rules;
  }

  private seedInitial(): void {
    for (const seed of SEED_RULES) {
      appendJsonl(this.file, {
        ...seed,
        ruleId: `r-${randomUUID()}`,
        ts: this.clock().toISOString(),
      } satisfies SensitiveRule);
    }
  }

  match(text: string): RuleMatch | null {
    for (const { rule, regex } of this.active.values()) {
      if (regex.test(text)) return { ruleId: rule.ruleId, category: rule.category };
    }
    return null;
  }

  /** LLM が返した一般化パターンを検証して追記する。採用件数を返す */
  learn(patterns: Array<{ category: string; pattern: string }>): number {
    let adopted = 0;
    for (const p of patterns) {
      if (typeof p?.pattern !== "string" || typeof p?.category !== "string") continue;
      if (p.pattern.length < 6 || p.pattern.length > 500) {
        console.warn(`[datahub/sensitive] 学習パターン却下 (長さ): ${p.pattern.slice(0, 80)}`);
        continue;
      }
      let regex: RegExp;
      try {
        regex = new RegExp(p.pattern, "u");
      } catch {
        console.warn(`[datahub/sensitive] 学習パターン却下 (regex 不正): ${p.pattern.slice(0, 80)}`);
        continue;
      }
      if (CANARIES.some((c) => regex.test(c))) {
        console.warn(`[datahub/sensitive] 学習パターン却下 (canary 誤検知): ${p.pattern.slice(0, 80)}`);
        continue;
      }
      const rule: SensitiveRule = {
        ruleId: `r-${randomUUID()}`,
        category: p.category,
        pattern: p.pattern,
        patternType: "regex",
        source: "llm-learned",
        ts: this.clock().toISOString(),
      };
      appendJsonl(this.file, rule);
      this.active.set(rule.ruleId, { rule, regex });
      adopted++;
    }
    return adopted;
  }

  get size(): number {
    return this.active.size;
  }
}
