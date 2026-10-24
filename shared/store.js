// Shared local storage + backup/merge module for personal apps.
// Data lives only in this device's IndexedDB. Export/Import move it between devices.
//
// Every item: { id, createdAt, updatedAt, deleted, ...appFields }
// Backup file: { app, schemaVersion, exportedAt, items: [...] }

const DB_VERSION = 1;

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function time(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * @param {object} opts
 * @param {string} opts.app            app name; namespaces the database and backup file
 * @param {number} opts.schemaVersion  current item schema version
 * @param {(items: object[], fromVersion: number) => object[]} [opts.migrate]
 * @param {(item: object) => boolean} [opts.validate]  app-specific shape check
 */
export function createStore({ app, schemaVersion, migrate = (items) => items, validate = () => true }) {
  const dbName = `pa:${app}`;
  let dbPromise;

  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const open = indexedDB.open(dbName, DB_VERSION);
        open.onupgradeneeded = () => {
          const d = open.result;
          if (!d.objectStoreNames.contains('items')) d.createObjectStore('items', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error);
      });
    }
    return dbPromise;
  }

  async function all({ includeDeleted = false } = {}) {
    const d = await db();
    const items = await req(d.transaction('items').objectStore('items').getAll());
    return includeDeleted ? items : items.filter((i) => !i.deleted);
  }

  async function get(id) {
    const d = await db();
    return req(d.transaction('items').objectStore('items').get(id));
  }

  function stamp(item, now) {
    return {
      ...item,
      id: item.id || uuid(),
      createdAt: item.createdAt || now,
      updatedAt: now,
      deleted: !!item.deleted,
    };
  }

  /** Insert or update items; sets updatedAt. Returns the stored items. */
  async function putMany(items) {
    const now = new Date().toISOString();
    const stored = items.map((i) => stamp(i, now));
    const d = await db();
    const tx = d.transaction('items', 'readwrite');
    const os = tx.objectStore('items');
    stored.forEach((i) => os.put(i));
    await txDone(tx);
    return stored;
  }

  async function put(item) {
    return (await putMany([item]))[0];
  }

  /** Soft-delete, so the deletion also travels through export/import. */
  async function removeMany(ids) {
    const d = await db();
    const existing = await Promise.all(ids.map((id) => req(d.transaction('items').objectStore('items').get(id))));
    return putMany(existing.filter(Boolean).map((i) => ({ ...i, deleted: true })));
  }

  async function remove(id) {
    return removeMany([id]);
  }

  async function getMeta(key) {
    const d = await db();
    const row = await req(d.transaction('meta').objectStore('meta').get(key));
    return row ? row.value : undefined;
  }

  async function setMeta(key, value) {
    const d = await db();
    const tx = d.transaction('meta', 'readwrite');
    tx.objectStore('meta').put({ key, value });
    await txDone(tx);
  }

  /**
   * Export everything (including soft-deleted items) to `<app>-backup.json`.
   * preferShare: use the Web Share sheet with the file (iPhone → Save to Files).
   */
  async function exportBackup({ preferShare = false } = {}) {
    const items = await all({ includeDeleted: true });
    const exportedAt = new Date().toISOString();
    const payload = { app, schemaVersion, exportedAt, items };
    const fileName = `${app}-backup.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    let file = null;
    try {
      file = new File([blob], fileName, { type: 'application/json' });
    } catch { /* older Safari: no File constructor */ }

    let method = 'download';
    if (preferShare && file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName });
        method = 'share';
      } catch (err) {
        if (err && err.name === 'AbortError') return { cancelled: true };
        method = 'download';
      }
    }
    if (method === 'download') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    await setMeta('lastExported', exportedAt);
    return { count: items.length, exportedAt, method };
  }

  /**
   * Merge a backup into local data. Never replaces blindly: for each id the
   * version with the newer updatedAt wins, so importing an old file cannot
   * overwrite newer local changes.
   */
  async function importBackup(fileOrText) {
    const text = typeof fileOrText === 'string' ? fileOrText : await fileOrText.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw fail('not-json', 'This file is not valid JSON.');
    }
    if (!data || typeof data !== 'object' || !Array.isArray(data.items)) {
      throw fail('not-backup', 'This file is not a backup (no items list).');
    }
    if (data.app !== app) {
      throw fail('wrong-app', `This backup belongs to "${data.app}", not "${app}".`);
    }
    const fileVersion = Number(data.schemaVersion) || 1;
    if (fileVersion > schemaVersion) {
      throw fail('newer-version', 'This backup was made by a newer version of the app. Update the app first, then import.');
    }
    let incoming = data.items;
    if (fileVersion < schemaVersion) incoming = migrate(incoming, fileVersion);

    const d = await db();
    const local = new Map((await all({ includeDeleted: true })).map((i) => [i.id, i]));
    const summary = { added: 0, updated: 0, unchanged: 0, keptLocal: 0, invalid: 0, migratedFrom: fileVersion < schemaVersion ? fileVersion : null, exportedAt: data.exportedAt };
    const toWrite = [];

    for (const item of incoming) {
      if (!item || typeof item.id !== 'string' || Number.isNaN(Date.parse(item.updatedAt)) || !validate(item)) {
        summary.invalid++;
        continue;
      }
      const clean = { ...item, deleted: !!item.deleted, createdAt: item.createdAt || item.updatedAt };
      const mine = local.get(item.id);
      if (!mine) {
        toWrite.push(clean);
        summary.added++;
      } else if (time(clean.updatedAt) > time(mine.updatedAt)) {
        toWrite.push(clean);
        summary.updated++;
      } else if (time(clean.updatedAt) < time(mine.updatedAt)) {
        summary.keptLocal++;
      } else {
        summary.unchanged++;
      }
    }

    // Written as-is: imported items keep their own updatedAt.
    const tx = d.transaction('items', 'readwrite');
    const os = tx.objectStore('items');
    toWrite.forEach((i) => os.put(i));
    await txDone(tx);
    await setMeta('lastImported', new Date().toISOString());
    return summary;
  }

  return { app, schemaVersion, all, get, put, putMany, remove, removeMany, getMeta, setMeta, exportBackup, importBackup };
}
