/**
 * Foundation — facade。backend を渡すと master / catalog / user / resolver を配線する。
 *
 * 利用側は基本ここから入る:
 *   const fm = Foundation.inMemory();        // hermetic
 *   const fm = Foundation.onDisk("/path");   // 永続
 *   const rec = await fm.master.put({ ... });
 *   await fm.catalog.builder("anatomia/adventure").set("rule:x", rec.id).commit();
 *   const eff = await fm.resolve("project-1", "anatomia/adventure", "rule:x");
 *
 * SRP: 配線とファクトリのみ。
 */
import { FileBackend } from "./backend/file-backend.js";
import { MemoryBackend } from "./backend/memory-backend.js";
import type { StorageBackend } from "./backend/backend.js";
import { CatalogStore } from "./master/catalog.js";
import { MasterStore } from "./master/master-store.js";
import { Resolver } from "./resolve/resolver.js";
import type { Resolved } from "./types.js";
import { UserStore } from "./user/user-store.js";

export class Foundation {
  readonly master: MasterStore;
  readonly catalog: CatalogStore;
  readonly user: UserStore;
  readonly resolver: Resolver;

  constructor(readonly backend: StorageBackend) {
    this.master = new MasterStore(backend);
    this.catalog = new CatalogStore(backend);
    this.user = new UserStore(backend);
    this.resolver = new Resolver(this.master, this.catalog, this.user);
  }

  /** in-memory (hermetic) な Foundation。 */
  static inMemory(): Foundation {
    return new Foundation(new MemoryBackend());
  }

  /** ディスク永続な Foundation (`dir` 配下に保管)。 */
  static onDisk(dir: string): Foundation {
    return new Foundation(new FileBackend(dir));
  }

  /** resolver.resolve のショートカット。 */
  resolve(scope: string, catalogName: string, name: string): Promise<Resolved> {
    return this.resolver.resolve(scope, catalogName, name);
  }

  /** resolver.resolveAll のショートカット。 */
  resolveAll(scope: string, catalogName: string): Promise<Resolved[]> {
    return this.resolver.resolveAll(scope, catalogName);
  }
}
