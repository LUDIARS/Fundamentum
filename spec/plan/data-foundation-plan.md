# plan/data-foundation-plan — データ管理基盤 実装計画 (設計→実装 2 フェーズ)

発注: neco (2026-07-13)。進め方の指示: **設計フェーズ → 実装フェーズ**。
本書 + `feature/data-foundation.md` + `interface/datahub-api.md` +
`data/datahub-store.md` + `test/data-foundation-test.md` が設計フェーズの成果物。

> 経緯: 当初 Figmentum (Fg) 宛てで設計承認 → 実装後に対象リポの訂正指示があり
> **Fundamentum (Fm)** へ移植 (2026-07-13)。設計内容は同一、命名と組み込み先
> (エディタ → 同梱テストコンソール) のみ変更。

## 第 I 部宣言 (RULE_CODE)

- **採用アーキ / スタック**: 常駐 Web サービス = TypeScript (LUDIARS 既定どおり /
  RULE_TECH_STACK 逸脱なし)。node:http + 依存ゼロ (ランタイム依存は vendored
  `@ludiars/vestigium` submodule のみ)。ストレージは append-only JSONL
  (DB サーバ不使用 — 単一 hub・低頻度書き込みのため。理由は data spec)。
  UI パッケージは framework-less custom element (組み込み先を選ばないため)。
  既存 Fm ライブラリ (`src/`, 依存ゼロ・vitest) には手を入れず、hub は自己完結の
  別パッケージ `datahub/` として同居 (lib の zero-dep を保つ)。hub のテストは
  node:test (hub 自体が依存ゼロのため vitest を持ち込まない)。
- **目的と重視点**: (1) 全員の更新差分の共有配布を最短経路で成立させる
  (2) センシティブデータを構造的に遮断する (fail-safe 既定 ON)
  (3) レスポンス (採番 rev / 解決結果) の可視性 — UI パッケージで即時表示。
- **設計判断**:
  - リビジョン = hub 全体単調増加 (SVN 型)。差分配布 (`pull?since=N`) が
    自明になり、per-key vector clock の複雑さを避ける。
  - コンフリクトは「決定的スーパーセット判定 → LLM (claude -p) → pending」。
    LLM 判定は関数注入 (テスト決定性 / RULE_CODE §16)。
  - センシティブ検査は「決定的ルール層 (成長) → Haiku」の 2 層。
    reject 時の learnedPatterns 追記で成長させる。
  - Author = PC UUIDv4 (指示による。Cernere 認証は非対象と明記)。
  - LLM は claude CLI (`claude -p [--model haiku]`)。API キー不使用・
    不在時は無言スキップせず reject / pending (無言フォールバック禁止)。

## 実装フェーズ タスク分解 (フルセット / No-MVP)

### datahub サーバ (`datahub/`)

1. `src/config.ts` — 設定 loader (ファイル既定 + env 上書き / fail-fast 検証)
2. `src/store/record.ts` — 型と正規化 hash
3. `src/store/revlog.ts` — append-only JSONL reader/writer (欠番検証)
4. `src/store/store.ts` — head index / commit 直列化 / pullSince / heads
5. `src/store/authors.ts` — author 台帳
6. `src/conflict/superset.ts` — 決定的スーパーセット判定
7. `src/conflict/llm_judge.ts` — claude -p 判定 (JSON 厳格パース / timeout)
8. `src/conflict/resolver.ts` — 判定パイプライン + conflicts.jsonl + pending
9. `src/sensitive/rules.ts` — 成長型ルール層 (seed + learned + disable)
10. `src/sensitive/llm_check.ts` — Haiku 検査 (redact 応答)
11. `src/sensitive/screen.ts` — kind 判定 + 2 層検査 + sensitive.jsonl
12. `src/backup/backup.ts` — 定期 + 手動バックアップ / retention (timer 注入)
13. `src/server/routes.ts` / `src/server/http.ts` — API 配線 (interface spec 準拠)
14. `src/obs/vestigium.ts` — Vg ログ (Anatomia パターン踏襲)
15. `src/cli.ts` — `serve` / `push <file>` / `pull` / `author` (ファイル push 用)
16. author UUID ローカル保存 (`src/author_identity.ts`, OS 状態 dir / env 上書き)

### UI パッケージ (`packages/datahub-kit/`)

17. `src/client.mjs` — fetch クライアント (ブラウザ/Node 両用・依存ゼロ)
18. `src/render_model.mjs` — レスポンス→表示行変換 (純関数・テスト対象)
19. `src/panel.mjs` — `<fg-datahub-panel>` (接続状態 / author 名編集 / push・pull
    実行 + レスポンス逐次表示 / 履歴 / conflicts 手動解決)
20. `config` (base URL 等) + `README.md` (組み込み手順) + データテスト
21. テストコンソール (`packages/datahub-kit/ui/index.html`) — hub の `/ui` 配信で push/pull 実例

### テスト / CI / 運用配線

22. `spec/test/data-foundation-test.md` のケースを node:test で実装
    (store / conflict / sensitive / backup / server e2e / kit)
23. CI (`.github/workflows/ci.yml`) に datahub job (node 22: build + test)
24. Excubitor catalog へ `fundamentum-datahub` (port 4220 / autostart false /
    health `/v1/health`) — **別リポ PR**
25. README.md / CLAUDE.md に datahub 節を追記
26. 実経路裏取り: claude -p 実走 (conflict judge + haiku screen)、CLI push/pull
    smoke (Concordia claim/release 下で実施)

## 完了条件 (DoD)

feature spec の 6 原則 + 検査が API 経由の実走で確認でき、テスト green、
Fundamentum 1 PR + Excubitor catalog PR がマージされ origin 実体で確認済み。
