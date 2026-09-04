import { useRef, useState } from 'react';

/**
 * 도면 이미지 위에 마커를 표시/편집.
 * props:
 *  - src: 이미지 dataURL
 *  - markers: [{id, no, xr, yr}]
 *  - selectedId
 *  - statusOf(marker) => 'ok'|'ng'|null  (측정 결과 색상, 선택)
 *  - onAdd(xr, yr)      클릭으로 마커 추가 (편집 모드)
 *  - onSelect(id)
 *  - onMove(id, xr, yr) 드래그 이동 (편집 모드)
 *  - small: 마커 작게
 *  - roi: {xr,yr,wr,hr}  선택 마커의 치수 인식 영역 (표시용)
 *  - roiMode: true 면 캔버스 드래그로 새 영역을 그림 (마커 이동/추가 비활성)
 *  - onRoi({xr,yr,wr,hr})  영역 지정 완료 콜백
 */
export default function MarkerCanvas({
  src, markers = [], selectedId, statusOf,
  onAdd, onSelect, onMove, small,
  roi, roiMode, onRoi,
}) {
  const boxRef = useRef(null);
  const dragId = useRef(null);
  const roiStart = useRef(null);
  const [draftRoi, setDraftRoi] = useState(null);

  const rel = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    const p = e.touches?.[0] || e.changedTouches?.[0] || e;
    return {
      xr: Math.min(1, Math.max(0, (p.clientX - r.left) / r.width)),
      yr: Math.min(1, Math.max(0, (p.clientY - r.top) / r.height))
    };
  };

  const onCanvasClick = (e) => {
    if (roiMode || !onAdd || dragId.current) return;
    if (e.target.closest('.marker')) return;
    const { xr, yr } = rel(e);
    onAdd(xr, yr);
  };

  const startRoi = (e) => {
    if (!roiMode) return;
    if (e.target.closest('.marker')) return;
    e.preventDefault();
    const s = rel(e);
    roiStart.current = s;
    setDraftRoi({ xr: s.xr, yr: s.yr, wr: 0, hr: 0 });
    const box = (q) => ({
      xr: Math.min(s.xr, q.xr), yr: Math.min(s.yr, q.yr),
      wr: Math.abs(q.xr - s.xr), hr: Math.abs(q.yr - s.yr)
    });
    const move = (ev) => { ev.preventDefault(); setDraftRoi(box(rel(ev))); };
    const end = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      const b = box(rel(ev));
      roiStart.current = null;
      setDraftRoi(null);
      if (b.wr > 0.008 && b.hr > 0.008) onRoi?.(b);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
  };

  const startDrag = (id) => (e) => {
    onSelect?.(id);
    if (roiMode || !onMove) return;
    e.stopPropagation();
    dragId.current = id;
    const move = (ev) => {
      const { xr, yr } = rel(ev);
      onMove(id, xr, yr);
    };
    const end = () => {
      dragId.current = null;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', end);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
  };

  const shownRoi = draftRoi || roi;

  return (
    <div
      className={`canvas-box${roiMode ? ' roi-mode' : ''}`}
      ref={boxRef}
      onClick={onCanvasClick}
      onMouseDown={startRoi}
      onTouchStart={startRoi}
    >
      <img src={src} alt="도면" />

      {shownRoi && shownRoi.wr > 0 && shownRoi.hr > 0 && (
        <div
          className="roi-box"
          style={{
            left: `${shownRoi.xr * 100}%`,
            top: `${shownRoi.yr * 100}%`,
            width: `${shownRoi.wr * 100}%`,
            height: `${shownRoi.hr * 100}%`
          }}
        />
      )}

      {markers.map((m) => {
        const st = statusOf?.(m);
        return (
          <div
            key={m.id}
            className={[
              'marker',
              small ? 'small' : '',
              m.id === selectedId ? 'sel' : '',
              st === 'ok' ? 'ok' : '',
              st === 'ng' ? 'ng' : ''
            ].join(' ')}
            style={{ left: `${m.xr * 100}%`, top: `${m.yr * 100}%` }}
            onMouseDown={startDrag(m.id)}
            onTouchStart={startDrag(m.id)}
            onClick={(e) => { e.stopPropagation(); onSelect?.(m.id); }}
          >
            {m.no}
          </div>
        );
      })}
    </div>
  );
}
