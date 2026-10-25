/**
 * Keeps the user's loaded files in IndexedDB (on their device only), so file blocks survive a reload.
 * Storage can be unavailable (private windows, blocked site data); every operation then quietly does nothing
 * and the file block simply asks for its file again.
 */
const DB_NAME = 'ez-signal-files';
const STORE = 'files';

let database: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

/** Saves the original file (not the decoded samples, which are several times larger). */
export const saveFile = (id: string, file: File) => transaction('readwrite', (s) => s.put(file, id));

export const loadFile = (id: string) => transaction<File | undefined>('readonly', (s) => s.get(id));

/** Deletes every stored file whose id isn't in `keep`. */
export async function pruneFiles(keep: Set<string>) {
  const ids = (await transaction('readonly', (s) => s.getAllKeys())) ?? [];
  for (const id of ids) if (!keep.has(String(id))) await transaction('readwrite', (s) => s.delete(id));
}
