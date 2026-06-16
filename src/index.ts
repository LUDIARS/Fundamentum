/**
 * Fundamentum — LUDIARS 共通データ基盤 (public API)。
 *
 * master (content-addressed 不変) / user (可変 overlay) の 2 層と、論理名付けの catalog、
 * 実効ビューの resolver を提供する。詳細は DESIGN.md。
 */
export type {
  JsonPrimitive,
  JsonValue,
  ContentId,
  MasterRecord,
  CatalogEntry,
  Catalog,
  CatalogDiff,
  UserRecord,
  ResolvedSource,
  Resolved,
} from "./types.js";

export { canonicalize } from "./hash/canonical.js";
export {
  contentIdOf,
  contentIdFromCanonical,
  isContentId,
  CONTENT_ID_PREFIX,
} from "./hash/content-id.js";

export type { StorageBackend } from "./backend/backend.js";
export { MemoryBackend } from "./backend/memory-backend.js";
export { FileBackend } from "./backend/file-backend.js";

export { MasterStore } from "./master/master-store.js";
export { CatalogStore, CatalogBuilder } from "./master/catalog.js";
export { UserStore } from "./user/user-store.js";
export { Resolver } from "./resolve/resolver.js";

export { Foundation } from "./foundation.js";
