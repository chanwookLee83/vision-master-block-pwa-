import Dexie from 'dexie';

// 로컬 전용 저장소 (IndexedDB). 서버 없음.
export const db = new Dexie('vmb_measure');

db.version(1).stores({
  // 품목: 품번 / 품명 / 호기
  items: '++id, partNo, machineNo, createdAt',
  // 도면 이미지 (품목당 여러 장: Vision#1, Vision#2 ...)
  drawings: '++id, itemId, sort',
  // 치수 항목 = 도면에 지정한 번호. 기준치수 + 공차(상/하한)
  markers: '++id, itemId, drawingId, no',
  // 주간 측정 세션
  sessions: '++id, itemId, weekKey, date',
  // 측정값 (세션 × 마커)
  readings: '++id, sessionId, markerId, [sessionId+markerId]'
});

// v2: 앱 설정 (저장 폴더 핸들, 자동 저장 옵션 등). key 로 조회.
db.version(2).stores({
  settings: 'key'
});

// ---- 설정 ----
export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key);
  return row ? row.value : fallback;
}
export async function setSetting(key, value) {
  return db.settings.put({ key, value });
}
export async function deleteSetting(key) {
  return db.settings.delete(key);
}

// ---- 품목 ----
export async function createItem(data) {
  const now = new Date().toISOString();
  return db.items.add({ partNo: '', partName: '', machineNo: '', note: '', ...data, createdAt: now, updatedAt: now });
}
export async function updateItem(id, patch) {
  return db.items.update(id, { ...patch, updatedAt: new Date().toISOString() });
}
export async function deleteItem(id) {
  const drawings = await db.drawings.where('itemId').equals(id).toArray();
  const markers = await db.markers.where('itemId').equals(id).toArray();
  const sessions = await db.sessions.where('itemId').equals(id).toArray();
  const sessionIds = sessions.map((s) => s.id);
  await db.transaction('rw', db.items, db.drawings, db.markers, db.sessions, db.readings, async () => {
    await db.readings.where('sessionId').anyOf(sessionIds).delete();
    await db.sessions.where('itemId').equals(id).delete();
    await db.markers.where('itemId').equals(id).delete();
    await db.drawings.where('itemId').equals(id).delete();
    await db.items.delete(id);
  });
  void drawings; void markers;
}

// ---- 도면 ----
export async function addDrawing(itemId, name, dataUrl, w, h) {
  const count = await db.drawings.where('itemId').equals(itemId).count();
  return db.drawings.add({ itemId, name: name || `도면 ${count + 1}`, dataUrl, w, h, sort: count });
}
export async function deleteDrawing(id) {
  await db.transaction('rw', db.drawings, db.markers, async () => {
    await db.markers.where('drawingId').equals(id).delete();
    await db.drawings.delete(id);
  });
}

// ---- 마커(치수 번호) ----
export async function addMarker(itemId, drawingId, xr, yr) {
  const existing = await db.markers.where('itemId').equals(itemId).toArray();
  const no = existing.length ? Math.max(...existing.map((m) => m.no)) + 1 : 1;
  // 직전 마커의 단위/계측기를 이어받아 기본값으로 (연속 입력 편의)
  const prev = existing.sort((a, b) => b.no - a.no)[0];
  return db.markers.add({
    itemId, drawingId, no, xr, yr,
    name: '', nominal: null, tolMode: 'sym', tolUpper: 0.02, tolLower: -0.02,
    unit: prev?.unit || 'mm', gauge: prev?.gauge || '',
    roi: null // 치수 자동 읽기용 영역 {xr,yr,wr,hr}
  });
}
export async function updateMarker(id, patch) {
  return db.markers.update(id, patch);
}
// 품목의 모든 번호에 단위/계측기를 일괄 적용
export async function applyMarkerMeta(itemId, patch) {
  const clean = {};
  if (patch.unit != null) clean.unit = patch.unit;
  if (patch.gauge != null) clean.gauge = patch.gauge;
  return db.markers.where('itemId').equals(itemId).modify(clean);
}
export async function deleteMarker(id) {
  await db.transaction('rw', db.markers, db.readings, async () => {
    await db.readings.where('markerId').equals(id).delete();
    await db.markers.delete(id);
  });
}

// ---- 측정 세션 ----
export async function createSession(itemId, data) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return db.sessions.add({
    itemId, weekKey: '', date: '', time, inspector: '', note: '',
    createdAt: now.toISOString(), ...data
  });
}
export async function deleteSession(id) {
  await db.transaction('rw', db.sessions, db.readings, async () => {
    await db.readings.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

// ---- 측정값 ----
export async function setReading(sessionId, markerId, value) {
  const row = await db.readings.where('[sessionId+markerId]').equals([sessionId, markerId]).first();
  if (row) return db.readings.update(row.id, { value });
  return db.readings.add({ sessionId, markerId, value });
}
