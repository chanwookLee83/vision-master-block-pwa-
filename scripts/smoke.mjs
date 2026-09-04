// 핵심 플로우 브라우저 스모크 테스트. `npm run preview` 를 4173 에 띄운 상태에서 실행.
import puppeteer from 'puppeteer-core';

const CHROME =
  process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:4173/';

// 1x1 투명 PNG (도면 업로드용 더미)
const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const log = (...a) => console.log('•', ...a);
let failed = false;
const check = (cond, msg) => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + msg);
  if (!cond) failed = true;
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1800 });
page.on('pageerror', (e) => { console.log('  ! pageerror:', e.message); failed = true; });
page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console.error:', m.text()); });

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => indexedDB.deleteDatabase('vmb_measure'));
  await page.reload({ waitUntil: 'networkidle0' });

  log('품목 등록');
  await page.waitForSelector('.fab');
  await page.click('.fab');
  await page.waitForSelector('input[placeholder^="예: MB"]');
  await page.type('input[placeholder^="예: MB"]', 'MB-5-VISION');
  await page.type('input[placeholder="예: 5호기"]', '5호기');
  await page.type('input[placeholder="예: Master Block Vision"]', 'Master Block Vision');
  await page.click('button.primary');
  await page.waitForFunction(() => location.hash.match(/#\/items\/\d+$/));
  check(true, '품목 생성 후 상세로 이동');

  log('도면 업로드');
  const [chooser] = await Promise.all([
    page.waitForFileChooser(),
    page.click('button.primary.sm')
  ]);
  const buf = Buffer.from(PNG_1PX, 'base64');
  const tmp = new URL('./.smoke.png', import.meta.url);
  const { writeFileSync, rmSync } = await import('node:fs');
  writeFileSync(tmp, buf);
  await chooser.accept([tmp.pathname.slice(1)]);
  await page.waitForSelector('.canvas-box img');
  check(true, '도면 캔버스 표시');

  log('마커 3개 추가 (캔버스 클릭)');
  const box = await page.$('.canvas-box');
  await box.scrollIntoView();
  const bb = await box.boundingBox();
  for (const [fx, fy] of [[0.3, 0.4], [0.5, 0.4], [0.7, 0.4]]) {
    await box.click({ offset: { x: bb.width * fx, y: bb.height * fy } });
    await new Promise((r) => setTimeout(r, 150));
  }
  const markerCount = await page.$$eval('.canvas-box .marker', (els) => els.length);
  check(markerCount === 3, `마커 3개 생성됨 (실제 ${markerCount})`);

  log('선택 마커에 기준치수/공차 입력');
  await page.click('.canvas-box .marker');
  await page.waitForSelector('input[placeholder="예: 27.888"]');
  await page.type('input[placeholder="예: 27.888"]', '27.888');
  await page.type('input[placeholder="예: 0.02"]', '0.02');
  await new Promise((r) => setTimeout(r, 300));

  log('치수표 탭 확인');
  await page.evaluate(() => {
    [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('치수표')).click();
  });
  await page.waitForSelector('table');
  const rangeText = await page.$$eval('tbody tr td', (tds) => tds.map((t) => t.textContent).join('|'));
  check(rangeText.includes('27.868') && rangeText.includes('27.908'), '합격범위 27.868~27.908 계산');

  log('주간 측정 시작');
  await page.evaluate(() => {
    [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('주간 측정')).click();
  });
  await page.waitForSelector('button.primary.sm');
  await page.click('button.primary.sm');
  await page.waitForFunction(() => location.hash.includes('/measure/'));

  log('측정값 입력 → OK / NG 판정 (마커 1번, 기준 27.888 ±0.02)');
  await page.waitForSelector('.measure-table tbody tr input');
  const rowText = async () =>
    page.$eval('.measure-table tbody tr', (r) =>
      [...r.querySelectorAll('td')].map((t) => (t.querySelector('input') ? '[' + t.querySelector('input').value + ']' : t.textContent)).join(' | ')
    );
  const firstInput = async () => (await page.$$('.measure-table tbody tr input'))[0];

  let inp = await firstInput();
  await inp.type('27.9'); // 범위 안 → OK
  await new Promise((r) => setTimeout(r, 300));
  console.log('    ', await rowText());
  check((await rowText()).includes('OK'), 'OK 판정 표시 (27.9)');

  inp = await firstInput();
  await inp.click({ clickCount: 3 });
  await inp.type('27.95'); // 범위 밖 → NG
  await new Promise((r) => setTimeout(r, 300));
  console.log('    ', await rowText());
  check((await rowText()).includes('NG'), 'NG 판정 표시 (27.95)');
  const ngStat = await page.$eval('.stat.ng .v', (e) => e.textContent);
  check(Number(ngStat) >= 1, `NG 요약 카운트 ${ngStat}`);

  log('새로고침 후 데이터 유지 (IndexedDB)');
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.item-card');
  const cardText = await page.$eval('.item-card', (e) => e.textContent);
  check(cardText.includes('MB-5-VISION'), '새로고침 후 품목 유지');

  rmSync(tmp);
} catch (e) {
  console.log('  ✗ 예외:', e.message);
  failed = true;
} finally {
  await browser.close();
}

console.log(failed ? '\n결과: 실패 ✗' : '\n결과: 통과 ✓');
process.exit(failed ? 1 : 0);
