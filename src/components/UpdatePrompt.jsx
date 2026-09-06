import { useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { APP_VERSION, CHANGELOG } from '../lib/changelog.js';

const SEEN_KEY = 'vmb.seenVersion';

/**
 * 하단 고정 알림 바.
 *  - 새 서비스워커 감지 시: 업데이트 내역 + "지금 업데이트" 버튼 (누르면 새로고침되며 적용)
 *  - 업데이트 후 첫 실행 시: 방금 바뀐 내용을 안내 (기존 사용자에게만)
 */
export default function UpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [whatsNew, setWhatsNew] = useState(false);
  const updateSW = useRef(() => {});

  // 서비스워커 등록 (registerType: 'prompt' → 자동 적용 안 하고 콜백만)
  useEffect(() => {
    updateSW.current = registerSW({
      immediate: true,
      onNeedRefresh() { setNeedRefresh(true); },
    });
  }, []);

  // 버전이 올라갔으면 "무엇이 바뀌었나" 안내 (첫 설치 사용자에겐 표시 안 함)
  useEffect(() => {
    let seen = null;
    try { seen = localStorage.getItem(SEEN_KEY); } catch { /* private mode 등 */ }
    if (seen == null) {
      try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* noop */ }
      return;
    }
    if (seen !== APP_VERSION) setWhatsNew(true);
  }, []);

  const latest = CHANGELOG[0];
  if (!latest) return null;

  const notes = (
    <ul className="update-bar-list">
      {latest.items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );

  if (needRefresh) {
    return (
      <div className="update-bar" role="alert">
        <div className="update-bar-body">
          <b>새 버전이 준비되었습니다 · v{latest.version}</b>
          {notes}
        </div>
        <div className="update-bar-actions">
          <button className="btn sm" onClick={() => setNeedRefresh(false)}>나중에</button>
          <button className="btn sm primary" onClick={() => updateSW.current(true)}>지금 업데이트</button>
        </div>
      </div>
    );
  }

  if (whatsNew) {
    const done = () => {
      try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch { /* noop */ }
      setWhatsNew(false);
    };
    return (
      <div className="update-bar" role="status">
        <div className="update-bar-body">
          <b>업데이트 완료 · v{latest.version} <span className="muted">({latest.date})</span></b>
          {notes}
        </div>
        <div className="update-bar-actions">
          <button className="btn sm primary" onClick={done}>확인</button>
        </div>
      </div>
    );
  }

  return null;
}
