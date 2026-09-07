import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, updateMarker, deleteMarker } from '../../lib/db.js';
import { limitsOf, fmt } from '../../lib/tol.js';
import { Empty, useToast, DecimalInput, SelectInput } from '../../components/ui.jsx';
import { DEFAULT_UNITS, DEFAULT_GAUGES, mergeOptions, unitLabel } from '../../lib/units.js';

const dash = (v) => (v == null || v === '' ? '—' : v);

export default function MarkersTab({ itemId }) {
  const toast = useToast();
  // 기본은 읽기 전용. 실수로 값이 바뀌는 걸 막고, 고칠 때만 "편집"으로 잠금 해제.
  const [editing, setEditing] = useState(false);

  const markers = useLiveQuery(() => db.markers.where('itemId').equals(itemId).sortBy('no'), [itemId]);
  const drawings = useLiveQuery(() => db.drawings.where('itemId').equals(itemId).toArray(), [itemId]);
  const allMarkers = useLiveQuery(() => db.markers.toArray(), []);
  if (!markers || !drawings) return null;

  const unitOptions = mergeOptions(DEFAULT_UNITS, allMarkers, 'unit');
  const gaugeOptions = mergeOptions(DEFAULT_GAUGES, allMarkers, 'gauge');

  const drawingName = (id) => drawings.find((d) => d.id === id)?.name || '-';

  if (markers.length === 0) {
    return (
      <div className="panel">
        <Empty title="지정된 번호가 없습니다">
          &lsquo;도면 · 번호 지정&rsquo; 탭에서 도면을 클릭해 번호를 먼저 찍으세요.
        </Empty>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="btn-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h2 style={{ margin: 0 }}>치수표 · 기준치수와 공차</h2>
        <button
          className={`btn sm ${editing ? 'danger' : ''}`}
          onClick={() => setEditing((e) => !e)}
        >
          {editing ? '편집 잠그기' : '편집'}
        </button>
      </div>
      <p className="hint">
        {editing
          ? '편집 모드입니다. 값을 고치면 도면 마커에도 바로 반영됩니다. 공차는 상한(+) / 하한(−)로 저장됩니다.'
          : '읽기 전용입니다. 값을 고치려면 오른쪽 위 "편집" 을 누르세요. (기준치수·공차는 도면 · 번호 지정 탭에서도 입력할 수 있습니다)'}
      </p>
      <div className="table-wrap">
        <table className="marker-table">
          <thead>
            <tr>
              <th>No</th>
              <th>도면</th>
              <th>치수 이름</th>
              <th className="num">기준치수</th>
              <th className="num">상한(+)</th>
              <th className="num">하한(−)</th>
              <th className="num">합격범위</th>
              <th>단위</th>
              <th>계측기</th>
              {editing && <th></th>}
            </tr>
          </thead>
          <tbody>
            {markers.map((m) => {
              const lim = limitsOf(m);
              return (
                <tr key={m.id}>
                  <td><b>{m.no}</b></td>
                  <td className="muted">{drawingName(m.drawingId)}</td>
                  <td>
                    {editing ? (
                      <input
                        lang="ko"
                        value={m.name || ''}
                        onChange={(e) => updateMarker(m.id, { name: e.target.value })}
                        placeholder="(이름)"
                        style={{ minWidth: 160 }}
                      />
                    ) : (
                      m.name || <span className="muted">(이름 없음)</span>
                    )}
                  </td>
                  <td className="num">
                    {editing ? (
                      <DecimalInput
                        className="right" style={{ width: 110 }}
                        value={m.nominal ?? ''}
                        onChange={(n) => updateMarker(m.id, { nominal: n })}
                      />
                    ) : (
                      <b>{dash(m.nominal)}</b>
                    )}
                  </td>
                  <td className="num">
                    {editing ? (
                      <DecimalInput
                        className="right" style={{ width: 90 }}
                        value={m.tolUpper ?? ''}
                        onChange={(n) => updateMarker(m.id, { tolUpper: n, tolMode: 'asym' })}
                      />
                    ) : (
                      dash(m.tolUpper)
                    )}
                  </td>
                  <td className="num">
                    {editing ? (
                      <DecimalInput
                        className="right" style={{ width: 90 }}
                        value={m.tolLower ?? ''}
                        onChange={(n) => updateMarker(m.id, { tolLower: n, tolMode: 'asym' })}
                      />
                    ) : (
                      dash(m.tolLower)
                    )}
                  </td>
                  <td className="num nowrap">
                    {lim ? (
                      <span style={{ fontWeight: 700 }}>
                        {fmt(lim.lo)} ~ {fmt(lim.hi)}
                        <span className="muted" style={{ fontWeight: 400 }}> {m.unit || 'mm'}</span>
                      </span>
                    ) : (
                      <span className="muted">기준치수 입력 필요</span>
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <SelectInput
                        style={{ width: 150 }}
                        value={m.unit ?? 'mm'}
                        onChange={(v) => updateMarker(m.id, { unit: v })}
                        options={unitOptions}
                        labelOf={unitLabel}
                        promptText="단위 직접 입력"
                      />
                    ) : (
                      m.unit || 'mm'
                    )}
                  </td>
                  <td>
                    {editing ? (
                      <SelectInput
                        style={{ width: 200 }}
                        value={m.gauge ?? ''}
                        onChange={(v) => updateMarker(m.id, { gauge: v })}
                        options={gaugeOptions}
                        promptText="계측기 직접 입력"
                      />
                    ) : (
                      m.gauge || <span className="muted">—</span>
                    )}
                  </td>
                  {editing && (
                    <td>
                      <button
                        className="btn sm danger"
                        onClick={async () => {
                          if (!confirm(`${m.no}번 삭제? (측정값 포함)`)) return;
                          await deleteMarker(m.id);
                          toast('삭제했습니다');
                        }}
                      >
                        삭제
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
