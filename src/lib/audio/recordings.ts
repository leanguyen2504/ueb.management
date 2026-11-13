// Lưu các bản ghi âm ngay trong trình duyệt (IndexedDB), không tải lên máy chủ.
export type Rec = { id: string; name: string; created: number; duration: number; blob: Blob };

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('ueb-ghi-am', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('rec', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const q = f(d.transaction('rec', mode).objectStore('rec'));
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}

export const listRecs = async () => (await tx<Rec[]>('readonly', (s) => s.getAll())).sort((a, b) => b.created - a.created);
export const putRec = (r: Rec) => tx('readwrite', (s) => s.put(r));
export const delRec = (id: string) => tx('readwrite', (s) => s.delete(id));
