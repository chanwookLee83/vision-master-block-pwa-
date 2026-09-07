// 관리자 비밀번호. 평문은 저장하지 않고 SHA-256(salt:pw) 해시만 settings 에 보관.
// 이 브라우저(IndexedDB)에만 저장되므로 분실 시 복구 불가 — 백업 복원 필요.
import { getSetting, setSetting, deleteSetting } from './db.js';

const KEY = 'adminPassword';

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function digest(salt, pw) {
  const data = new TextEncoder().encode(`${salt}:${pw}`);
  return hex(await crypto.subtle.digest('SHA-256', data));
}
const randomSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));

export async function hasAdminPassword() {
  const rec = await getSetting(KEY);
  return !!(rec && rec.salt && rec.hash);
}

export async function setAdminPassword(pw) {
  const salt = randomSalt();
  await setSetting(KEY, { salt, hash: await digest(salt, pw), setAt: new Date().toISOString() });
}

export async function verifyAdminPassword(pw) {
  const rec = await getSetting(KEY);
  if (!rec || !rec.hash) return true; // 미설정이면 통과
  return (await digest(rec.salt, pw)) === rec.hash;
}

// 현재 비밀번호가 맞아야 해제 성공.
export async function clearAdminPassword(currentPw) {
  if (!(await verifyAdminPassword(currentPw))) return false;
  await deleteSetting(KEY);
  return true;
}

// 되돌릴 수 없는 작업 전에 호출. 통과(또는 미설정)면 true.
export async function requireAdmin(actionLabel = '이 작업') {
  if (!(await hasAdminPassword())) return true;
  const pw = window.prompt(`${actionLabel}은(는) 관리자 전용입니다.\n관리자 비밀번호를 입력하세요:`);
  if (pw == null) return false; // 취소
  if (await verifyAdminPassword(pw)) return true;
  window.alert('비밀번호가 올바르지 않습니다.');
  return false;
}
