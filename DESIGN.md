# Fundamentum — 共通データ基盤 (master / user 2 層)

LUDIARS 横断の **共通データ基盤** ライブラリ (略称 `Fm`)。
「絶対に変わらない規定部分」(master) と「可変な利用側の上書き」(user) を 2 層に分け、
content-addressed・決定的に持つことで、規定部分の解析・更新を楽にする。

最初の consumer は **Anatomia (`An`)**。Anatomia の「カノニカルな解析成果物 (ルール / ドメイン
カード / DAG アンカー)」を master 層に置き、セッション/プロジェクト固有の調整を user 層に置く。

---

## 1. 目的とスコープ

### 1.1 解く問題

RAG / コード解析の入力データは、性質の異なる 2 種が混ざる:

- **規定部分 (master)** — カノニカル・不変。アーキテクチャルール、ドメインオントロジー、
  確定した仕様の射影など。「絶対に変わらない」前提で何度も参照される。
- **可変部分 (user)** — 利用側の上書き・セッション/プロジェクト固有の調整・実験的な差分。

これを 1 つの可変ストアに混ぜると、(a) 不変な部分まで毎回再解析する無駄が出て、
(b) 更新差分の特定が難しい。**2 層に分離**すると:

- master は **content-addressed**。同じ内容 → 同じ ID。一度解析・キャッシュすれば、
  以後セッション/リポを跨いでヒットする (= Anatomia が「規定部分の解析を代行」できる)。
- 更新は **変わった分だけ**。catalog の version 差分 (`diff`) が、再解析すべき名前を正確に返す
  (= 「更新により楽をする」)。
- user 層は master を壊さず overlay する。実験・上書きが master の決定性を汚さない。

### 1.2 非目標

- RAG の embedding / retrieval そのもの (Anatomia 側 / 各 consumer の責務)。
- 個人データの保管。**個人データは Cernere 単一情報源**。user 層は「可変なアプリ/セッション
  状態」であって個人データストアではない (LUDIARS 共通規約)。
- スキーマ強制・バリデーション (consumer が zod 等で被せる。本体は JSON 値を不透明に扱う)。

---

## 2. 3 つの中核概念

### 2.1 MasterStore — content-addressed 不変ストア

- `put(value)` → `ContentId` (= `fm1:` + sha256(canonical JSON of value))。
- **値のみ**から ID を導出 (純粋 content addressing)。namespace 等のラベルは ID に混ぜない
  → 同一内容は global に dedup される (キャッシュ命中の源)。
- 不変。`update` / `delete` を持たない。「変更」は別 ID の新 value を put するだけ。
- 書込みは冪等 (同 ID → 同 value)。並行書込みが衝突しない (Anatomia file-store と同じ思想)。

### 2.2 Catalog — 名前付き・versioned スナップショット

master の content id は内容ハッシュなので、人間/コードが参照する**論理名**が要る。
Catalog はその名前空間 + バージョン管理:

- `Catalog` = `{ name, version, entries: { 論理名 → ContentId }, parent }`。
- catalog 自体も content-addressed (スナップショットとして共有可能)。
- `CatalogBuilder` で `set(name, id)` / `remove(name)` → `commit()` で次バージョンを作る。
- **差分なしの commit は no-op** (同じ latest を返す) → 冪等な「再構築」が無料。
- `diff(a, b)` → `{ added, removed, changed, unchanged }`。
  - `unchanged` の名前は content id が同一 = consumer の解析キャッシュがヒット。
  - `changed` / `added` だけ再解析すればよい。これが「規定部分の更新の楽さ」の実体。

### 2.3 UserStore — scoped・可変・revisioned overlay

- `set(scope, key, value)` / `get` / `delete` (tombstone) / `list(scope)` / `history(scope, key)`。
- scope = 利用側の論理区画 (例: project id, session id)。**個人特定子は置かない**。
- 各操作が revision を 1 つ積む (履歴保持・監査可能)。`delete` は tombstone revision。

### 2.4 Resolver — 実効ビュー (user overlay > master)

- `resolve(scope, catalogName, name)` → user 層に live な値があればそれ、
  user の tombstone があれば「明示的に隠す」(value null)、無ければ catalog 経由で master。
- `resolveAll(scope, catalogName)` → catalog の全名前 ∪ user の live key を統合。
- 戻り値は `{ key, value, source: "user"|"master"|"none", id }`。

---

## 3. ストレージ層 (差し替え可能)

```
StorageBackend (interface)
 ├─ content:  getContent / putContent / hasContent          … master (不変・content-addressed)
 └─ keyed:    getKeyed / putKeyed / deleteKeyed / listKeys   … catalog head/version, user revisions
```

- **MemoryBackend** — 既定。hermetic (テスト・一時利用)。
- **FileBackend** — ディスク永続。content は `content/<aa>/<hash>.json` に sharding、
  keyed は `keyed/<enc(partition)>/<enc(key)>.json`。書込みは tmp + rename で atomic、
  content は内容ハッシュキーゆえ冪等 (Anatomia `createFileStore` と同方針)。
- 将来: org 共有 remote backend (HTTP) を同 interface で差せる (Anatomia の残課題と接続可能)。

API は **async** で固定 (remote backend を後付けできるようにするため)。

---

## 4. モジュール構成 (SRP)

```
src/
  types.ts                 中核型 (JsonValue / ContentId / MasterRecord / Catalog / UserRecord / Resolved)
  hash/
    canonical.ts           決定的 canonical JSON 直列化 (キー再帰ソート)
    content-id.ts          canonical → ContentId (sha256, fm1: prefix)
  backend/
    backend.ts             StorageBackend interface
    memory-backend.ts      in-memory 実装
    file-backend.ts        ディスク実装 (atomic write / sharding / base64url key)
    index.ts
  master/
    master-store.ts        content-addressed 不変ストア
    catalog.ts             名前付き versioned スナップショット + CatalogBuilder + diff
    index.ts
  user/
    user-store.ts          scoped 可変 revisioned overlay
    index.ts
  resolve/
    resolver.ts            user overlay > master の実効ビュー
    index.ts
  foundation.ts            facade (backend を渡すと 4 つを配線。inMemory / onDisk ファクトリ)
  index.ts                 public barrel
```

---

## 5. Anatomia への接続 (最初の利用例)

Anatomia は本体を変更せずアダプタで接続する想定:

- **master**: アーキテクチャルール (§4.3)・ドメインオントロジー (preset)・確定した仕様射影を
  `master.put()` し、catalog `anatomia/<project>` の論理名 (`rule:no-cross-domain` 等) に束ねる。
- **更新**: ルール改訂時は `CatalogBuilder` で差し替え `commit()`。`diff(prev, next)` の
  `changed`/`added` だけ Anatomia 側で再解析・再蒸留すればよい (`unchanged` は ID 一致でキャッシュ命中)。
- **user**: プロジェクト固有のルール上書き・閾値調整を `user.set(projectId, ...)`。
  Resolver で「規定 + プロジェクト調整」の実効ルールセットを得る。

具体的な配線 (Anatomia 側のアダプタ) は別タスク。本リポは基盤のみを提供する。

---

## 6. 実装方針

- フルセット・No-MVP (`full-set-implementation`)。設計済みの 4 概念 + 2 backend を全実装 + テスト。
- Node 20+ / TypeScript strict / NodeNext / ESM。テストは vitest。
- 外部依存ゼロ (Node 標準 `crypto` / `fs` のみ)。
