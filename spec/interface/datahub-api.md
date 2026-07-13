# interface/datahub-api — datahub HTTP API 契約

base: `http://127.0.0.1:<port>` (ポート正本 = Excubitor catalog `fundamentum-datahub`)。
全て JSON (`Content-Type: application/json; charset=utf-8`)。認証なし (LAN 内、
非対象は feature spec 参照)。エラーは `{error: {code, message}}` + 4xx/5xx。

## 型

```ts
type Author = string;              // UUIDv4 (PC 単位)
type Rev = number;                 // hub 全体で単調増加 (1 始まり)
type PayloadFormat = "json" | "graph" | "csv" | "text";

interface Payload {
  format: PayloadFormat;
  data: unknown;                   // json/graph: JSON 値, csv/text: string
}

interface CommitRecord {           // revlog の 1 コミット (= pull で配布される単位)
  rev: Rev;
  kind: string;                    // 例 "discutere.persona"
  id: string;
  author: Author;
  ts: string;                      // ISO8601 UTC (hub 採時)
  hash: string;                    // payload の sha256 (正規化 JSON)
  payload: Payload;
  resolution?: ResolutionNote;     // コンフリクト自動解決で生まれたコミットのみ
}

interface ResolutionNote {
  mode: "superset" | "llm" | "manual";
  winner: "incoming" | "current";
  againstRev: Rev;                 // 敗者側の rev (current 勝ちなら incoming は rev 無し)
  reason: string;
}
```

## GET /v1/health

`{ok: true, service: "fundamentum-datahub", headRev, records, authors,
  llm: {conflict: boolean, sensitive: boolean}}`
(llm.* = claude CLI 検出結果。false のときコンフリクト自動解決 / 検査対象 kind の
push は保留 / 拒否になる。)

## Authors

- `POST /v1/authors` — body `{author, name}`。表示名の登録 / 更新 (upsert)。
  → `{ok: true, author, name}`
- `GET /v1/authors` — → `{authors: [{author, name, firstSeen, lastSeen}]}`

## POST /v1/push

body:

```json
{"author": "<uuid>",
 "items": [{"kind": "discutere.persona", "id": "necoco", "baseRev": 0,
            "payload": {"format": "json", "data": {"...": "..."}}}]}
```

- `baseRev`: クライアントが当該 `(kind,id)` について最後に知っている rev。新規は 0。
- 前提: author が `/v1/authors` 登録済みであること (未登録は 400 — 表示名の
  突き合わせ不能なデータを作らない)。
- item は受信順に直列処理。レスポンス:

```json
{"headRev": 42,
 "results": [{"kind": "...", "id": "...", "status": "committed", "rev": 42}]}
```

| status | 意味 | 追加フィールド |
|---|---|---|
| `committed` | 採番・コミット済み | `rev` (**push の戻りで自分の rev を受け取る**) |
| `unchanged` | head と同一 payload (冪等) | `rev` = 既存 head rev |
| `resolved-incoming` | コンフリクト → 自動解決で incoming 採用 | `rev`, `resolution` |
| `resolved-current` | コンフリクト → 自動解決で current 維持 (incoming 棄却) | `headRev`, `resolution` |
| `conflict` | 自動解決不能 → pending 登録 | `conflictId`, `headRev`, `reason` |
| `rejected-sensitive` | センシティブ検査で遮断 | `category`, `reason` (値はエコーしない) |
| `error` | 単項目の検証エラー | `error` |

- payload 上限: 既定 5MB/item (超過は `error`)。
- 検査対象 kind で claude CLI 不在 → `rejected-sensitive`
  (`category: "llm-unavailable"`)。

## GET /v1/pull?since=N[&kind=prefix]

→ `{headRev, records: CommitRecord[]}` — rev>N の全コミットを rev 昇順で。
`kind` は前方一致フィルタ (例 `kind=discutere.`)。クライアントは順に適用し、
最後の rev を次回 since に使う。

## GET /v1/records[?kind=prefix]

→ `{headRev, records: CommitRecord[]}` — 各 `(kind,id)` の **head のみ**
(初回同期・一覧用)。

## Conflicts

- `GET /v1/conflicts` — pending 一覧
  `{conflicts: [{conflictId, kind, id, baseRev, headRev, author, ts, reason}]}`
  (incoming payload は hub が保持、レスポンスには含む)
- `POST /v1/conflicts/resolve` — body `{conflictId, winner: "incoming"|"current"}`。
  手動解決。incoming 勝ちは新 rev をコミット。→ push と同形の result。

## Ops / 観測

- `GET /v1/log?limit=50` — 直近の操作ログ (push/pull/解決/遮断の要約。UI の
  レスポンス履歴表示用)。
- `POST /v1/backup` — 即時バックアップ → `{ok, dir, headRev}`
- `GET /v1/backups` — `{backups: [{dir, ts, headRev, bytes}]}`
