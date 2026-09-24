import { KVStore } from "./interface";

export class IndexedDBKVStore implements KVStore {
  protected static dbPromiseMap = new Map<string, Promise<IDBDatabase>>();

  constructor(protected readonly _prefix: string) {}

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const tx = (await this.getDB()).transaction([this.prefix()], "readonly");
    const store = tx.objectStore(this.prefix());

    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onerror = (event) => {
        event.stopPropagation();

        const error = (event.target as IDBRequest).error;
        reject(new Error(error?.message ?? "Unknown IndexedDB error on get"));
      };
      request.onsuccess = () => {
        if (!request.result) {
          resolve(undefined);
        } else {
          resolve(request.result.data);
        }
      };
    });
  }

  async set<T = unknown>(key: string, data: T | null): Promise<void> {
    if (data === null) {
      const tx = (await this.getDB()).transaction([this.prefix()], "readwrite");
      const store = tx.objectStore(this.prefix());

      return new Promise((resolve, reject) => {
        const request = store.delete(key);
        request.onerror = (event) => {
          event.stopPropagation();

          const error = (event.target as IDBRequest).error;
          reject(
            new Error(error?.message ?? "Unknown IndexedDB error on delete")
          );
        };
        request.onsuccess = () => {
          resolve();
        };
      });
    } else {
      const tx = (await this.getDB()).transaction([this.prefix()], "readwrite");
      const store = tx.objectStore(this.prefix());

      return new Promise((resolve, reject) => {
        const request = store.put({
          key,
          data,
        });
        request.onerror = (event) => {
          event.stopPropagation();

          const error = (event.target as IDBRequest).error;
          reject(new Error(error?.message ?? "Unknown IndexedDB error on put"));
        };
        request.onsuccess = () => {
          resolve();
        };
      });
    }
  }

  async getAllKeys(): Promise<string[]> {
    const tx = (await this.getDB()).transaction([this.prefix()], "readonly");
    const store = tx.objectStore(this.prefix());

    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onerror = (event) => {
        event.stopPropagation();

        const error = (event.target as IDBRequest).error;
        reject(
          new Error(error?.message ?? "Unknown IndexedDB error on getAllKeys")
        );
      };
      request.onsuccess = () => {
        resolve(request.result as string[]);
      };
    });
  }

  prefix(): string {
    return this._prefix;
  }

  protected async getDB(): Promise<IDBDatabase> {
    const prefix = this.prefix();
    if (!IndexedDBKVStore.dbPromiseMap.has(prefix)) {
      IndexedDBKVStore.dbPromiseMap.set(prefix, this.openDB());
    }

    return IndexedDBKVStore.dbPromiseMap.get(prefix)!;
  }

  protected openDB(): Promise<IDBDatabase> {
    const prefix = this.prefix();
    return new Promise((resolve, reject) => {
      const request = window.indexedDB.open(prefix);
      request.onerror = (event) => {
        event.stopPropagation();
        IndexedDBKVStore.dbPromiseMap.delete(prefix);
        const error = (event.target as IDBRequest).error;
        reject(
          new Error(error?.message ?? "Unknown IndexedDB error on openDB")
        );
      };

      request.onupgradeneeded = (event) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const db = event.target.result;

        db.createObjectStore(prefix, { keyPath: "key" });
      };

      request.onsuccess = () => {
        const db = request.result;

        db.onclose = () => {
          IndexedDBKVStore.dbPromiseMap.delete(prefix);
        };
        db.onversionchange = () => {
          db.close();
          IndexedDBKVStore.dbPromiseMap.delete(prefix);
        };

        resolve(db);
      };
    });
  }
}
