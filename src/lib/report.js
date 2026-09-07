// 측정 데이터 → CSV / 인쇄용 HTML 생성.
import { judge, limitsOf, deviationOf, tolText, fmt } from './tol.js';

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const csvCell = (s) => {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const csvBlob = (lines) =>
  new Blob(['﻿' + lines.map((r) => r.map(csvCell).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  });

// ---- 세션(주간 측정 1회) ----

export function sessionCsv(item, session, markers, valueOf) {
  const head = ['No', '치수이름', '기준치수', '단위', '계측기', '공차', '하한', '상한', '측정값', '편차', '판정'];
  const meta = [
    ['품번', item.partNo || ''], ['품명', item.partName || ''], ['호기', item.machineNo || ''],
    ['주차', session.weekKey || ''], ['측정일', session.date || ''], ['측정시각', session.time || ''],
    ['측정자', session.inspector || ''], ['비고', session.note || ''],
  ];
  const lines = [...meta, [], head];
  for (const m of markers) {
    const lim = limitsOf(m) || {};
    const v = valueOf(m.id);
    lines.push([
      m.no, m.name || '', m.nominal ?? '', m.unit || 'mm', m.gauge || '', tolText(m),
      lim.lo ?? '', lim.hi ?? '', v ?? '', deviationOf(m, v) ?? '', judge(m, v) ?? '',
    ]);
  }
  return csvBlob(lines);
}

export function sessionReportHtml(item, session, markers, valueOf) {
  const rows = markers.map((m) => {
    const lim = limitsOf(m);
    const v = valueOf(m.id);
    const j = judge(m, v);
    const dev = deviationOf(m, v);
    return `<tr class="${j === 'NG' ? 'ng' : j === 'OK' ? 'ok' : ''}">
      <td>${m.no}</td>
      <td>${esc(m.name || '-')}</td>
      <td>${esc(m.gauge || '-')}</td>
      <td class="n">${fmt(m.nominal)} ${esc(m.unit || 'mm')}</td>
      <td class="n">${esc(tolText(m))}</td>
      <td class="n">${lim ? `${fmt(lim.lo)} ~ ${fmt(lim.hi)}` : '-'}</td>
      <td class="n b">${v === '' || v == null ? '-' : fmt(v, 4)}</td>
      <td class="n">${dev == null ? '' : (dev > 0 ? '+' : '') + fmt(dev)}</td>
      <td class="j">${j || '-'}</td>
    </tr>`;
  }).join('');

  const results = markers.map((m) => judge(m, valueOf(m.id)));
  const okN = results.filter((r) => r === 'OK').length;
  const ngN = results.filter((r) => r === 'NG').length;
  const blankN = results.filter((r) => r === null).length;

  const body = `
    <h1>주간 치수 측정 성적서</h1>
    <table class="meta">
      <tr><th>품번</th><td>${esc(item.partNo || '-')}</td><th>호기</th><td>${esc(item.machineNo || '-')}</td></tr>
      <tr><th>품명</th><td>${esc(item.partName || '-')}</td><th>주차</th><td>${esc(session.weekKey || '-')}</td></tr>
      <tr><th>측정일</th><td>${esc(session.date || '-')} ${esc(session.time || '')}</td><th>측정자</th><td>${esc(session.inspector || '-')}</td></tr>
      ${session.note ? `<tr><th>비고</th><td colspan="3">${esc(session.note)}</td></tr>` : ''}
    </table>
    <div class="summary">
      <span>전체 <b>${markers.length}</b></span>
      <span class="ok">OK <b>${okN}</b></span>
      <span class="ng">NG <b>${ngN}</b></span>
      <span>미입력 <b>${blankN}</b></span>
      <span class="verdict ${ngN ? 'ng' : okN ? 'ok' : ''}">${ngN ? '불합격' : okN ? '합격' : '-'}</span>
    </div>
    <table class="data">
      <thead><tr>
        <th>No</th><th>치수 이름</th><th>계측기</th><th>기준치수</th><th>공차</th>
        <th>합격범위</th><th>측정값</th><th>편차</th><th>판정</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return printDoc(`측정성적서_${item.partNo || ''}_${session.weekKey || session.date || ''}`, body);
}

// ---- 이력(번호 × 주차) ----

export function historyCsv(item, markers, sessions, cellVal) {
  const colLabel = (s) => {
    const sub = [s.date, s.time, s.inspector].filter(Boolean).join(' ');
    return (s.weekKey || s.date || '') + (sub ? ` (${sub})` : '');
  };
  const head = ['No', '치수이름', '기준치수', '단위', '계측기', '공차', ...sessions.map(colLabel)];
  const lines = [
    ['품번', item.partNo || ''], ['품명', item.partName || ''], ['호기', item.machineNo || ''], [], head,
  ];
  for (const m of markers) {
    const row = [m.no, m.name || '', m.nominal ?? '', m.unit || 'mm', m.gauge || '', tolText(m)];
    for (const s of sessions) {
      const v = cellVal(s.id, m.id);
      row.push(v == null || v === '' ? '' : v);
    }
    lines.push(row);
  }
  return csvBlob(lines);
}

export function historyReportHtml(item, markers, sessions, cellVal) {
  const rows = markers.map((m) => {
    const lim = limitsOf(m);
    const cells = sessions.map((s) => {
      const v = cellVal(s.id, m.id);
      const j = judge(m, v);
      return `<td class="n ${j === 'NG' ? 'ng' : j === 'OK' ? 'ok' : ''}">${v == null || v === '' ? '·' : fmt(v, 4)}</td>`;
    }).join('');
    return `<tr>
      <td>${m.no}</td><td>${esc(m.name || '-')}</td>
      <td class="n">${fmt(m.nominal)} ${esc(m.unit || 'mm')}</td>
      <td class="n">${esc(tolText(m))}</td>
      <td class="n">${lim ? `${fmt(lim.lo)}~${fmt(lim.hi)}` : '-'}</td>
      ${cells}
    </tr>`;
  }).join('');

  const body = `
    <h1>치수 측정 이력</h1>
    <table class="meta">
      <tr><th>품번</th><td>${esc(item.partNo || '-')}</td><th>품명</th><td>${esc(item.partName || '-')}</td><th>호기</th><td>${esc(item.machineNo || '-')}</td></tr>
    </table>
    <table class="data">
      <thead><tr>
        <th>No</th><th>치수 이름</th><th>기준</th><th>공차</th><th>합격범위</th>
        ${sessions.map((s) => `<th>${esc(s.weekKey || '-')}<br><span class="hc">${esc([s.date, s.time].filter(Boolean).join(' ') || '-')}</span><br><span class="hc">${esc(s.inspector || '-')}</span></th>`).join('')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  return printDoc(`측정이력_${item.partNo || ''}`, body);
}

// ---- 공통 ----

function printDoc(title, body) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.5 "Malgun Gothic","Apple SD Gothic Neo",sans-serif; color:#111; margin:24px; }
  h1 { font-size:18px; margin:0 0 12px; }
  table { border-collapse:collapse; width:100%; margin-bottom:14px; }
  th,td { border:1px solid #999; padding:5px 7px; text-align:left; }
  table.meta th { background:#f0f0f0; width:80px; white-space:nowrap; }
  table.data thead th { background:#eee; text-align:center; font-size:11px; }
  table.data thead th .hc { font-weight:400; color:#555; font-size:10px; }
  td.n { text-align:right; font-variant-numeric:tabular-nums; }
  td.b { font-weight:700; }
  td.j { text-align:center; font-weight:700; }
  tr.ng td { background:#fdecea; }
  tr.ng td.j { color:#c0392b; }
  tr.ok td.j { color:#1e7e34; }
  td.n.ng { background:#fdecea; color:#c0392b; font-weight:700; }
  td.n.ok { background:#eaf6ec; }
  .summary { display:flex; gap:16px; margin:8px 0 14px; font-size:13px; }
  .summary .ok b { color:#1e7e34; } .summary .ng b { color:#c0392b; }
  .summary .verdict { margin-left:auto; padding:2px 12px; border:1px solid #999; font-weight:700; }
  .summary .verdict.ok { background:#eaf6ec; color:#1e7e34; }
  .summary .verdict.ng { background:#fdecea; color:#c0392b; }
  footer { margin-top:16px; font-size:11px; color:#666; }
  @media print { body { margin:12mm; } @page { size:A4 landscape; margin:12mm; } }
</style></head><body>
${body}
<footer>생성: ${new Date().toLocaleString('ko-KR')} · 측정관리 이력관리 시스템</footer>
</body></html>`;
}

// 숨긴 iframe 에 인쇄용 문서를 넣고 인쇄 대화상자 표시 (PDF로 저장 가능).
// 설치형 PWA(standalone)에서 window.open 이 차단/백지로 깨지는 문제를 피한다.
export function openPrint(html) {
  if (typeof document === 'undefined') return false;

  document.getElementById('vmb-print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'vmb-print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
  document.body.appendChild(frame);

  const cleanup = () => frame.remove();

  let printed = false;
  const go = () => {
    if (printed) return;
    printed = true;
    const win = frame.contentWindow;
    if (!win) return cleanup();
    win.focus();
    // 인쇄가 끝나거나 취소되면 프레임 정리 (afterprint 미지원 환경 대비 타이머 백업)
    win.addEventListener?.('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 60000);
    win.print();
  };

  frame.onload = () => setTimeout(go, 200);
  const doc = frame.contentWindow?.document;
  if (!doc) { cleanup(); return false; }
  doc.open();
  doc.write(html);
  doc.close();
  // srcdoc 없이 document.write 만으로는 load 가 안 뜰 수 있어 준비 상태도 확인
  if (doc.readyState === 'complete') setTimeout(go, 200);
  return true;
}
