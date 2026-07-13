# data/datahub-store — datahub 永続データスキーマ

保存先: `FUNDAMENTUM_DATAHUB_DIR` (既定 `<repo>/data/datahub/`。`data/` は
gitignore 済みアンカー)。全ファイル **append-only JSONL** (UTF-8 / LF / 1 行 1
イベント)。head 状態は起動時のリプレイで再構成する (このスケールでは十分。
肥大化したら snapshot 導入を検討)。append-only のためバックアップは単純コピーで
安全 (WAL 差し替え地雷なし)。

## revlog.jsonl — コミット台帳 (正本)

1 行 = 1 コミット (`CommitRecord`、`spec/interface/datahub-api.md` の型)。

```json
{"rev":42,"kind":"discutere.persona","id":"necoco","author":"<uuid>",
 "ts":"2026-07-13T02:00:00.000Z","hash":"sha256:...",
 "payload":{"format":"json","data":{}},
 "resolution":{"mode":"llm","winner":"incoming","againstRev":40,"reason":"..."}}
```

- `rev` は 1 始まり・欠番なし・追記順と一致 (起動時に検証、破れは fail-fast)。
- `hash` = 正規化 JSON (キーソート) の sha256。`unchanged` 判定に使う。

## authors.jsonl — Author 台帳

```json
{"author":"<uuid4>","name":"neco","ts":"..."}
```

upsert イベントログ。head = author ごとの最新行。firstSeen/lastSeen は再構成。

## conflicts.jsonl — コンフリクトログ (自動解決の記録 + pending)

```json
{"event":"auto-resolved","conflictId":"c-...","kind":"...","id":"...",
 "baseRev":40,"headRev":41,"author":"<uuid>","mode":"superset|llm",
 "winner":"incoming|current","reason":"...","assignedRev":42,"ts":"..."}
{"event":"pending","conflictId":"c-...","kind":"...","id":"...","baseRev":40,
 "headRev":41,"author":"<uuid>","reason":"undecidable|llm-unavailable",
 "incomingPayload":{...},"ts":"..."}
{"event":"manual-resolved","conflictId":"c-...","winner":"incoming",
 "assignedRev":43,"ts":"..."}
```

## sensitive-rules.jsonl — 成長型検査ルール (決定的層)

```json
{"ruleId":"r-...","category":"personal-contact","pattern":"(?:電話|tel)[:：]?\\s*0\\d{9,10}",
 "patternType":"regex","source":"llm-learned|seed|manual","ts":"..."}
```

- seed ルール (メール / 電話 / 住所 / マイナンバー / クレカ / トークン様式) を
  初期投入し、LLM の `learnedPatterns` で成長する。
- 誤検知ルールの無効化は `{"event":"disable","ruleId":"..."}` 行の追記で行う
  (行削除はしない — append-only)。

## sensitive.jsonl — 検査記録 (redact 済み)

```json
{"kind":"discutere.voice","id":"...","author":"<uuid>","verdict":"reject",
 "layer":"rules|llm","category":"personal-contact","ruleId":"r-...",
 "reason":"短い説明 (検知値は含めない)","ts":"..."}
```

allow は記録しない (量が支配的)。reject のみ。payload・検知値そのものは
**書かない** (ブラックボックス / redact 原則)。

## oplog.jsonl — 操作要約 (UI 履歴 / GET /v1/log 用)

```json
{"op":"push|pull|backup|resolve","author":"<uuid>","items":3,"statuses":{"committed":2,
 "rejected-sensitive":1},"sinceRev":40,"headRev":43,"durationMs":120,"ts":"..."}
```

リングバッファ的に直近 N 行のみ配信 (ファイル自体は append-only)。

## backups/<ISO8601>/ — バックアップ

上記 JSONL 一式のコピー + `meta.json` `{ts, headRev, records, bytes}`。
保持数 (既定 30) 超過分は古い順に削除。

## 設定 (config/datahub.json — コミット対象、env で上書き)

```json
{"port": 4220,
 "dataDir": "data/datahub",
 "maxPayloadBytes": 5242880,
 "backup": {"intervalMinutes": 60, "retention": 30},
 "llm": {"conflictModel": "claude-sonnet-latest", "sensitiveModel": "haiku",
          "timeoutMs": 60000},
 "kinds": {"anatomia.domain": {"sensitiveCheck": false}}}
```

- ポートの正本は Excubitor catalog。ここでの値はフォールバック既定であり、
  Excubitor が `FUNDAMENTUM_DATAHUB_PORT` を注入する。
- `kinds` に無い kind は **sensitiveCheck: true** (fail-safe 既定)。
- シークレットなし (認証なし・API キー不使用) — 平文禁止ルールに抵触しない。
