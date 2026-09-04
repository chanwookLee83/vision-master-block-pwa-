// CSV/인쇄/설정 페이지 스모크. preview(4173) 필요.
import puppeteer from 'puppeteer-core';
import { writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:4173/';
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DL = new URL('./.dl', import.meta.url).pathname.slice(1);
if (existsSync(DL)) rmSync(DL, { recursive: true });
mkdirSync(DL, { recursive: true });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1700 });
page.on('pageerror', (e) => console.log('  ! pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console.error:', m.text()); });
const client = await page.target().createCDPSession();
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });

let failed = false;
const check = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) failed = true; };
const tmp = new URL('./.report-smoke.png', import.meta.url);
writeFileSync(tmp, Buffer.from(PNG_1PX, 'base64'));

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => indexedDB.deleteDatabase('vmb_measure'));
  await page.reload({ waitUntil: 'networkidle0' });

  // 설정 페이지
  await page.evaluate(() => { [...document.querySelectorAll('.topbar button')].find((b) => b.textContent.includes('설정')).click(); });
  await page.waitForFunction(() => location.hash.includes('/settings'));
  await page.waitForSelector('.panel h2');
  const settingsText = await page.$eval('.app', (e) => e.innerText);
  check(settingsText.includes('저장 위치') && settingsText.includes('백업'), '설정 페이지 렌더');
  check(settingsText.includes('폴더 선택') || settingsText.includes('지원하지 않습니다'), '폴더 저장 UI 노출');

  // 품목 + 도면 + 마커 + 세션
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.fab'); await page.click('.fab');
  await page.waitForSelector('input[placeholder^="예: MB"]');
  await page.type('input[placeholder^="예: MB"]', 'RPT-1');
  await page.type('input[placeholder="예: 5호기"]', '5호기');
  await page.click('button.primary');
  await page.waitForFunction(() => location.hash.match(/#\/items\/\d+$/));
  const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('button.primary.sm')]);
  await chooser.accept([tmp.pathname.slice(1)]);
  await page.waitForSelector('.canvas-box img');
  const box = await page.$('.canvas-box'); const bb = await box.boundingBox();
  await box.click({ offset: { x: bb.width * 0.5, y: bb.height * 0.5 } });
  await page.waitForSelector('.side-list .m-row');
  // 기준치수 입력
  await page.type('input[placeholder="예: 27.888"]', '10');
  await page.type('input[placeholder="예: 0.02"]', '0.05');
  await new Promise((r) => setTimeout(r, 300));

  await page.evaluate(() => { [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('주간 측정')).click(); });
  await page.waitForSelector('button.primary.sm'); await page.click('button.primary.sm');
  await page.waitForFunction(() => location.hash.includes('/measure/'));
  await page.waitForSelector('.measure-table tbody tr input');
  await (await page.$('.measure-table tbody tr input')).type('10.02');
  await new Promise((r) => setTimeout(r, 300));

  // CSV 저장 → 생성되는 Blob 내용을 가로채서 검증
  await page.evaluate(() => {
    window.__dl = [];
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = async function () {
      if (this.download) {
        const res = await fetch(this.href);
        window.__dl.push({ name: this.download, text: await res.text() });
      } else click.call(this);
    };
  });
  await page.evaluate(() => { [...document.querySelectorAll('.summary-row button')].find((b) => b.textContent.includes('CSV')).click(); });
  await new Promise((r) => setTimeout(r, 1500));
  const toastMsg = await page.$eval('.toast', (e) => e.textContent).catch(() => '(없음)');
  console.log('    토스트:', toastMsg);
  const cap = (await page.evaluate(() => window.__dl))[0];
  console.log('    CSV 파일명:', cap?.name);
  check(!!cap && /\.csv$/.test(cap.name || ''), 'CSV 파일 생성(다운로드)');
  check(!!cap && cap.text.includes('RPT-1') && cap.text.includes('측정값') && cap.text.includes('10.02'),
    'CSV 내용(품번·헤더·측정값)');

  // 인쇄 / PDF → 새 탭/팝업 없이 숨긴 iframe 에 인쇄 문서 주입 후 print()
  await page.evaluate(() => {
    window.HTMLIFrameElement.prototype.remove = function () {}; // cleanup 방지(내용 검증용)
  });
  const pagesBefore = (await browser.pages()).length;
  await page.evaluate(() => { [...document.querySelectorAll('.summary-row button')].find((b) => b.textContent.includes('인쇄')).click(); });
  await new Promise((r) => setTimeout(r, 800));
  check((await browser.pages()).length === pagesBefore, '팝업/새 탭 없이 인쇄');
  const printText = await page.evaluate(() => {
    const f = document.getElementById('vmb-print-frame');
    return f?.contentWindow?.document?.body?.innerText || '';
  });
  console.log('    인쇄문서:', printText.replace(/\s+/g, ' ').slice(0, 120));
  check(/성적서|측정/.test(printText) && printText.includes('RPT-1'), '인쇄 문서 내용');

  // 측정 이력 탭: 접힘 기본 + 열 머리글(주차/날짜/측정자)
  await page.bringToFront();
  await page.evaluate(() => { location.hash = location.hash.replace(/\/measure\/.*/, ''); });
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => { [...document.querySelectorAll('.tabs button')].find((b) => b.textContent.includes('측정 이력')).click(); });
  await page.waitForSelector('.collapse');
  const collapsedHidden = await page.evaluate(() => !document.querySelector('.collapse-body'));
  check(collapsedHidden, '이력 패널이 기본 접힘');
  await page.evaluate(() => document.querySelector('.collapse-toggle').click());
  await page.waitForSelector('.hist-col');
  const col = await page.$eval('.hist-col', (e) => e.innerText.replace(/\s+/g, ' '));
  console.log('    이력 열 머리글:', col);
  check(/\d{4}-\d{2}-\d{2}/.test(col), '이력 열 머리글에 날짜 표시');

  rmSync(tmp);
  rmSync(DL, { recursive: true });
} catch (e) {
  console.log('  ✗ 예외:', e.message);
  failed = true;
} finally {
  await browser.close();
}
console.log(failed ? '\n결과: 실패 ✗' : '\n결과: 통과 ✓');
process.exit(failed ? 1 : 0);
