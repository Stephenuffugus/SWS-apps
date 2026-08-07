// IndexedDB persistence for seating projects. Local-only by design.
const DBNAME = 'sws-seating';

function open() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const r = indexedDB.open(DBNAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains('projects'))
        r.result.createObjectStore('projects', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction('projects', mode);
    const rq = fn(t.objectStore('projects'));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error);
  });
}

export const saveProject = (p) => tx('readwrite', s => s.put(p));
export const getProject = (id) => tx('readonly', s => s.get(id));
export const allProjects = () => tx('readonly', s => s.getAll());
export const deleteProject = (id) => tx('readwrite', s => s.delete(id));
