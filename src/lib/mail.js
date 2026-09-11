// 등록 이메일로 "메일 보내기" — 서버가 없는 클라이언트 PWA라 첨부 자동 전송은
// 불가능하다(mailto 는 첨부를 지원하지 않음). 대신 파일을 먼저 내려받고,
// 등록된 주소·제목이 채워진 메일 작성창을 열어 사용자가 첨부해 보내도록 한다.
import { download } from './fs.js';

// mailto: 링크를 열어 기본 메일 앱의 새 메일 작성창을 띄운다.
export function openMailto({ to = '', subject = '', body = '' }) {
  if (!to) return false;
  const parts = [];
  if (subject) parts.push(`subject=${encodeURIComponent(subject)}`);
  if (body) parts.push(`body=${encodeURIComponent(body)}`);
  const q = parts.length ? `?${parts.join('&')}` : '';
  window.location.href = `mailto:${to}${q}`;
  return true;
}

// 파일을 다운로드하고, 그 파일을 첨부해 보내라는 안내가 담긴 메일 작성창을 연다.
export function sendFileByEmail({ to, subject, filename, blob }) {
  if (!to) return false;
  download(filename, blob);
  const body =
    `첨부파일 "${filename}" 을(를) 다운로드 폴더에서 이 메일에 첨부한 뒤 보내주세요.\n` +
    `(브라우저 보안 정책상 메일에 파일을 자동으로 첨부할 수 없습니다.)`;
  openMailto({ to, subject, body });
  return true;
}
