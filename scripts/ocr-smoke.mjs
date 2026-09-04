// OCR(치수 자동 읽기) 스모크. `npm run preview` (4173) 띄운 상태에서 실행.
import puppeteer from 'puppeteer-core';
import { writeFileSync, rmSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = process.env.SMOKE_URL || 'http://localhost:4173/';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1600 });
page.on('pageerror', (e) => console.log('  ! pageerror:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('  ! console.error:', m.text()); });

let failed = false;
const check = (c, msg) => { console.log((c ? '  ✓ ' : '  ✗ ') + msg); if (!c) failed = true; };

// 치수 텍스트가 그려진 도면 PNG 생성
const png = await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 900; c.height = 600;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#000'; x.strokeStyle = '#000'; x.lineWidth = 2;
  x.strokeRect(200, 220, 500, 160);
  x.font = '44px Arial';
  x.fillText('27.888\u00b10.02', 300, 160);
  x.font = '30px Arial';
  x.fillText('12.5 +0.05/-0.01', 300, 470);
  return c.toDataURL('image/png');
});
const tmp = new URL('./.ocr-smoke.png', import.meta.url);
writeFileSync(tmp, Buffer.from(png.split(',')[1], 'base64'));

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => indexedDB.deleteDatabase('vmb_measure'));
  await page.reload({ waitUntil: 'networkidle0' });

  await page.waitForSelector('.fab');
  await page.click('.fab');
  await page.waitForSelector('input[placeholder^="예: MB"]');
  await page.type('input[placeholder^="예: MB"]', 'OCR-TEST');
  await page.click('button.primary');
  await page.waitForFunction(() => location.hash.match(/#\/items\/\d+$/));

  const [chooser] = await Promise.all([page.waitForFileChooser(), page.click('button.primary.sm')]);
  await chooser.accept([tmp.pathname.slice(1)]);
  await page.waitForSelector('.canvas-box img');

  // 마커 추가 (치수 텍스트 위치)
  const box = await page.$('.canvas-box');
  const bb = await box.boundingBox();
  await box.click({ offset: { x: bb.width * 0.4, y: bb.height * 0.22 } });
  await page.waitForSelector('.side-list .m-row');
  check(true, '마커 생성');

  // 영역 지정 모드
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '치수 영역 지정').click();
  });
  await page.waitForSelector('.canvas-box.roi-mode');

  // "27.888±0.02" 주변을 드래그로 감싸기 (텍스트는 x300..560, y120..160 근처)
  const nb = await box.boundingBox();
  const x0 = nb.x + nb.width * (290 / 900), y0 = nb.y + nb.height * (120 / 600);
  const x1 = nb.x + nb.width * (610 / 900), y1 = nb.y + nb.height * (175 / 600);
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, { steps: 5 });
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.mouse.up();
  await page.waitForFunction(
    () => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('자동 읽기')),
    { timeout: 10000 }
  );
  check(true, '영역 지정 완료 → 자동 읽기 버튼 노출');
  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find((b) => b.textContent.includes('자동 읽기')).click();
  });
  await page.waitForFunction(
    () => [...document.querySelectorAll('.panel')].some((p) => p.textContent.includes('인식 텍스트')),
    { timeout: 60000 }
  );
  const resultText = await page.evaluate(
    () => [...document.querySelectorAll('.panel')].find((p) => p.textContent.includes('인식 텍스트')).textContent
  );
  console.log('    결과:', resultText.replace(/\s+/g, ' ').trim());
  check(/27\.?888/.test(resultText), 'OCR 이 27.888 인식');

  const applyBtn = await page.evaluateHandle(
    () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '이 값 적용')
  );
  if (applyBtn.asElement()) {
    await applyBtn.asElement().click();
    await new Promise((r) => setTimeout(r, 300));
    const nominal = await page.$eval('input[placeholder="예: 27.888"]', (e) => e.value);
    console.log('    적용된 기준치수:', nominal);
    check(Math.abs(Number(nominal) - 27.888) < 0.5, '기준치수 필드에 반영');
  } else {
    check(false, '"이 값 적용" 버튼 없음 (파싱 실패)');
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
