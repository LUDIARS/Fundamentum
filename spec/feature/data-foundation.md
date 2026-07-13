# feature/data-foundation — Fundamentum データ管理基盤 (datahub)

## 背景 / 動機

LUDIARS の制作用共有データ (Discutere のゲーム声・ペルソナデータ / Anatomia の
ドメインデータ / Ars のゲームワークツリーデータ等) は各 PC のローカルに留まり、
複数人・複数 PC での共同作業時に **全員の更新差分を共有配布する**手段が無い。
そこで共通データ基盤 Fundamentum (Fm) に中央集権のデータ hub (`datahub`) を立て、
push / pull による差分共有を実現する。

既存の Fm 2 層 (MasterStore/Catalog/UserStore、`DESIGN.md`) が「1 プロセス内の
規定/上書きの持ち方」を担うのに対し、datahub は **PC を跨いだ共有配布層** を担う。
DESIGN.md §3 の「将来: org 共有 remote backend」に相当する最初の実体であり、
既存ライブラリ (`src/`, 依存ゼロ) には手を入れず、自己完結の別パッケージ
(`datahub/`) として同居させる (ストア統合は非対象参照)。

設計原則 (指示由来):

1. **全データがリビジョンと Author を持つ。**
2. Author は **PC ごとに UUIDv4** を割り当て、表示名は別台帳で突き合わせる
   (アカウント認証はしない)。
3. **中央集権管理**。リビジョンは datahub が自動採番し、push の戻りで
   自分が push したデータの確定リビジョンを受け取る。
4. 同一データへの競合更新 (コンフリクト) は **LLM で自動判断**し、機械的に
   情報量が多い側を採用できる場合は**自動解決してログを残す**。
5. データは**定期バックアップ**する。
6. この基盤でデータを管理する際に組み込む **package** を用意する:
   Fm 用のデータテスト + 設定 + push/pull を実行しレスポンスを表示できる
   UI パッケージ込み (`packages/datahub-kit`)。
7. 扱うのは**共有データのみ** (グラフ / CSV / JSON / テキスト)。個人の
   センシティブデータの共有は禁止し、該当可能性のある kind は push 時に
   Haiku による**成長型ブラックボックス検査**で遮断する。

## 全体像

```
[PC A] datahub-kit (UI パッケージ)  ─┐  push {author, items[{kind,id,baseRev,payload}]}
[PC B] 各サービスのアプリ + kit     ─┼────────────────→ [datahub :4220]
[PC C] datahub CLI (file push/pull)┘  ← 戻り: 採番された rev      │
                                                                  │ append-only
        pull?since=N ←──────────────── 差分 (rev>N の全コミット) ─┤ revlog.jsonl
                                                                  │
                                     コンフリクト → LLM(claude -p) 判定 → 自動解決 + conflicts.jsonl
                                     定期バックアップ → backups/<ts>/
```

- **datahub**: TypeScript / node:http の常駐サーバ (`datahub/`)。ポートの正本は
  Excubitor catalog (`fundamentum-datahub`, 4220)。起動・停止は Excubitor 経由。
- **記録単位**: レコード = `(kind, id)`。`kind` は名前空間付きデータ種別
  (例 `discutere.voice` / `discutere.persona` / `anatomia.domain` /
  `ars.worktree`)、`id` はデータ名。
- **リビジョン**: hub 全体で単調増加する整数 (SVN 型)。コミット順 = 全順序。
  `pull?since=N` で「N より後の全コミット」= 更新差分をそのまま配布できる。

## 対象データ

**共有データのみ**を扱う (個人ローカル専用データは push しない)。payload は
`{format, data}` で形式を明示する:

| format | data | 例 |
|---|---|---|
| `json`  | 任意 JSON 値 | Discutere ペルソナデータ (架空キャラ設定) |
| `graph` | `{nodes:[], edges:[]}` の JSON | Anatomia ドメイングラフ |
| `csv`   | CSV テキスト (UTF-8) | 集計・パラメータ表 |
| `text`  | プレーンテキスト | ボイス台本、メモ、Ars ゲームワークツリーデータ |

想定利用元: Discutere (ゲームの声データ・ペルソナデータ)、Anatomia (ドメインデータ)、
Ars (ゲームワークツリーデータ) など。kind は `<サービス>.<種別>` の名前空間で
自由に増やせる (hub 側はスキーマ非依存)。

## センシティブデータ遮断 (push 時検査)

**個人のセンシティブなデータの共有はルールとして禁止**する。共有してよいのは
制作用の共有データのみ。担保は push 時の**成長型ブラックボックス検査**:

1. **決定的ルール層** (成長する): `sensitive-rules.jsonl` に蓄積された
   キーワード / 正規表現 / カテゴリで即時判定。ヒットしたら reject。
2. **LLM 層**: ルール層を通過した payload を `claude -p --model haiku`
   (LUDIARS 方針: CLI 経由・API キー不使用) で審査し、
   `{verdict: allow|reject, category?, reason?, learnedPatterns?[]}` を得る。
3. **成長**: LLM が reject した際に返す一般化パターン (`learnedPatterns`) を
   ルール層へ追記する。以後の同種データは LLM を呼ばず決定的に落ちる —
   検査は運用とともに強く・安くなる (成長型)。
4. **判定は kind 単位で適用**: 検査対象はセンシティブデータを持つ可能性がある
   kind。**既定は検査 ON** (fail-safe)。明示的に安全と宣言した kind のみ
   設定 (`kinds` 設定の `sensitiveCheck: false`) でスキップできる。
