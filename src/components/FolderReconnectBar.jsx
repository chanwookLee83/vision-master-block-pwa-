import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fsSupported, getSaveDirHandle, getSaveDir } from '../lib/fs.js';

/**
 * 지정된 저장 폴더는 남아 있지만 브라우저가 쓰기 권한을 초기화한 경우
 * (브라우저 재시작 / 앱 업데이트 새로고침 후 흔함) 페이지 어디서나 보이는
 * 하단 배너로 "다시 연결" 한 번에 재승인하게 한다. 폴더를 다시 고를 필요 없음.
 */
export default function FolderReconnectBar() {
  const nav = useNavigate();
  const [name, setName] = useState(null); // 권한이 필요한 폴더 이름, 없으면 null

  async function check() {
    if (!fsSupported()) return setName(null);
    const handle = await getSaveDirHandle();
    if (!handle) return setName(null);
    const granted = await getSaveDir(); // prompt 없이 조회만
    setName(granted ? null : handle.name);
  }

  useEffect(() => {
    check();
    const onVis = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  async function reconnect() {
    // 클릭(사용자 제스처) 안에서 바로 권한 요청 — 기존 검증된 경로 재사용
    const dir = await getSaveDir({ prompt: true });
    if (dir) setName(null); else check();
  }

  if (!name) return null;
  return (
    <div className="update-bar reconnect-bar" role="alert">
      <div className="update-bar-body">
        <b>📁 {name} 폴더 쓰기 권한이 필요합니다</b>
        <p className="update-bar-list" style={{ margin: '4px 0 0' }}>
          폴더 지정은 그대로 유지되어 있습니다 — 다시 고를 필요 없이 한 번만 눌러 재연결하세요.
        </p>
      </div>
      <div className="update-bar-actions">
        <button className="btn sm" onClick={() => nav('/settings')}>설정 열기</button>
        <button className="btn sm primary" onClick={reconnect}>다시 연결</button>
      </div>
    </div>
  );
}
