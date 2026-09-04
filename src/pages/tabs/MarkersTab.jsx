import { useLiveQuery } from 'dexie-react-hooks';
import { db, updateMarker, deleteMarker } from '../../lib/db.js';
import { limitsOf, fmt } from '../../lib/tol.js';
import { Empty, useToast, DecimalInput, ListInput } from '../../components/ui.jsx';
import { DEFAULT_UNITS, DEFAULT_GAUGES, mergeOptions } from '../../lib/units.js';

export default function MarkersTab({ itemId }) {
  const toast = useToast();
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
      <h2>치수표 · 기준치수와 공차</h2>
      <p className="hint">여기서 값을 고치면 도면 마커에도 바로 반영됩니다. 공차는 상한(+) / 하한(−)로 저장됩니다.</p>
      <div className="table-wrap">
        <table>
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
              <th></th>
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
                    <input
                      value={m.name || ''}
                      onChange={(e) => updateMarker(m.id, { name: e.target.value })}
                      placeholder="(이름)"
                      style={{ minWidth: 160 }}
                    />
                  </td>
                  <td className="num">
                    <DecimalInput
                      className="right" style={{ width: 110 }}
                      value={m.nominal ?? ''}
                      onChange={(n) => updateMarker(m.id, { nominal: n })}
                    />
                  </td>
                  <td className="num">
                    <DecimalInput
                      className="right" style={{ width: 90 }}
                      value={m.tolUpper ?? ''}
                      onChange={(n) => updateMarker(m.id, { tolUpper: n, tolMode: 'asym' })}
                    />
                  </td>
                  <td className="num">
                    <DecimalInput
                      className="right" style={{ width: 90 }}
                      value={m.tolLower ?? ''}
                      onChange={(n) => updateMarker(m.id, { tolLower: n, tolMode: 'asym' })}
                    />
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
                    <ListInput
                      style={{ width: 78 }}
                      value={m.unit ?? 'mm'}
                      onChange={(v) => updateMarker(m.id, { unit: v })}
                      options={unitOptions}
                      placeholder="mm"
                    />
                  </td>
                  <td>
                    <ListInput
                      style={{ width: 200 }}
                      value={m.gauge ?? ''}
                      onChange={(v) => updateMarker(m.id, { gauge: v })}
                      options={gaugeOptions}
                      placeholder="(계측기)"
                    />
                  </td>
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
