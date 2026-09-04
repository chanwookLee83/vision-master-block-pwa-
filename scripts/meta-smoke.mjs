// 단위/계측기 설정 + 전체 적용 + 측정화면 반영 스모크. preview(4173) 필요.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:4173/';
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1700 });
page.on('pageerror', (e) => console.log('  ! pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console.error:', m.text()); });

let failed = false;
const check = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) failed = true; };
const tmp = new URL('./.meta-smoke.png', import.meta.url);
writeFileSync(tmp, Buffer.from(PNG_1PX, 'base64'));

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => indexedDB.deleteDatabase('vmb_measure'));
  await page.reload({ waitUntil: 'networkidle0' });

  await page.waitForSelector('.fab');
  await page.click('.fab');
  await page.waitForSelector('input[placeholder^="예: MB"]');
  await page.type('input[placeholder^="예: MB"]', 'META-TEST');
  await page.click('button.primary');
  await page.waitForFunction(() => location.hash.match(/#\/items\/\d+$/));

  const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('button.primary.sm')]);
  await chooser.accept([tmp.pathname.slice(1)]);
  await page.waitForSelector('.canvas-box img');

  const box = await page.$('.canvas-box');
  const bb = await box.boundingBox();
  for (const fx of [0.3, 0.5, 0.7]) {
    await box.click({ offset: { x: bb.width * fx, y: bb.height * 0.4 } });
    await new Promise((r) => setTimeout(r, 150));
  }
  check((await page.$$('.side-list .m-row')).length === 3, '마커 3개');

  // 첫 마커 선택 후 단위/계측기 입력
  await page.click('.side-list .m-row');
  await page.waitForSelector('input[placeholder="예: 마이크로미터"]');
  const unitInp = await page.$('input[placeholder="mm"]');
  await unitInp.click({ clickCount: 3 });
  await unitInp.type('µm');
  await page.type('input[placeholder="예: 마이크로미터"]', '3차원측정기(CMM)');
  await new Promise((r) => setTimeout(r, 300));

  // 전체 적용
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('모든 번호에 적용')).click();
  });
  await new Promise((r) => setTimeout(r, 400));

  const dbMarkers = await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.open('vmb_measure');
    req.onsuccess = () => {
      req.result.transaction('markers').objectStore('markers').getAll().onsuccess = (e) =>
        resolve(e.target.result.map((m) => ({ no: m.no, unit: m.unit, gauge: m.gauge })));
    };
  }));
  console.log('    DB:', JSON.stringify(dbMarkers));
  check(dbMarkers.length === 3 && dbMarkers.every((m) => m.unit === 'µm' && m.gauge === '3차원측정기(CMM)'),
    '단위·계측기가 3개 번호 모두에 적용');

  // 주간 측정 화면에 반영되는지
  await page.evaluate(() => {
    [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('주간 측정')).click();
  });
  await page.waitForSelector('button.primary.sm');
  await page.click('button.primary.sm');
  await page.waitForFunction(() => location.hash.includes('/measure/'));
  await page.waitForSelector('.measure-table tbody tr');
  const capText = await page.$eval('.measure-cap', (e) => e.innerText.replace(/\s+/g, ' '));
  const rowText = await page.$eval('.measure-table tbody tr', (r) => r.innerText.replace(/\s+/g, ' '));
  console.log('    계측기 캡션:', capText, '| 측정행:', rowText);
  check(capText.includes('CMM') && capText.includes('µm'), '측정 화면에 계측기·단위 표시(캡션)');
  check(rowText.includes('µm'), '측정행 기준칸에 단위 표시');

  // 측정 시각 자동 기록
  const autoTime = await page.$eval('input[type="time"]', (e) => e.value);
  console.log('    자동 측정시각:', autoTime);
  check(/^\d{2}:\d{2}$/.test(autoTime), '측정 시각이 자동으로 채워짐');

  // 측정자 입력이 잘리지 않고 저장/유지되는지
  const insp = await page.$('input[placeholder="이름"]');
  await insp.type('홍길동 검사원');
  await new Promise((r) => setTimeout(r, 500));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('input[placeholder="이름"]');
  const inspAfter = await page.$eval('input[placeholder="이름"]', (e) => e.value);
  check(inspAfter === '홍길동 검사원', `측정자 입력 유지 ("${inspAfter}")`);

  // 데이터리스트 옵션에 사용자 계측기가 포함되는지 (새 품목에서)
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.fab');
} catch (e) {
  console.log('  ✗ 예외:', e.message);
  failed = true;
} finally {
  await browser.close();
}
console.log(failed ? '\n결과: 실패 ✗' : '\n결과: 통과 ✓');
process.exit(failed ? 1 : 0);
