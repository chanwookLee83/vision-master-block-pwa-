import { db } from './db.js';

const TABLES = ['items', 'drawings', 'markers', 'sessions', 'readings'];

export async function exportAll() {
  const data = {};
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  return {
    app: 'vision-master-block-pwa',
    version: 1,
    exportedAt: new Date().toISOString(),
    data
  };
}

export async function downloadBackup() {
  const dump = await exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vmb-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// mode: 'merge' | 'replace'
export async function importAll(json, mode = 'merge') {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  const data = parsed.data || parsed;
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    if (mode === 'replace') {
      for (const t of TABLES) await db.table(t).clear();
      for (const t of TABLES) if (Array.isArray(data[t])) await db.table(t).bulkAdd(data[t]);
      return;
    }
    // merge: id 충돌을 피하려고 id 를 새로 부여하고 참조를 다시 연결
    const map = { items: {}, drawings: {}, sessions: {}, markers: {} };
    for (const row of data.items || []) {
      const { id, ...rest } = row;
      map.items[id] = await db.items.add(rest);
    }
    for (const row of data.drawings || []) {
      const { id, itemId, ...rest } = row;
      map.drawings[id] = await db.drawings.add({ ...rest, itemId: map.items[itemId] ?? itemId });
    }
    for (const row of data.markers || []) {
      const { id, itemId, drawingId, ...rest } = row;
      map.markers[id] = await db.markers.add({
        ...rest,
        itemId: map.items[itemId] ?? itemId,
        drawingId: map.drawings[drawingId] ?? drawingId
      });
    }
    for (const row of data.sessions || []) {
      const { id, itemId, ...rest } = row;
      map.sessions[id] = await db.sessions.add({ ...rest, itemId: map.items[itemId] ?? itemId });
    }
    for (const row of data.readings || []) {
      const { id, sessionId, markerId, ...rest } = row;
      await db.readings.add({
        ...rest,
        sessionId: map.sessions[sessionId] ?? sessionId,
        markerId: map.markers[markerId] ?? markerId
      });
    }
  });
}