5. **reject 時の応答はブラックボックス**: カテゴリと短い理由のみ返し、
   検知した値そのものはレスポンス・ログへエコーしない (redact)。
   検査記録は `sensitive.jsonl` に redact 済みで残す。
6. 検査対象 kind の push は claude CLI 不在時 **reject** (fail-fast)。
   無言スキップで通さない。

## Author (PC 識別)

- 各クライアントは初回に UUIDv4 を生成しローカルへ保存 (Node CLI:
  `FUNDAMENTUM_AUTHOR_FILE` (既定 OS ローカル状態ディレクトリ)、ブラウザ: localStorage)。
  リポジトリ内には置かない (git 共有で PC 間衝突するため)。
- 表示名は `POST /v1/authors` で hub の台帳へ登録し、UI は台帳で突き合わせて表示する。
- 個人データは自己申告ハンドル名のみ。Cernere 統合は非対象 (下記) — 本 hub は
  LAN 内の制作チーム用であり、指示により識別は PC UUID と定めるため。

## push / pull

API 詳細は `spec/interface/datahub-api.md`。要点:

- **push**: `{author, items:[{kind, id, baseRev, payload}]}`。
  - `baseRev` = クライアントがそのレコードについて最後に知っている rev (新規は 0)。
  - 受理された item ごとに hub が rev を採番し、**レスポンスで確定 rev を返す**。
    クライアントはこれを自分のローカル状態に割り当てる。
  - head と同一 payload の push は `unchanged` (冪等)。
- **pull**: `GET /v1/pull?since=N` → rev>N の全コミットを rev 順で返す。
  クライアントは順に適用し、最後の rev を次回の since にする。
- 書き込みはサーバ内で直列化し、revlog (append-only JSONL) へ追記してから応答する。

## コンフリクト解決

`baseRev < 現 head rev` かつ payload が head と異なる push がコンフリクト。

判定パイプライン (resolver):

1. **決定的スーパーセット判定** (機械): 片方の JSON がもう片方の構造的上位集合
   (全キー・値を包含し追加情報のみ持つ) なら、その側を採用。LLM 不要・決定的。
2. **LLM 判定**: `claude -p` (LUDIARS 方針: API キー不使用) に両 payload を渡し、
   「機械的に情報量が多い側」を JSON で回答させる
   (`{winner: current|incoming|undecidable, reason}`)。
   明確に多い側があるときのみ winner を返させる。
3. **採用**: winner 側を新 rev としてコミット (incoming 勝ち) / head 維持で
   incoming 棄却 (current 勝ち)。いずれも `conflicts.jsonl` に
   {両 rev, author, 判定モード, 理由} を**必ずログ**する。
4. **保留**: undecidable / LLM 実行不能のときは `conflict` ステータスで返し、
   pending として記録。`POST /v1/conflicts/resolve` で手動解決できる。
   claude CLI 不在は起動時に検出してログへ明示する (無言フォールバック禁止 —
   スタブ判定へは落とさない)。

判定関数はインタフェース注入 (テストはスタブ判定を明示注入、本番配線は claude -p)。

## バックアップ

- 設定間隔 (既定 60 分) ごと + 手動 `POST /v1/backup` で、store ディレクトリの
  JSONL 一式を `backups/<ISO8601>/` へコピーし `meta.json` (headRev / 件数) を添える。
- append-only JSONL のためコピーは安全 (SQLite WAL 差し替え地雷は該当しない)。
- 保持数 (既定 30 個) を超えた古いバックアップは sweep する。
- タイマー / 時刻は注入可能にする (テスト決定性)。

## UI パッケージ (datahub-kit)

`packages/datahub-kit/` — この基盤でデータを管理するアプリに組み込む一式:

- `client.mjs` — fetch ベースの push/pull/authors/conflicts クライアント
  (ブラウザ / Node 両用、依存ゼロ)。
- `panel.mjs` — `<fm-datahub-panel>` custom element。接続状態 / author 表示名編集 /
  push・pull 実行ボタン / **レスポンスの逐次表示** (採番 rev、コンフリクト解決結果、
  エラー) / 履歴ログ表示。ホストアプリは payload の取得・適用コールバックを渡す。
- `config` — 接続先 base URL・表示名などの設定 (ファイル既定 + 上書き)。
- `tests/` — Fm 用データテスト (実サーバをプロセス内起動する実経路テスト)。
- `README.md` — 組み込み手順。

最初の組み込み先は同梱テストコンソール (`packages/datahub-kit/ui/index.html`、hub の `/ui` から配信)。各サービス (Discutere / Anatomia / Ars) への組み込みは kit README の手順に従う。

## 非対象 (将来)

- アカウント認証・権限 (Cernere 統合)。SaaS 化する時点で
  `prototyping-flow` の SaaS チェックリストに従い再設計する。
- 大容量バイナリ (音声波形・モデル実体など) の最適化転送。payload 上限
  (既定 5MB) 内のテキスト/base64 で扱い、超えるものは rev 管理外。
- ブランチ / マージ履歴 (線形リビジョンのみ)。
- 「別キーに置かれた同内容データ」の重複検出。
- 既存 Fm ライブラリ (MasterStore/Catalog) とのストア統合 — hub の payload を
  content-addressed 化して master 層と共有する案は、remote backend 設計
  (DESIGN.md §3) と合わせて別タスクで検討する。

## 関連 spec

- `spec/interface/datahub-api.md` — HTTP API 契約
- `spec/data/datahub-store.md` — 永続データスキーマ
- `spec/plan/data-foundation-plan.md` — 採用宣言 / 実装計画
- `spec/test/data-foundation-test.md` — テスト計画
