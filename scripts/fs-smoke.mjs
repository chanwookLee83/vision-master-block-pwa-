// 저장 폴더(File System Access) 지정·유지·쓰기 스모크. preview 필요.
// 실제 폴더 선택 대화상자는 자동화가 안 되므로 showDirectoryPicker 를
// OPFS 하위 폴더 핸들로 대체해 앱의 저장 경로 로직을 그대로 검증한다.
import puppeteer from 'puppeteer-core';
import { writeFileSync, rmSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:4173/';
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('  ! pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console.error:', m.text()); });

let failed = false;
const check = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) failed = true; };
const tmp = new URL('./.fs-smoke.png', import.meta.url);
writeFileSync(tmp, Buffer.from(PNG_1PX, 'base64'));

// showDirectoryPicker 는 자동화 불가 → OPFS 하위 폴더 핸들에
// 실제 디렉터리 핸들처럼 queryPermission/requestPermission 을 덧씌워
// 권한 분기(ensurePermission·getSaveDir)까지 검증한다.
await page.evaluateOnNewDocument(() => {
  window.__permState = 'granted'; // 테스트에서 조정 가능
  window.showDirectoryPicker = async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('vmb-측정저장', { create: true });
    dir.queryPermission = async () => window.__permState;
    dir.requestPermission = async () => (window.__permState = 'granted');
    return dir;
  };
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => { indexedDB.deleteDatabase('vmb_measure'); indexedDB.deleteDatabase('vmb_fs'); });
  await page.goto(BASE, { waitUntil: 'networkidle0' });

  // 설정 → 폴더 지정
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForSelector('.panel');
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /폴더 선택|폴더 변경/.test(b.textContent)).click());
  await new Promise((r) => setTimeout(r, 1200));
  let f = await page.$eval('.field', (e) => e.innerText).catch(() => '');
  check(f.includes('vmb-측정저장') && f.includes('연결됨'), '폴더 지정 → "연결됨" 표시');

  // 새로고침 후 유지
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => { location.hash = '#/settings'; });
  await new Promise((r) => setTimeout(r, 500));
  f = await page.$eval('.field', (e) => e.innerText).catch(() => '');
  check(f.includes('vmb-측정저장'), '새로고침 후 폴더 유지');

  // 자동 저장 켜기
  await page.evaluate(() => document.querySelector('input[type=checkbox]').click());
  await new Promise((r) => setTimeout(r, 300));

  // 품목 + 도면 + 마커 + 세션 + 측정 + 완료
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.fab'); await page.click('.fab');
  await page.waitForSelector('input[placeholder^="예: MB"]');
  await page.type('input[placeholder^="예: MB"]', 'FS-1');
  await page.type('input[placeholder="예: 5호기"]', '3호기');
  await page.click('button.primary');
  await page.waitForFunction(() => location.hash.match(/#\/items\/\d+$/));
  const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('button.primary.sm')]);
  await chooser.accept([tmp.pathname.slice(1)]);
  await page.waitForSelector('.canvas-box img');
  const box = await page.$('.canvas-box'); const bb = await box.boundingBox();
  await box.click({ offset: { x: bb.width * 0.5, y: bb.height * 0.5 } });
  await page.waitForSelector('.side-list .m-row');
  await page.type('input[placeholder="예: 27.888"]', '10');
  await page.type('input[placeholder="예: 0.02"]', '0.05');
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('주간 측정')).click());
  await page.waitForSelector('button.primary.sm'); await page.click('button.primary.sm');
  await page.waitForFunction(() => location.hash.includes('/measure/'));
  await page.waitForSelector('.measure-table tbody tr input');
  await (await page.$('.measure-table tbody tr input')).type('10.02');
  await new Promise((r) => setTimeout(r, 300));

  // CSV 저장 (폴더로)
  await page.evaluate(() => [...document.querySelectorAll('.summary-row button')].find((b) => b.textContent.includes('CSV')).click());
  await new Promise((r) => setTimeout(r, 1000));
  check((await page.$eval('.toast', (e) => e.textContent).catch(() => '')).includes('폴더에 저장'), 'CSV → 폴더에 저장 토스트');

  // 완료 → 자동 저장
  await page.evaluate(() => [...document.querySelectorAll('.btn-row button')].find((b) => b.textContent.trim() === '완료').click());
  await page.waitForFunction(() => location.hash.match(/#\/items\/\d+$/));
  await new Promise((r) => setTimeout(r, 800));

  // OPFS 폴더 내용 확인
  const files = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('vmb-측정저장');
    const names = [];
    for await (const [name] of dir.entries()) names.push(name);
    return names;
  });
  console.log('    폴더 파일:', JSON.stringify(files));
  check(files.some((n) => n.endsWith('.csv')), '폴더에 CSV 파일 생성');
  check(files.some((n) => n.includes('backup') || n.includes('백업')), '폴더에 백업 JSON 생성(완료 자동저장)');
  const csvName = files.find((n) => n.endsWith('.csv'));
  if (csvName) {
    const body = await page.evaluate(async (nm) => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('vmb-측정저장');
      const fh = await dir.getFileHandle(nm);
      return (await fh.getFile()).text();
    }, csvName);
    check(body.includes('FS-1') && body.includes('10.02'), 'CSV 내용 정상');
  }

  rmSync(tmp);
} catch (e) {
  console.log('  ✗ 예외:', e.message);
  failed = true;
} finally {
  await browser.close();
}
console.log(failed ? '\n결과: 실패 ✗' : '\n결과: 통과 ✓');
process.exit(failed ? 1 : 0);
