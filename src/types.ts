/**
 * Fundamentum 中核型。
 *
 * 本基盤は値を「不透明な JSON 値」として扱う (スキーマ強制は consumer の責務、DESIGN §1.2)。
 * SRP: 型のみ。挙動は各モジュールに置く。
 */

/** JSON プリミティブ。 */
export type JsonPrimitive = string | number | boolean | null;

/** 本基盤が保管できる値。決定的に直列化できる JSON 値に限る (undefined / 関数等は不可)。 */
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

/**
 * master 値の content id。`fm1:` + sha256(canonical JSON)。
 * 同じ内容 → 同じ id (純粋 content addressing)。
 */
export type ContentId = string;

/** master 値の参照結果。 */
export interface MasterRecord {
  readonly id: ContentId;
  readonly value: JsonValue;
}

/** catalog の 1 エントリ (論理名 → master content id)。 */
export interface CatalogEntry {
  readonly name: string;
  readonly id: ContentId;
}

/**
 * 名前付き・versioned スナップショット。
 * entries は「論理名 → master の ContentId」。catalog 自体も content-addressed。
 */
export interface Catalog {
  /** catalog スナップショットの content id。 */
  readonly id: ContentId;
  /** 論理 catalog 名 (例 `anatomia/adventure`)。 */
  readonly name: string;
  /** 1 始まりの版番号。 */
  readonly version: number;
  /** 論理名 → master content id。 */
  readonly entries: Readonly<Record<string, ContentId>>;
  /** 直前バージョンの catalog content id (初版は null)。 */
  readonly parent: ContentId | null;
}

/** catalog 2 版間の差分。 */
export interface CatalogDiff {
  /** b のみに存在する論理名。 */
  readonly added: string[];
  /** a のみに存在する論理名。 */
  readonly removed: string[];
  /** 両方に存在するが content id が異なる論理名。 */
  readonly changed: string[];
  /** 両方に存在し content id も同一 (= 再解析不要) の論理名。 */
  readonly unchanged: string[];
}

/** user 層の 1 リビジョン (履歴の 1 要素)。 */
export interface UserRecord {
  readonly scope: string;
  readonly key: string;
  /** tombstone のときは null。 */
  readonly value: JsonValue | null;
  /** 1 始まり。set / delete のたびに増える。 */
  readonly revision: number;
  /** delete (tombstone) なら true。 */
  readonly deleted: boolean;
}

/** Resolver の実効値の出所。 */
export type ResolvedSource = "user" | "master" | "none";

/** master + user overlay を統合した実効値。 */
export interface Resolved {
  readonly key: string;
  /** source が "none"、または user の tombstone のときは null。 */
  readonly value: JsonValue | null;
  readonly source: ResolvedSource;
  /** source が "master" のときの content id。それ以外は null。 */
  readonly id: ContentId | null;
}
