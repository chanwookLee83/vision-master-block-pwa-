import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSetting, setSetting } from '../lib/db.js';
import {
  fsSupported, stashSaveDir, forgetSaveDir, getSaveDir, getSaveDirHandle,
  saveDirName, writeToDir, ensurePermission, probeDir,
} from '../lib/fs.js';
import { exportAll, downloadBackup, importAll } from '../lib/backup.js';
import { Crumbs, useToast } from '../components/ui.jsx';

export default function Settings() {
  const toast = useToast();
  const fileRef = useRef(null);
  const [dirName, setDirName] = useState(null);
  const [granted, setGranted] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [status, setStatus] = useState(null); // { kind:'ok'|'err'|'info', text }
  const supported = fsSupported();

  async function refresh() {
    try {
      setDirName(await saveDirName());
      setGranted(!!(await getSaveDir()));
      setAutoSave(await getSetting('autoSave', false));
    } catch (err) {
      console.error('설정 읽기 실패:', err);
      setStatus({ kind: 'err', text: `설정 읽기 오류: ${err.name || ''} ${err.message || err}` });
    }
  }
  useEffect(() => { refresh(); }, []);

  async function choose() {
    // 1) 폴더 선택 대화상자
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'vmb-save', mode: 'readwrite' });
    } catch (err) {
      if (err && err.name === 'AbortError') return; // 사용자가 취소
      console.error('showDirectoryPicker 실패:', err);
      setStatus({ kind: 'err', text: `폴더 선택 실패: ${err.name || 'Error'} — ${err.message || err}` });
      return;
    }

    // 2) 쓰기 권한 확보 (사용자 제스처 유지 중)
    let perm;
    try {
      perm = await ensurePermission(handle);
    } catch (err) {
      console.error('권한 요청 실패:', err);
      setStatus({ kind: 'err', text: `권한 요청 실패: ${err.name || 'Error'} — ${err.message || err}` });
      return;
    }
    if (perm !== 'granted') {
      setStatus({ kind: 'err', text: `📁 ${handle.name} — 쓰기 권한이 승인되지 않았습니다(${perm}). 다시 시도해 주세요.` });
      return;
    }

    // 3) 실제로 파일을 쓸 수 있는 폴더인지 검사
    const probeErr = await probeDir(handle);
    if (probeErr) {
      setStatus({ kind: 'err', text: `📁 ${handle.name} 에 파일을 쓸 수 없습니다: ${probeErr}` });
      return;
    }

    // 4) IndexedDB(vmb_fs)에 핸들 저장
    try {
      await stashSaveDir(handle);
    } catch (err) {
      console.error('핸들 저장 실패:', err);
      setStatus({ kind: 'err', text: `폴더 정보 저장 실패: ${err.name || 'Error'} — ${err.message || err}` });
      return;
    }

    // 5) 되읽어 저장 확인
    const back = await getSaveDirHandle();
    if (!back) {
      setStatus({ kind: 'err', text: '폴더 정보가 저장되지 않았습니다 (IndexedDB vmb_fs). 브라우저 저장소 설정을 확인해 주세요.' });
      return;
    }

    await refresh();
    setStatus({ kind: 'ok', text: `저장 폴더 지정됨: 📁 ${handle.name}` });
    toast('저장 폴더를 지정했습니다');
  }
  async function reconnect() {
    const dir = await getSaveDir({ prompt: true });
    await refresh();
    setStatus(dir ? { kind: 'ok', text: '폴더 권한 승인됨' } : { kind: 'err', text: '권한이 거부되었습니다' });
  }
  async function disconnect() {
    await forgetSaveDir();
    await refresh();
    setStatus({ kind: 'info', text: '폴더 연결을 해제했습니다. 파일은 다운로드 폴더로 저장됩니다.' });
    toast('폴더 연결을 해제했습니다');
  }
  async function toggleAuto(e) {
    const v = e.target.checked;
    setAutoSave(v);
    await setSetting('autoSave', v);
  }
  async function backupNow() {
    const dump = await exportAll();
    const json = JSON.stringify(dump, null, 2);
    const name = `vmb-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const dir = await getSaveDir({ prompt: true });
    if (dir) {
      try {
        await writeToDir(dir, name, new Blob([json], { type: 'application/json' }));
        await writeToDir(dir, 'vmb-backup-최신.json', new Blob([json], { type: 'application/json' }));
        toast(`${dir.name} 폴더에 백업했습니다`);
        return;
      } catch (err) {
        toast('폴더 저장 실패: ' + err.message);
      }
    }
    downloadBackup();
  }
  async function onImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const mode = confirm('기존 데이터를 모두 지우고 이 백업으로 교체할까요?\n\n[확인] = 교체   [취소] = 병합') ? 'replace' : 'merge';
    try {
      await importAll(text, mode);
      toast(mode === 'replace' ? '백업으로 교체했습니다' : '백업을 병합했습니다');
    } catch (err) {
      alert('가져오기 실패: ' + err.message);
    }
  }

  return (
    <>
      <Crumbs trail={[{ label: '품목', to: '/' }, { label: '설정' }]} />

      <div className="panel">
        <h2>측정 데이터 저장 위치</h2>
        <p className="hint">
          지정한 폴더에 CSV·백업 파일을 직접 저장합니다. <b>네트워크 드라이브</b>(예: <code>Z:\\품질\\측정</code>)로
          연결된 <b>파일서버 폴더</b>를 선택하면 PC가 고장나도 데이터가 서버에 남습니다.
        </p>

        {!supported ? (
          <p className="pill-ng" style={{ display: 'inline-block' }}>
            이 브라우저는 폴더 저장을 지원하지 않습니다. Chrome 또는 Edge 를 사용하세요.
            (그 외에는 파일이 &lsquo;다운로드&rsquo; 폴더로 저장됩니다.)
          </p>
        ) : (
          <>
            <div className="field" style={{ marginBottom: 12 }}>
              <span>현재 저장 폴더</span>
              <div style={{ fontWeight: 700 }}>
                {dirName
                  ? <>📁 {dirName} {granted ? <span className="pill-ok">연결됨</span> : <span className="pill-ng">권한 필요</span>}</>
                  : <span className="muted">지정 안 됨 — 파일은 다운로드 폴더로 저장됩니다</span>}
              </div>
            </div>
            <div className="btn-row">
              <button className="btn primary sm" onClick={choose}>{dirName ? '폴더 변경' : '폴더 선택'}</button>
              {dirName && !granted && <button className="btn sm" onClick={reconnect}>권한 다시 요청</button>}
              {dirName && <button className="btn sm danger" onClick={disconnect}>연결 해제</button>}
            </div>

            {status && (
              <p
                className={status.kind === 'err' ? 'pill-ng' : status.kind === 'ok' ? 'pill-ok' : ''}
                style={{ display: 'inline-block', marginTop: 10, maxWidth: '100%', wordBreak: 'break-word' }}
              >
                {status.text}
              </p>
            )}

            <label className="btn-row" style={{ marginTop: 14, cursor: 'pointer', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={autoSave}
                onChange={toggleAuto}
                style={{ width: 18, height: 18 }}
              />
              <span>측정 &lsquo;완료&rsquo; 시 이 폴더에 CSV·백업(JSON)을 자동 저장</span>
            </label>
          </>
        )}
      </div>

      <div className="panel">
        <h2>백업 / 복원 (JSON 파일)</h2>
        <p className="hint">
          전체 데이터(품목·도면·치수·측정값)를 한 파일로 저장하거나 다른 PC 에서 불러옵니다.
          도면 이미지가 포함되어 용량이 클 수 있습니다.
        </p>
        <div className="btn-row">
          <button className="btn primary sm" onClick={backupNow}>지금 전체 백업</button>
          <button className="btn sm" onClick={() => fileRef.current.click()}>백업 파일 불러오기</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={onImport} />
        </div>
      </div>

      <div className="panel">
        <p className="muted" style={{ margin: 0 }}>
          모든 데이터는 이 브라우저(IndexedDB)에 저장됩니다. 브라우저 데이터를 지우면 함께 삭제되니
          정기적으로 파일서버 폴더에 백업하세요. <Link to="/">품목 목록으로</Link>
        </p>
      </div>
    </>
  );
}
