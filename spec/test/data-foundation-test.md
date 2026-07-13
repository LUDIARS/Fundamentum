# test/data-foundation-test — データ管理基盤 テスト計画

ランナー: node:test (`datahub/tests/`, `packages/datahub-kit/tests/`)。
LLM 判定・検査はスタブ注入 (明示注入のみ / 自動フォールバックではない)。
実 claude -p 経路は CI 外の手動裏取り手順 (§実経路) で担保する。

## ユニット

| 対象 | ケース |
|---|---|
| store/revlog | 追記→リプレイ往復一致 / rev 欠番・逆順は起動 fail-fast / 空ファイル |
| store/store | 採番の単調増加 / 同一 payload → unchanged / pullSince 境界 (since=0, =head) / kind 前方一致 / heads |
| store/authors | upsert / 未登録 author push 拒否 / firstSeen 保持 |
| conflict/superset | 上位集合 (キー追加) → 判定 / 相互に異なる → 不成立 / 配列・ネスト / text 系 (前方一致包含) |
| conflict/resolver | baseRev=head → 素通し / 古い baseRev + superset → 自動解決 + conflicts.jsonl / LLM winner=incoming・current / undecidable → pending / LLM 不能 → pending (理由付き) |
| sensitive/rules | seed ルールで電話/メール検知 / disable 行で無効化 / learned 追記後は決定層で reject |
| sensitive/screen | 検査 OFF kind は素通し / 既定 (未宣言 kind) は検査 ON / LLM reject → learnedPatterns がルールへ成長 / reject レスポンスに検知値が含まれない (redact 検証) / LLM 不在 → rejected-sensitive |
| backup | 手動バックアップの内容一致 / retention 超過 sweep / タイマー注入で定期発火 |
| kit/render_model | 各 status → 表示行 / エラー表示 / rev 割り当て反映 |

## サーバ e2e (ephemeral port, プロセス内起動)

1. health → authors 登録 → push (新規) → **戻り rev をクライアントが受領**
2. 2 クライアント: A push → B pull?since=0 → B が A の差分を受領 → B push (baseRev 最新) → A pull
3. コンフリクト: A/B 同一レコードを別内容で push → スタブ judge で自動解決 + ログ行検証
4. pending → GET /v1/conflicts → POST /v1/conflicts/resolve → 新 rev
5. rejected-sensitive (スタブ検査) → sensitive.jsonl redact 検証
6. /v1/log に操作履歴が載る / /v1/backup → /v1/backups
7. 再起動リプレイ: サーバ停止 → 再構築 → headRev / heads 一致

## kit データテスト (Fm 用・パッケージ同梱)

実サーバをプロセス内起動し、client.mjs で
ペルソナ様 JSON / ドメイン graph / csv / text の
push→pull 往復・payload 完全一致を検証 (組み込み先での自己診断にも使える形)。

## 実経路裏取り (手動・PR 前)

- claude -p 実走: conflict judge (sonnet) + sensitive screen (haiku) を実データで
  1 回ずつ — 判定 JSON が契約どおりパースできること。
- CLI smoke: `datahub serve` (テストポート) → `push`/`pull`/curl health。
  実施前に Concordia claim / 終了後 release (`cc-test`)。
- CI: Windows + Ubuntu で datahub job (build + 全テスト)。
