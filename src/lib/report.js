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

// 성적서에 넣을 도면 이미지(+ 번호 마커) 블록.
// markClassOf(marker) → '' | 'ok' | 'warn' | 'ng' (마커 색)
function drawingsHtml(drawings, markers, markClassOf, heading = '도면') {
  if (!drawings || !drawings.length) return '';
  const blocks = drawings
    .filter((d) => d && d.dataUrl)
    .map((d) => {
      const dots = markers
        .filter((m) => m.drawingId === d.id)
        .map((m) => {
          const cls = (markClassOf ? markClassOf(m) : '') || '';
          return `<span class="mk${cls ? ' ' + cls : ''}" style="left:${(m.xr ?? 0) * 100}%;top:${(m.yr ?? 0) * 100}%">${esc(m.no)}</span>`;
        })
        .join('');
      return `<figure class="dwg">
        <figcaption>${esc(d.name || '도면')}</figcaption>
        <div class="dwg-wrap"><img src="${d.dataUrl}" alt="">${dots}</div>
      </figure>`;
    })
    .join('');
  return blocks ? `<h2 class="dwg-h">${esc(heading)}</h2><div class="dwgs">${blocks}</div>` : '';
}

export function sessionReportHtml(item, session, markers, valueOf, drawings = []) {
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

  const markCls = (m) => {
    const j = judge(m, valueOf(m.id));
    return j === 'NG' ? 'ng' : j === 'OK' ? 'ok' : '';
  };
  const body = `
    <h1>주간 치수 측정 성적서</h1>
    ${drawingsHtml(drawings, markers, markCls)}
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

// ---- 공정능력(Cpk) ----

const n2 = (v, d = 2) =>
  v == null || !isFinite(v) ? (v === Infinity ? '∞' : '-') : Number(v).toFixed(d);
const gcls = { 상: 'ok', 일치: 'ok', 중: 'warn', 주의: 'warn', 하: 'ng', 불일치: 'ng' };

// rows: [{ m, r }] (r = cpkOf 결과 또는 null), info: {periodLabel, sessionCount, dateSpan, weeks[]}
export function cpkReportHtml(item, rows, crit, info = {}, drawings = []) {
  const markers = rows.map((x) => x.m);
  const gByMid = Object.fromEntries(rows.map((x) => [x.m.id, x.r?.grade]));
  const cnt = (g) => rows.filter((x) => x.r && x.r.grade === g).length;

  const tr = rows.map(({ m, r }) => {
    if (!r) {
      return `<tr><td>${m.no}</td><td>${esc(m.name || '-')}</td><td class="n" colspan="6">공차(기준치수) 없음</td></tr>`;
    }
    return `<tr class="${r.grade === '하' ? 'ng' : r.grade === '중' ? 'warn' : ''}">
      <td>${m.no}</td><td>${esc(m.name || '-')}</td>
      <td class="n">${fmt(r.lsl, 4)} ~ ${fmt(r.usl, 4)}</td>
      <td class="n">${r.n}</td>
      <td class="n">${r.mean == null ? '-' : fmt(r.mean, 4)}</td>
      <td class="n">${r.sd == null ? '-' : fmt(r.sd, 5)}</td>
      <td class="n">${n2(r.cp)}</td>
      <td class="n b">${n2(r.cpk)}</td>
      <td class="j g-${gcls[r.grade] || 'na'}">${r.grade === '부족' ? '데이터 부족' : r.grade}</td>
    </tr>`;
  }).join('');

  const body = `
    <h1>공정능력 (Cp / Cpk) 분석</h1>
    ${drawingsHtml(drawings, markers, (m) => gcls[gByMid[m.id]] || '', '도면 (등급별 색상)')}
    <p class="legend">마커 색 · <b class="ok">상</b> · <b class="warn">중</b> · <b class="ng">하</b> · 회색 데이터 부족</p>
    <table class="meta">
      <tr><th>품번</th><td>${esc(item.partNo || '-')}</td><th>품명</th><td>${esc(item.partName || '-')}</td><th>호기</th><td>${esc(item.machineNo || '-')}</td></tr>
      <tr><th>분석 기간</th><td>${esc(info.periodLabel || '-')}</td><th>대상 측정</th><td>${esc(String(info.sessionCount ?? '-'))}회 · ${esc(info.dateSpan || '-')}</td></tr>
      ${info.weeks && info.weeks.length ? `<tr><th>측정 주차</th><td colspan="3">${esc(info.weeks.join(', '))}</td></tr>` : ''}
      <tr><th>등급 기준</th><td colspan="3">상 Cpk ≥ ${crit.high} · 중 Cpk ≥ ${crit.mid} · 최소 측정 ${crit.minN}회</td></tr>
    </table>
    <div class="summary">
      <span class="ok">상 <b>${cnt('상')}</b></span>
      <span class="warn" style="color:#a9711f">중 <b>${cnt('중')}</b></span>
      <span class="ng">하 <b>${cnt('하')}</b></span>
      <span>데이터 부족 <b>${cnt('부족')}</b></span>
    </div>
    <table class="data">
      <thead><tr>
        <th>No</th><th>치수 이름</th><th>규격 (LSL~USL)</th><th>측정</th><th>평균</th><th>σ</th><th>Cp</th><th>Cpk</th><th>등급</th>
      </tr></thead>
      <tbody>${tr}</tbody>
    </table>
    <p class="legend">Cpk = min[(USL−평균)/3σ, (평균−LSL)/3σ]. 신뢰할 만한 Cpk 는 보통 25회 이상 측정이 필요합니다.</p>`;
  return printDoc(`공정능력_${item.partNo || ''}`, body);
}

// ---- 측정자 비교 ----

// rows: [{ m, c }] (c = compareAppraisers 결과)
export function appraiserReportHtml(item, rows, pickA, pickB, crit, drawings = []) {
  const markers = rows.map((x) => x.m);
  const gByMid = Object.fromEntries(rows.map((x) => [x.m.id, x.c?.grade]));
  const cnt = (g) => rows.filter((x) => x.c && x.c.grade === g).length;
  const diffRows = rows.filter((x) => x.c && (x.c.grade === '주의' || x.c.grade === '불일치'));

  const tr = rows.map(({ m, c }) => `
    <tr class="${c.grade === '불일치' ? 'ng' : c.grade === '주의' ? 'warn' : ''}">
      <td>${m.no}</td><td>${esc(m.name || '-')}</td>
      <td class="n">${esc(tolText(m))}</td>
      <td class="n">${c.a.mean == null ? '-' : fmt(c.a.mean, 4)} (${c.a.n})</td>
      <td class="n">${c.b.mean == null ? '-' : fmt(c.b.mean, 4)} (${c.b.n})</td>
      <td class="n b">${c.diff == null ? '-' : (c.diff > 0 ? '+' : '') + fmt(c.diff, 4)}</td>
      <td class="n">${c.pct == null ? '-' : c.pct.toFixed(1) + '%'}</td>
      <td class="j g-${gcls[c.grade] || 'na'}">${c.grade}</td>
    </tr>`).join('');

  const body = `
    <h1>측정자 비교 (재현성)</h1>
    ${drawingsHtml(drawings, markers, (m) => gcls[gByMid[m.id]] || '', '도면 (차이 나는 번호 표시)')}
    <p class="legend">마커 색 · <b class="ok">일치</b> · <b class="warn">주의</b> · <b class="ng">불일치</b></p>
    <table class="meta">
      <tr><th>품번</th><td>${esc(item.partNo || '-')}</td><th>품명</th><td>${esc(item.partName || '-')}</td><th>호기</th><td>${esc(item.machineNo || '-')}</td></tr>
      <tr><th>측정자 A</th><td>${esc(pickA)}</td><th>측정자 B</th><td>${esc(pickB)}</td></tr>
      <tr><th>판정 기준</th><td colspan="3">차이(|A−B|) ÷ 공차 폭 × 100 — 일치 ≤ ${crit.warnPct}% · 주의 ≤ ${crit.failPct}% · 초과 불일치</td></tr>
    </table>
    <div class="summary">
      <span class="ok">일치 <b>${cnt('일치')}</b></span>
      <span class="warn" style="color:#a9711f">주의 <b>${cnt('주의')}</b></span>
      <span class="ng">불일치 <b>${cnt('불일치')}</b></span>
    </div>
    ${diffRows.length ? `<p class="legend"><b>차이 큰 번호:</b> ${diffRows.map((x) => `${x.m.no}번(${x.c.pct.toFixed(0)}%)`).join(', ')} — 측정 방법·기준점·계측기 사용법을 두 측정자가 맞춰 보세요.</p>` : ''}
    <table class="data">
      <thead><tr>
        <th>No</th><th>치수 이름</th><th>공차</th><th>${esc(pickA)} 평균(n)</th><th>${esc(pickB)} 평균(n)</th><th>차이(A−B)</th><th>공차대비</th><th>판정</th>
      </tr></thead>
      <tbody>${tr}</tbody>
    </table>`;
  return printDoc(`측정자비교_${item.partNo || ''}`, body);
}

// ---- 공통 ----

function printDoc(title, body) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font: 12px/1.5 "Malgun Gothic","Apple SD Gothic Neo",sans-serif; color:#111; margin:24px; }
  h1 { font-size:17px; margin:0 0 8px; }
  table { border-collapse:collapse; width:100%; margin-bottom:8px; }
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
  tr.warn td { background:#fef6e6; }
  td.j.g-ok { color:#1e7e34; }
  td.j.g-warn { color:#a9711f; }
  td.j.g-ng { color:#c0392b; }
  .legend { font-size:11px; color:#555; margin:2px 0 10px; }
  .legend b.ok { color:#1e7e34; } .legend b.warn { color:#a9711f; } .legend b.ng { color:#c0392b; }
  .summary { display:flex; gap:16px; margin:8px 0 14px; font-size:13px; }
  .summary .ok b { color:#1e7e34; } .summary .ng b { color:#c0392b; }
  .summary .verdict { margin-left:auto; padding:2px 12px; border:1px solid #999; font-weight:700; }
  .summary .verdict.ok { background:#eaf6ec; color:#1e7e34; }
  .summary .verdict.ng { background:#fdecea; color:#c0392b; }
  footer { margin-top:16px; font-size:11px; color:#666; }
  h2.dwg-h { font-size:13px; margin:4px 0 4px; }
  .dwg { margin:0 0 6px; padding:0; }
  .dwg figcaption { font-weight:700; margin-bottom:3px; }
  .dwg-wrap { position:relative; display:inline-block; max-width:100%; border:1px solid #999; }
  /* 한 페이지에 들어가도록 높이를 제한(안 그러면 이미지가 통째로 다음 장으로 밀려 앞장이 빈다) */
  .dwg-wrap img { display:block; max-width:100%; height:auto; max-height:150mm; }
  .mk { position:absolute; transform:translate(-50%,-50%); box-sizing:border-box;
        min-width:16px; height:16px; padding:0 3px; border-radius:8px; border:1px solid #fff;
        background:#37718e; color:#fff; font-size:9px; font-weight:700; line-height:14px; text-align:center; }
  .mk.ng { background:#c0392b; } .mk.ok { background:#1e7e34; } .mk.warn { background:#d9931f; }
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
