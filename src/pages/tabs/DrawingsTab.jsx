import { useRef, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addDrawing, deleteDrawing, addMarker, updateMarker, deleteMarker, applyMarkerMeta } from '../../lib/db.js';
import { tolText } from '../../lib/tol.js';
import { Empty, useToast, readImageFile, DecimalInput, ListInput } from '../../components/ui.jsx';
import { readDimensionFromRoi } from '../../lib/ocr.js';
import { DEFAULT_UNITS, DEFAULT_GAUGES, mergeOptions } from '../../lib/units.js';
import MarkerCanvas from '../../components/MarkerCanvas.jsx';

export default function DrawingsTab({ itemId }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [activeDrawing, setActiveDrawing] = useState(null);
  const [selId, setSelId] = useState(null);
  const [roiMode, setRoiMode] = useState(false);
  const [ocr, setOcr] = useState(null); // { busy, progress, result, error }

  const drawings = useLiveQuery(() => db.drawings.where('itemId').equals(itemId).sortBy('sort'), [itemId]);
  const markers = useLiveQuery(() => db.markers.where('itemId').equals(itemId).sortBy('no'), [itemId]);
  const allMarkers = useLiveQuery(() => db.markers.toArray(), []);

  const unitOptions = mergeOptions(DEFAULT_UNITS, allMarkers, 'unit');
  const gaugeOptions = mergeOptions(DEFAULT_GAUGES, allMarkers, 'gauge');

  useEffect(() => {
    if (drawings && drawings.length && !drawings.find((d) => d.id === activeDrawing)) {
      setActiveDrawing(drawings[0].id);
    }
  }, [drawings, activeDrawing]);

  // 선택이 바뀌면 영역 지정 모드 / OCR 결과 초기화
  useEffect(() => { setRoiMode(false); setOcr(null); }, [selId]);

  if (!drawings || !markers) return null;

  const activeDrawingObj = drawings.find((d) => d.id === activeDrawing) || null;
  const shownMarkers = markers.filter((m) => m.drawingId === activeDrawing);
  const selected = markers.find((m) => m.id === selId) || null;

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    for (const f of files) {
      try {
        const { dataUrl, w, h } = await readImageFile(f);
        const newId = await addDrawing(itemId, f.name.replace(/\.[^.]+$/, ''), dataUrl, w, h);
        setActiveDrawing(newId);
      } catch {
        toast('이미지를 읽지 못했습니다');
      }
    }
    toast('도면을 추가했습니다');
  }

  async function onAddMarker(xr, yr) {
    const newId = await addMarker(itemId, activeDrawing, xr, yr);
    setSelId(newId);
  }

  async function onSetRoi(box) {
    if (!selId) return;
    await updateMarker(selId, { roi: box });
    setRoiMode(false);
    setOcr(null);
  }

  async function runOcr() {
    if (!selected?.roi || !activeDrawingObj) return;
    setOcr({ busy: true, progress: 0 });
    try {
      const res = await readDimensionFromRoi(
        activeDrawingObj.dataUrl,
        selected.roi,
        (m) => {
          if (m.status && typeof m.progress === 'number') {
            setOcr((o) => (o?.busy ? { ...o, progress: m.progress, status: m.status } : o));
          }
        }
      );
      setOcr({ busy: false, result: res });
    } catch (err) {
      setOcr({ busy: false, error: err.message || 'OCR 실패' });
    }
  }

  function onOcrApplied() {
    toast('치수를 입력했습니다');
    setOcr(null);
  }

  async function removeDrawing(d) {
    if (!confirm(`"${d.name}" 도면과 이 도면의 번호를 삭제할까요?`)) return;
    await deleteDrawing(d.id);
    toast('도면을 삭제했습니다');
  }

  return (
    <>
      <div className="panel">
        <div className="btn-row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>도면</h2>
          <button className="btn primary sm" onClick={() => fileRef.current.click()}>+ 도면 업로드</button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onFiles} />
        </div>

        {drawings.length === 0 ? (
          <Empty title="도면을 업로드하세요">
            여러 장(Vision#1, Vision#2 ...)을 올릴 수 있습니다. 업로드 후 이미지를 클릭해 번호를 찍으세요.
          </Empty>
        ) : (
          <div className="btn-row" style={{ marginTop: 12 }}>
            {drawings.map((d) => (
              <button
                key={d.id}
                className={`btn sm ${d.id === activeDrawing ? 'primary' : ''}`}
                onClick={() => { setActiveDrawing(d.id); setSelId(null); }}
              >
                {d.name} ({markers.filter((m) => m.drawingId === d.id).length})
              </button>
            ))}
          </div>
        )}
      </div>

      {activeDrawingObj && (
        <div className="panel">
          <p className="hint">
            이미지의 치수 위치를 <b>클릭</b>하면 번호가 자동으로 붙습니다. 마커를 <b>드래그</b>해 위치를 옮기고,
            오른쪽에서 기준치수·공차를 입력하거나 <b>치수 영역</b>을 지정해 자동으로 읽어 옵니다.
          </p>
          {roiMode && (
            <p className="pill-ng" style={{ display: 'inline-block' }}>
              {selected?.no}번 치수 영역 지정 중 — 도면에서 치수 텍스트를 드래그로 감싸세요
            </p>
          )}
          <div className="annotator">
            <div>
              <MarkerCanvas
                src={activeDrawingObj.dataUrl}
                markers={shownMarkers}
                selectedId={selId}
                onAdd={roiMode ? undefined : onAddMarker}
                onSelect={setSelId}
                onMove={(mid, xr, yr) => updateMarker(mid, { xr, yr })}
                roi={selected?.roi || null}
                roiMode={roiMode}
                onRoi={onSetRoi}
              />
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn sm danger" onClick={() => removeDrawing(activeDrawingObj)}>
                  이 도면 삭제
                </button>
                <span className="muted" style={{ fontSize: 13 }}>이 도면 번호 {shownMarkers.length}개</span>
              </div>
            </div>

            <div>
              {selected ? (
                <MarkerEditor
                  key={selected.id}
                  marker={selected}
                  roiMode={roiMode}
                  ocr={ocr}
                  unitOptions={unitOptions}
                  gaugeOptions={gaugeOptions}
                  onApplyMeta={async (meta) => {
                    await applyMarkerMeta(itemId, meta);
                    toast('모든 번호에 적용했습니다');
                  }}
                  onChange={(patch) => updateMarker(selected.id, patch)}
                  onToggleRoi={() => setRoiMode((v) => !v)}
                  onClearRoi={() => { updateMarker(selected.id, { roi: null }); setOcr(null); }}
                  onRunOcr={runOcr}
                  onOcrApplied={onOcrApplied}
                  onDismissOcr={() => setOcr(null)}
                  onDelete={async () => {
                    if (!confirm(`${selected.no}번 치수를 삭제할까요? (측정값도 함께 삭제)`)) return;
                    await deleteMarker(selected.id);
                    setSelId(null);
                    toast('삭제했습니다');
                  }}
                />
              ) : (
                <div className="panel" style={{ boxShadow: 'none', margin: 0 }}>
                  <p className="muted" style={{ margin: 0 }}>마커를 선택하거나 이미지를 클릭해 추가하세요.</p>
                </div>
              )}

              <h3>이 도면의 번호</h3>
              <div className="side-list">
                {shownMarkers.map((m) => (
                  <div
                    key={m.id}
                    className={`m-row ${m.id === selId ? 'sel' : ''}`}
                    onClick={() => setSelId(m.id)}
                  >
                    <span className="n">{m.no}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.name || '(이름 없음)'}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {m.nominal != null ? `${m.nominal}${m.unit && m.unit !== 'mm' ? m.unit : ''} ${tolText(m)}` : '기준치수 미입력'}
                        {m.gauge ? ` · ${m.gauge}` : ''}
                        {m.roi ? ' · 영역✓' : ''}
                      </div>
                    </span>
                  </div>
                ))}
                {shownMarkers.length === 0 && <p className="muted">아직 번호가 없습니다.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MarkerEditor({
  marker, roiMode, ocr, unitOptions = [], gaugeOptions = [], onApplyMeta,
  onChange, onToggleRoi, onClearRoi, onRunOcr, onOcrApplied, onDismissOcr, onDelete,
}) {
  const [m, setM] = useState(marker);
  const set = (patch) => {
    const next = { ...m, ...patch };
    setM(next);
    onChange(patch);
  };

  const r = ocr?.result;
  const roi = marker.roi; // 영역은 캔버스에서 지정 — 항상 prop 기준

  const applyOcr = () => {
    if (!r?.ok) return;
    const patch = { nominal: r.nominal };
    if (r.tolMode) {
      patch.tolMode = r.tolMode;
      patch.tolUpper = r.tolUpper;
      patch.tolLower = r.tolLower;
    }
    set(patch);
    onOcrApplied();
  };

  return (
    <div className="panel" style={{ boxShadow: 'none', margin: 0, borderColor: 'var(--brand)' }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="n" style={{ width: 26, height: 26, background: 'var(--brand)', color: '#fff', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          {m.no}
        </span>
        {m.no}번 치수
      </h2>

      <label className="field">
        <span>치수 이름 / 위치</span>
        <input value={m.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="예: Hole1-Hole2 간 거리" />
      </label>

      <label className="field" style={{ marginTop: 10 }}>
        <span>기준치수 (현재 치수)</span>
        <DecimalInput value={m.nominal ?? ''} onChange={(n) => set({ nominal: n })} placeholder="예: 27.888" />
      </label>

      <div className="grid cols-2" style={{ marginTop: 10 }}>
        <label className="field">
          <span>단위</span>
          <ListInput
            value={m.unit ?? 'mm'}
            onChange={(v) => set({ unit: v })}
            options={unitOptions}
            placeholder="mm"
          />
        </label>
        <label className="field">
          <span>계측기</span>
          <ListInput
            value={m.gauge ?? ''}
            onChange={(v) => set({ gauge: v })}
            options={gaugeOptions}
            placeholder="예: 마이크로미터"
          />
        </label>
      </div>
      {onApplyMeta && (
        <button
          type="button"
          className="btn sm"
          style={{ marginTop: 6 }}
          onClick={() => onApplyMeta({ unit: m.unit ?? 'mm', gauge: m.gauge ?? '' })}
        >
          이 단위·계측기를 모든 번호에 적용
        </button>
      )}

      <label className="field" style={{ marginTop: 10 }}>
        <span>공차 방식</span>
        <select
          value={m.tolMode}
          onChange={(e) => {
            const tolMode = e.target.value;
            if (tolMode === 'sym') {
              const t = Math.abs(m.tolUpper ?? 0.02) || 0.02;
              set({ tolMode, tolUpper: t, tolLower: -t });
            } else set({ tolMode });
          }}
        >
          <option value="sym">± 대칭</option>
          <option value="asym">상/하한 개별</option>
        </select>
      </label>

      {m.tolMode === 'sym' ? (
        <label className="field" style={{ marginTop: 10 }}>
          <span>공차 ± 값</span>
          <DecimalInput
            allowNegative={false}
            value={m.tolUpper == null ? '' : Math.abs(m.tolUpper)}
            onChange={(n) => {
              const t = Math.abs(n ?? 0);
              set({ tolUpper: t, tolLower: -t });
            }}
            placeholder="예: 0.02"
          />
        </label>
      ) : (
        <div className="grid cols-2" style={{ marginTop: 10 }}>
          <label className="field">
            <span>상한 (+)</span>
            <DecimalInput value={m.tolUpper ?? ''} onChange={(n) => set({ tolUpper: n })} placeholder="+0.03" />
          </label>
          <label className="field">
            <span>하한 (−)</span>
            <DecimalInput value={m.tolLower ?? ''} onChange={(n) => set({ tolLower: n })} placeholder="-0.01" />
          </label>
        </div>
      )}

      {m.nominal != null && (
        <p className="hint" style={{ marginTop: 10 }}>
          합격 범위: <b>{(m.nominal + Math.min(m.tolUpper ?? 0, m.tolLower ?? 0)).toFixed(3)}</b> ~{' '}
          <b>{(m.nominal + Math.max(m.tolUpper ?? 0, m.tolLower ?? 0)).toFixed(3)}</b>
        </p>
      )}

      {/* --- 치수 자동 읽기 (OCR) --- */}
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line-strong)' }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>치수 영역에서 자동 읽기</div>
        <div className="btn-row">
          <button className={`btn sm ${roiMode ? 'primary' : ''}`} onClick={onToggleRoi}>
            {roiMode ? '영역 지정 취소' : roi ? '영역 다시 지정' : '치수 영역 지정'}
          </button>
          {roi && !roiMode && (
            <>
              <button className="btn sm primary" onClick={onRunOcr} disabled={ocr?.busy}>
                {ocr?.busy ? '읽는 중…' : '자동 읽기'}
              </button>
              <button className="btn sm" onClick={onClearRoi}>영역 지우기</button>
            </>
          )}
        </div>

        {ocr?.busy && (
          <p className="hint" style={{ marginTop: 8 }}>
            OCR 엔진 로딩/인식 중… {Math.round((ocr.progress || 0) * 100)}%
            <br />(처음 한 번은 인식 데이터를 불러오느라 몇 초 걸립니다)
          </p>
        )}
        {ocr?.error && (
          <p className="pill-ng" style={{ display: 'inline-block', marginTop: 8 }}>{ocr.error}</p>
        )}

        {r && (
          <div className="panel" style={{ boxShadow: 'none', margin: '10px 0 0', background: 'var(--brand-weak)' }}>
            {r.previewUrl && <img className="ocr-preview" src={r.previewUrl} alt="인식 영역" />}
            <p className="hint" style={{ marginTop: 8 }}>
              인식 텍스트: <b>{r.text || '(없음)'}</b> · 신뢰도 {r.confidence}%
            </p>
            {r.ok ? (
              <>
                <p style={{ margin: '4px 0', fontSize: 14 }}>
                  기준치수 <b>{r.nominal}</b>
                  {r.tolMode === 'sym' && <> · 공차 <b>±{r.tolUpper}</b>{r.assumedSym ? ' (± 로 추정)' : ''}</>}
                  {r.tolMode === 'asym' && <> · 상한 <b>{r.tolUpper}</b> / 하한 <b>{r.tolLower}</b></>}
                  {!r.tolMode && <> · 공차는 수동 입력</>}
                </p>
                <div className="btn-row" style={{ marginTop: 6 }}>
                  <button className="btn sm primary" onClick={applyOcr}>이 값 적용</button>
                  <button className="btn sm" onClick={onDismissOcr}>닫기</button>
                </div>
              </>
            ) : (
              <div className="btn-row" style={{ marginTop: 6 }}>
                <span className="pill-ng" style={{ display: 'inline-block' }}>{r.error}</span>
                <button className="btn sm" onClick={onDismissOcr}>닫기</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="btn-row" style={{ marginTop: 12 }}>
        <button className="btn danger sm" onClick={onDelete}>이 번호 삭제</button>
      </div>
    </div>
  );
}
