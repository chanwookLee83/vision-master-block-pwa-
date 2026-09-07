// 측정 데이터 저장 위치 관리.
// File System Access API 로 사용자가 지정한 폴더(로컬 또는 네트워크 드라이브로
// 연결된 파일서버 폴더)에 파일을 직접 쓴다. 미지원 브라우저(Firefox/Safari)는
// 일반 다운로드로 대체한다.
//
// FileSystemDirectoryHandle 은 Dexie 를 거치면 저장에 실패하므로(불투명 객체)
// 전용 IndexedDB(vmb_fs)에 raw API 로 직접 보관한다.

const DB = 'vmb_fs';
const STORE = 'handles';
const KEY = 'saveDir';
// v1 은 스토어가 없는 상태로 생성되는 경우가 있어(초기 배포 버그) v2 로 올리고
// onupgradeneeded 에서 스토어 존재를 강제한다.
const DB_VERSION = 2;

export const fsSupported = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

function openHandleDb() {
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // 어떤 이유로든 스토어가 없으면 DB 를 지우고 한 번 더 만든다.
        db.close();
        const del = indexedDB.deleteDatabase(DB);
        del.onsuccess = del.onerror = () => openHandleDb().then(resolve, reject);
        return;
      }
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB 열기 실패'));
    req.onblocked = () => reject(new Error('다른 탭이 저장소를 사용 중입니다. 다른 탭을 닫고 다시 시도하세요.'));
  });
}
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('트랜잭션 오류'));
    tx.onabort = () => reject(tx.error || new Error('저장이 중단되었습니다'));
  });
}
async function idbPut(key, value) {
  const db = await openHandleDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key); // 클론 불가 시 여기서 동기 throw
    await txDone(tx);
  } finally {
    db.close();
  }
}
async function idbGet(key) {
  const db = await openHandleDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
async function idbDelete(key) {
  const db = await openHandleDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(key);
    await txDone(tx);
  } finally {
    db.close();
  }
}

// 폴더 선택 (사용자 제스처 필요). 성공 시 핸들을 저장.
// 취소하면 AbortError 를 그대로 던지고, 그 외 오류는 호출부에서 표시할 것.
export async function pickSaveDir() {
  const handle = await window.showDirectoryPicker({ id: 'vmb-save', mode: 'readwrite' });
  await idbPut(KEY, handle);
  return handle;
}

// 핸들에 readwrite 권한 확보. 사용자 제스처 안에서 호출해야 requestPermission 이 먹는다.
// 반환: 'granted' | 'denied' | 'prompt'
export async function ensurePermission(handle) {
  if (typeof handle.requestPermission !== 'function') return 'granted'; // OPFS 등
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return 'granted';
  return handle.requestPermission(opts);
}

// 폴더에 실제로 파일을 쓸 수 있는지 검사(네트워크 드라이브 · 동기화 폴더 · 권한 문제 조기 발견).
// 성공 시 null, 실패 시 사람이 읽을 수 있는 사유 문자열.
export async function probeDir(handle) {
  const name = `.vmb-쓰기테스트-${Date.now()}.tmp`;
  try {
    const fh = await handle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write('ok');
    await w.close();
    await handle.removeEntry(name).catch(() => {});
    return null;
  } catch (err) {
    await handle.removeEntry(name).catch(() => {});
    return `${err.name || 'Error'} — ${err.message || err}`;
  }
}

// 이미 얻은 핸들만 저장 (Settings 에서 단계별 오류 표시용)
export async function stashSaveDir(handle) {
  await idbPut(KEY, handle);
}

export async function forgetSaveDir() {
  await idbDelete(KEY);
}

// 권한과 무관하게 저장된 폴더 핸들 (없으면 null)
export async function getSaveDirHandle() {
  const handle = await idbGet(KEY);
  return handle && typeof handle.getFileHandle === 'function' ? handle : null;
}

// 쓰기 권한이 확인된 핸들만 반환. prompt=true 면 권한 요청(사용자 제스처 필요).
export async function getSaveDir({ prompt = false } = {}) {
  const handle = await getSaveDirHandle();
  if (!handle) return null;
  // 권한 API 가 없는 핸들(OPFS 등)은 그대로 사용 가능
  if (typeof handle.queryPermission !== 'function') return handle;
  try {
    let perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted' && prompt) {
      perm = await handle.requestPermission({ mode: 'readwrite' });
    }
    return perm === 'granted' ? handle : null;
  } catch {
    return null;
  }
}

export async function saveDirName() {
  const handle = await getSaveDirHandle();
  return handle ? handle.name : null;
}

// 폴더에 파일 쓰기 (같은 이름이면 덮어씀).
export async function writeToDir(handle, filename, contents) {
  const fileHandle = await handle.getFileHandle(filename, { create: true });
  const w = await fileHandle.createWritable();
  await w.write(contents);
  await w.close();
}

// 브라우저 기본 다운로드.
export function download(filename, contents, type = 'application/octet-stream') {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 지정 폴더가 있으면 그곳에 저장, 없으면 다운로드.
 * 반환: { ok, target: 'folder'|'download', dir?: string, error? }
 */
export async function saveFile(filename, contents, type = 'application/octet-stream') {
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type });
  if (fsSupported()) {
    const dir = await getSaveDir({ prompt: true });
    if (dir) {
      try {
        await writeToDir(dir, filename, blob);
        return { ok: true, target: 'folder', dir: dir.name };
      } catch (e) {
        return { ok: false, target: 'folder', error: e.message };
      }
    }
  }
  download(filename, blob);
  return { ok: true, target: 'download' };
}

// 파일명에 못 쓰는 문자 정리
export const safeName = (s) => (s || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'vmb';

// dataURL → Blob
export function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(b64 || '');
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
