import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setReading, getSetting } from '../lib/db.js';
import { judge, deviationOf, limitsOf, tolText, fmt, isoWeekKey, nowTimeStr } from '../lib/tol.js';
import { Crumbs, useToast, DecimalInput, Modal } from '../components/ui.jsx';
import { safeName, getSaveDir, writeToDir, dataUrlToBlob, download, fsSupported, listSaveDirFiles, readSaveDirFile, saveDirName } from '../lib/fs.js';
import { makeZip } from '../lib/zip.js';
import { sessionCsv, sessionReportHtml, openPrint } from '../lib/report.js';
import { exportAll } from '../lib/backup.js';
import MarkerCanvas from '../components/MarkerCanvas.jsx';

export default function MeasureEntry() {
  const { id, sessionId } = useParams();
  const itemId = Number(id);
  const sid = Number(sessionId);
  const nav = useNavigate();
  const toast = useToast();
  const [focusMarker, setFocusMarker] = useState(null);
  // 입력 중인 값을 낙관적으로 보관. IndexedDB 저장(비동기) 반향이 늦게 와서
  // 빠르게 타이핑할 때 글자가 잘리는 것을 막는다. (한번 건드린 칸은 로컬이 우선)
  const [edits, setEdits] = useState({});
  const [sEdits, setSEdits] = useState({}); // 측정 정보(측정자·주차·비고 등) 낙관적 보관
  const [folderView, setFolderView] = useState(null); // null | {loading} | {files, dir}

  const item = useLiveQuery(() => db.items.get(itemId), [itemId]);
  const session = useLiveQuery(() => db.sessions.get(sid), [sid]);
  const markers = useLiveQuery(() => db.markers.where('itemId').equals(itemId).sortBy('no'), [itemId]);
  const drawings = useLiveQuery(() => db.drawings.where('itemId').equals(itemId).sortBy('sort'), [itemId]);
  const readings = useLiveQuery(() => db.readings.where('sessionId').equals(sid).toArray(), [sid]);

  // 측정 시각이 비어 있으면 자동으로 현재 시각 기록
  useEffect(() => {
    if (session && !session.time) db.sessions.update(sid, { time: nowTimeStr() });
  }, [session, sid]);

  // 측정 도중 나갔다가 다시 열면, 아직 입력 안 한 첫 번호로 포커스를 옮겨준다.
  const didResume = useRef(false);
  useEffect(() => {
    if (didResume.current || !markers || !readings || !session) return;
    didResume.current = true;
    const hasValue = (mid) => {
      const r = readings.find((x) => x.markerId === mid);
      return r && r.value !== '' && r.value != null;
    };
    const measured = markers.filter((m) => hasValue(m.id)).length;

    // 측정자 이름이 비어 있으면 이름 칸부터 채우도록 유도
    if (!(session.inspector || '').trim()) {
      setTimeout(() => {
        const el = document.getElementById('sess-inspector');
        if (el) { el.focus(); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      }, 120);
      toast('측정값 입력 전에 측정자 이름을 먼저 입력하세요');
      return;
    }

    if (measured === 0) return; // 새 측정: 방해하지 않음
    const next = markers.find((m) => !hasValue(m.id));
    if (!next) return; // 이미 전부 입력됨
    setFocusMarker(next.id);
    setTimeout(() => {
      const el = document.getElementById(`mv-${next.id}`);
      if (el) {
        el.focus();
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 120);
    toast(`${next.no}번부터 이어서 측정하세요 (${measured}/${markers.length} 완료)`);
  }, [markers, readings, session]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item || !session || !markers || !drawings || !readings) return null;

  const sval = (k, fallback = '') => sEdits[k] ?? (session[k] ?? fallback);
  const patchSession = (patch) => {
    setSEdits((e) => ({ ...e, ...patch }));
    db.sessions.update(sid, patch);
  };

  // 측정자 이름을 먼저 받는다 (누락 방지)
  const nameMissing = !String(sval('inspector')).trim();
  const requireName = (e) => {
    if (!nameMissing) return true;
    if (e && e.target && e.target.blur) e.target.blur();
    window.alert('먼저 측정자의 이름을 입력하세요.');
    const el = document.getElementById('sess-inspector');
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus(); }
    return false;
  };

  const valueOf = (markerId) =>
    edits[markerId] ?? (readings.find((r) => r.markerId === markerId)?.value ?? '');
  const onInput = (mid, n) => {
    if (nameMissing) return; // 이름 입력 전에는 측정값 저장 안 함
    setEdits((e) => ({ ...e, [mid]: n == null ? '' : n }));
    setReading(sid, mid, n);
  };
  const statusOf = (m) => {
    const j = judge(m, valueOf(m.id));
    return j === 'OK' ? 'ok' : j === 'NG' ? 'ng' : null;
  };

  const results = markers.map((m) => judge(m, valueOf(m.id)));
  const okN = results.filter((r) => r === 'OK').length;
  const ngN = results.filter((r) => r === 'NG').length;
  const blankN = results.filter((r) => r === null).length;

  const baseName = () =>
    `측정_${safeName(item.partNo || 'item')}_${safeName(session.weekKey || session.date || '')}`;

  // 도면 이미지 파일 목록 [{ name, blob }]
  function drawingImageFiles() {
    return drawings
      .filter((d) => d.dataUrl)
      .map((d, i) => {
        const blob = dataUrlToBlob(d.dataUrl);
        const ext = (blob.type || '').includes('png') ? 'png' : 'jpg';
        const label = d.name ? `_${safeName(d.name)}` : '';
        return { name: `${baseName()}_도면${i + 1}${label}.${ext}`, blob };
      });
  }

  async function writeDrawingImages(dir) {
    let n = 0;
    for (const f of drawingImageFiles()) {
      try { await writeToDir(dir, f.name, f.blob); n++; } catch { /* skip */ }
    }
    return n;
  }

  async function exportCsv() {
    const csvBlob = sessionCsv(item, session, markers, valueOf);
    const imgs = drawingImageFiles();
    const dir = fsSupported() ? await getSaveDir({ prompt: true }) : null;

    if (dir) {
      try {
        await writeToDir(dir, `${baseName()}.csv`, csvBlob);
        const n = await writeDrawingImages(dir);
        toast(`${dir.name} 폴더에 저장했습니다${n ? ` · 도면 ${n}장` : ''}`);
      } catch (e) {
        toast('폴더 저장 실패: ' + e.message);
      }
      return;
    }

    // 다운로드: 도면이 있으면 CSV+도면을 ZIP 하나로 묶어 받는다
    if (imgs.length) {
      const zip = await makeZip([
        { name: `${baseName()}.csv`, data: csvBlob },
        ...imgs.map((f) => ({ name: f.name, data: f.blob })),
      ]);
      download(`${baseName()}.zip`, zip, 'application/zip');
      toast(`CSV + 도면 ${imgs.length}장을 ZIP 으로 내려받았습니다`);
    } else {
      download(`${baseName()}.csv`, csvBlob);
      toast('CSV를 내려받았습니다');
    }
  }

  function printReport() {
    const ok = openPrint(sessionReportHtml(item, session, markers, valueOf, drawings));
    if (!ok) toast('팝업이 차단되어 인쇄창을 열 수 없습니다');
  }

  async function openFolder() {
    if (!fsSupported()) {
      toast('이 브라우저는 폴더 보기를 지원하지 않습니다. 저장한 파일은 브라우저 “다운로드” 폴더에 있습니다.');
      return;
    }
    setFolderView({ loading: true });
    try {
      const files = await listSaveDirFiles();
      if (files == null) {
        setFolderView(null);
        toast('저장 폴더가 지정되지 않았습니다. 파일은 “다운로드” 폴더에 있고, 설정에서 폴더를 지정하면 여기서 목록을 볼 수 있습니다.');
        return;
      }
      setFolderView({ files, dir: await saveDirName() });
    } catch (e) {
      setFolderView(null);
      toast('폴더를 읽지 못했습니다: ' + (e.message || e));
    }
  }
  async function downloadSaved(name) {
    try {
      const f = await readSaveDirFile(name);
      if (f) download(name, f);
      else toast('파일을 찾지 못했습니다');
    } catch {
      toast('파일을 열지 못했습니다');
    }
  }

  async function finish() {
    const auto = await getSetting('autoSave', false);
    const dir = auto ? await getSaveDir({ prompt: true }) : null;
    if (dir) {
      try {
        await writeToDir(dir, `${baseName()}.csv`, sessionCsv(item, session, markers, valueOf));
        const n = await writeDrawingImages(dir);
        const dump = await exportAll();
        await writeToDir(dir, 'vmb-backup-최신.json',
          new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }));
        toast(`${dir.name} 폴더에 CSV·백업${n ? `·도면 ${n}장` : ''}을 저장했습니다`);
      } catch (e) {
        toast('폴더 저장 실패: ' + e.message);
      }
    } else {
      toast('저장되었습니다');
    }
    nav(`/items/${itemId}`);
  }

  const byDrawing = drawings
    .map((d) => ({ d, ms: markers.filter((m) => m.drawingId === d.id) }))
    .filter((g) => g.ms.length);
  const orphan = markers.filter((m) => !drawings.find((d) => d.id === m.drawingId));

  return (
    <>
      <Crumbs
        trail={[
          { label: '품목', to: '/' },
          { label: `${item.partNo} (${item.machineNo})`, to: `/items/${itemId}` },
          { label: `측정 ${session.weekKey || ''}` }
        ]}
      />

      <div className="panel">
        <h2>측정 정보</h2>
        <div className="grid cols-4">
          <label className="field">
            <span>측정일</span>
            <input
              type="date"
              value={sval('date')}
              onChange={(e) => patchSession({ date: e.target.value, weekKey: sval('weekKey') || isoWeekKey(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>측정 시각</span>
            <input
              type="time"
              value={sval('time')}
              onChange={(e) => patchSession({ time: e.target.value })}
            />
          </label>
          <label className="field">
            <span>주차</span>
            <input value={sval('weekKey')} onChange={(e) => patchSession({ weekKey: e.target.value })} placeholder="2026-W36" />
          </label>
          <label className="field">
            <span>측정자 {nameMissing && <b style={{ color: 'var(--ng)' }}>· 필수</b>}</span>
            <input
              id="sess-inspector"
              value={sval('inspector')}
              onChange={(e) => patchSession({ inspector: e.target.value })}
              placeholder="이름 (측정 전 필수)"
              style={nameMissing ? { borderColor: 'var(--ng)' } : undefined}
            />
          </label>
        </div>
        <label className="field" style={{ marginTop: 12 }}>
          <span>비고</span>
          <input value={sval('note')} onChange={(e) => patchSession({ note: e.target.value })} placeholder="측정 순서 / 방향 / 장비 등" />
        </label>
      </div>

      <div className="panel">
        <div className="summary-row">
          <div className="stat ok"><div className="k">OK</div><div className="v">{okN}</div></div>
          <div className="stat ng"><div className="k">NG</div><div className="v">{ngN}</div></div>
          <div className="stat"><div className="k">미입력</div><div className="v">{blankN}</div></div>
          <div className="stat"><div className="k">전체</div><div className="v">{markers.length}</div></div>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="btn sm" onClick={exportCsv}>CSV 저장</button>
          {fsSupported() && <button className="btn sm" onClick={openFolder}>저장 폴더 보기</button>}
          <button className="btn sm" onClick={printReport}>인쇄 / PDF</button>
        </div>
        {ngN > 0 && <p className="pill-ng" style={{ display: 'inline-block' }}>공차 이탈 {ngN}건 — 확인 필요</p>}
        {(() => {
          const isEmpty = (m) => { const val = valueOf(m.id); return val === '' || val == null; };
          const measured = markers.filter((m) => !isEmpty(m)).length;
          if (markers.length === 0) return null;
          if (measured === markers.length) {
            return <p className="hint" style={{ marginTop: 8 }}>측정 완료 · {measured}/{markers.length}개 입력됨</p>;
          }
          if (measured > 0) {
            const next = markers.find(isEmpty);
            return (
              <p className="hint" style={{ marginTop: 8 }}>
                측정 진행 <b>{measured}/{markers.length}</b>
                {next ? <> · <b>{next.no}번</b>부터 이어서 입력하세요</> : null}
              </p>
            );
          }
          return null;
        })()}
      </div>

      {markers.length === 0 && (
        <div className="panel">
          치수 번호가 없습니다. <Link to={`/items/${itemId}`}>도면 탭</Link>에서 번호를 먼저 지정하세요.
        </div>
      )}

      {byDrawing.map(({ d, ms }) => (
        <div className="panel" key={d.id}>
          <h2>{d.name}</h2>
          <div className="measure-layout">
            <div className="measure-drawing">
              <MarkerCanvas
                src={d.dataUrl}
                markers={ms}
                selectedId={focusMarker}
                statusOf={statusOf}
                onSelect={setFocusMarker}
                small
                scrollable
              />
              <p className="hint">
                도면의 번호 = 아래 표의 <b>No</b>. 마커 색:{' '}
                <b style={{ color: 'var(--focus)' }}>파랑 = 지금 입력할 번호</b> ·{' '}
                <span className="cell-ok">초록 OK</span> · <span className="cell-ng">빨강 NG</span> · 회색 미입력
              </p>
            </div>
            <MeasureTable
              markers={ms}
              valueOf={valueOf}
              focusMarker={focusMarker}
              setFocusMarker={setFocusMarker}
              onInput={onInput}
              nameMissing={nameMissing}
              requireName={requireName}
            />
          </div>
        </div>
      ))}

      {orphan.length > 0 && (
        <div className="panel">
          <h2>도면 미지정 번호</h2>
          <MeasureTable
            markers={orphan}
            valueOf={valueOf}
            focusMarker={focusMarker}
            setFocusMarker={setFocusMarker}
            onInput={onInput}
            nameMissing={nameMissing}
            requireName={requireName}
          />
        </div>
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={finish}>완료</button>
        <button className="btn" onClick={exportCsv}>CSV 저장</button>
        {fsSupported() && <button className="btn" onClick={openFolder}>저장 폴더 보기</button>}
        <button className="btn" onClick={printReport}>인쇄 / PDF</button>
        <span className="muted">입력 즉시 자동 저장됩니다.</span>
      </div>

      {folderView && (
        <Modal
          title={`저장 폴더${folderView.dir ? ` · 📁 ${folderView.dir}` : ''}`}
          onClose={() => setFolderView(null)}
        >
          {folderView.loading && <p className="muted">읽는 중…</p>}
          {folderView.files && folderView.files.length === 0 && (
            <p className="muted">폴더에 파일이 없습니다.</p>
          )}
          {folderView.files && folderView.files.length > 0 && (
            <div className="table-wrap">
              <table className="sess-table">
                <thead><tr><th>파일</th><th>크기</th><th>수정</th><th></th></tr></thead>
                <tbody>
                  {folderView.files.map((f) => (
                    <tr key={f.name}>
                      <td style={{ textAlign: 'left', wordBreak: 'break-all' }}>{f.name}</td>
                      <td className="nowrap">{f.size ? `${Math.max(1, Math.round(f.size / 1024))} KB` : '-'}</td>
                      <td className="nowrap">{f.lastModified ? new Date(f.lastModified).toLocaleString('ko-KR') : '-'}</td>
                      <td><button className="btn sm" onClick={() => downloadSaved(f.name)}>받기</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="hint" style={{ marginTop: 10 }}>
            브라우저는 탐색기를 직접 열 수 없어 파일 목록만 보여줍니다.
            실제 폴더는 설정에서 지정한 위치입니다.
          </p>
        </Modal>
      )}
    </>
  );
}

function MeasureTable({ markers, valueOf, onInput, focusMarker, setFocusMarker, nameMissing, requireName }) {
  const gauges = [...new Set(markers.map((m) => (m.gauge || '').trim()).filter(Boolean))];
  const units = [...new Set(markers.map((m) => m.unit || 'mm'))];

  return (
    <div>
      <div className="measure-cap">
        <span>계측기 <b>{gauges.join(', ') || '-'}</b></span>
        <span>단위 <b>{units.join(', ')}</b></span>
        <span className="measure-cap-hint">→ <b>측정값</b> 칸(베이지색)에 입력하세요</span>
      </div>
      <div className="table-wrap">
        <table className="measure-table">
          <thead>
            <tr>
              <th>No</th><th>이름</th>
              <th className="num">기준</th><th className="num">공차</th><th className="num">합격범위</th>
              <th className="num mv-head">측정값</th><th className="num">편차</th><th>판정</th>
            </tr>
          </thead>
          <tbody>
            {markers.map((m) => {
              const v = valueOf(m.id);
              const j = judge(m, v);
              const dev = deviationOf(m, v);
              const lim = limitsOf(m);
              const unit = m.unit || 'mm';
              const mvClass = j === 'OK' ? 'mv mv-ok' : j === 'NG' ? 'mv mv-ng' : 'mv';
              return (
                <tr
                  key={m.id}
                  className={j === 'NG' ? 'row-ng' : ''}
                  onFocus={() => setFocusMarker(m.id)}
                  style={m.id === focusMarker ? { outline: '2px solid var(--focus)', outlineOffset: '-2px' } : undefined}
                >
                  <td><span className="marker-no">{m.no}</span></td>
                  <td className="muted" title={m.name || ''} style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name || '-'}</td>
                  <td className="num nowrap">{fmt(m.nominal)} <span className="muted">{unit}</span></td>
                  <td className="num nowrap">{tolText(m)}</td>
                  <td className="num nowrap">
                    {lim
                      ? <b>{fmt(lim.lo)} ~ {fmt(lim.hi)}</b>
                      : <span className="muted">기준 미입력</span>}
                  </td>
                  <td className="num mv-cell">
                    <DecimalInput
                      id={`mv-${m.id}`}
                      className={`right ${mvClass}`} style={{ width: 84 }}
                      value={v}
                      readOnly={nameMissing}
                      onFocus={requireName}
                      onChange={(n) => onInput(m.id, n)}
                      placeholder={m.nominal != null ? `${fmt(m.nominal)} 입력` : '측정값'}
                    />
                  </td>
                  <td className={`num nowrap ${dev != null && Math.abs(dev) > 1e-9 ? (j === 'NG' ? 'cell-ng' : '') : ''}`}>
                    {dev != null ? (dev > 0 ? '+' : '') + fmt(dev) : ''}
                  </td>
                  <td>
                    {j === 'OK' && <span className="pill-ok">OK</span>}
                    {j === 'NG' && <span className="pill-ng">NG</span>}
                    {j === null && (m.nominal == null ? <span className="muted">기준?</span> : <span className="muted">-</span>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
