// IndexedDB persistence — photos live inside the inventory objects, so this
// is where the gigabytes would go without capture-time compression.
const DBNAME = 'sws-inventory';

function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DBNAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('inventories'))
        r.result.createObjectStore('inventories', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('inventories', mode);
    const rq = fn(t.objectStore('inventories'));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error);
  });
}

export const saveInventory = (v) => tx('readwrite', s => s.put(v));
export const getInventory = (id) => tx('readonly', s => s.get(id));
export const allInventories = () => tx('readonly', s => s.getAll());
export const deleteInventory = (id) => tx('readwrite', s => s.delete(id));
