# Vision Master Block 측정관리 PWA

Vision Master Block(마스터 블록) 도면에 **치수 번호를 지정**하고, **주차별로 측정값을 입력**하면
기준치수·공차 대비 **OK / NG 를 자동 판정**하는 오프라인 PWA 입니다.

- 서버 없음. 모든 데이터는 브라우저(IndexedDB)에 저장됩니다. → **로컬 전용 (한 PC 관리)**
- 설치형 앱(홈 화면 추가), 오프라인 동작
- 백업/복원은 JSON 내보내기·가져오기로 처리 (PC 이동 시)

## 기능

1. **품목 등록** — 품번 · 품명 · 호기 · 비고
2. **도면 업로드 + 번호 지정** — 도면 이미지(Vision#1, #2 …)를 여러 장 올리고,
   이미지 위를 클릭하면 1, 2, 3 … 번호 마커가 자동으로 붙습니다. 마커는 드래그로 이동.
3. **치수 정의** — 번호별 **기준치수(현재 치수)** 와 **공차**(± 대칭 또는 상/하한 개별),
   **단위**·**계측기** 입력. 합격 범위 = 기준치수 + 하한 ~ 기준치수 + 상한
   - **단위·계측기** — 자동완성 목록(기본값 + 이전에 입력한 값)에서 고르거나 직접 입력.
     마커 편집기의 *이 단위·계측기를 모든 번호에 적용* 으로 한 번에 지정.
     주간 측정 화면·이력·CSV 에 함께 표시됩니다.
   - **치수 영역에서 자동 읽기** — 마커 편집기에서 *치수 영역 지정* 후 도면의 치수
     텍스트를 사각형으로 감싸면, 오프라인 OCR(Tesseract.js)로 숫자를 읽어
     기준치수·공차를 자동 입력합니다. `27.888±0.02`, `27.888 +0.03/-0.01`,
     `Ø27.888` 형태를 인식하며 인식 결과를 확인 후 *이 값 적용*.
4. **주간 측정** — 측정일·**측정 시각(자동 기록)**·주차·측정자 기록 후 번호별 측정값 입력.
   입력 즉시 편차·합격범위와 **OK/NG** 표시, 측정값 칸이 OK 초록 / NG 빨강으로 바뀌고
   도면 마커도 함께 색이 바뀝니다. 입력란은 연한 파랑 배경으로 구분됩니다.
5. **측정 이력** — 번호 × 주차 매트릭스로 추이 확인. 기본은 **접힌 패널**(측정 횟수·최근 주차·NG 건수 요약만 표시), 클릭하면 펼쳐집니다. 열 머리글에 **주차 / 측정일·시각 / 측정자** 표시.
6. **내보내기 / 인쇄** — 주간 측정·이력 화면에서
   - **CSV 저장** — 지정 폴더가 있으면 그곳에, 없으면 다운로드 폴더로
   - **인쇄 / PDF** — 서식 있는 성적서를 새 창으로 열어 인쇄하거나 &lsquo;PDF로 저장&rsquo;
7. **저장 위치 지정 (설정)** — 상단 **설정** 메뉴에서
   - CSV·백업(JSON)을 저장할 **폴더 지정**. 네트워크 드라이브로 연결된
     **파일서버 폴더**(예: `Z:\품질\측정`)를 고르면 PC 고장에도 데이터가 서버에 남음
     (Chrome/Edge 의 File System Access API. 그 외 브라우저는 다운로드로 대체)
   - **측정 &lsquo;완료&rsquo; 시 자동 저장** 옵션
   - 전체 **백업 / 복원** (JSON)

## 개발 / 실행

```powershell
cd "C:\Users\USER\vision-master-block-pwa"
npm install
npm run dev        # 개발 서버 (http://localhost:5173)
npm run build      # dist/ 생성
npm run preview     # 빌드 결과 미리보기
```

아이콘을 다시 만들려면: `npm run gen-icons`

OCR 자산 중 워커/코어는 `npm run build` 시 `node_modules` 에서 복사되고,
학습데이터 `public/ocr/eng.traineddata.gz` 는 저장소에 커밋되어 있어
CI 빌드가 네트워크 없이 완결됩니다. 수동 갱신: `npm run setup:ocr`.
파싱 규칙 테스트: `npm run test:parse`.

## 배포 (GitHub Pages)

`main` 또는 `master` 브랜치에 push 하면 `.github/workflows/pages.yml` 이
빌드(`npm ci` → `npm run build`) 후 `dist/` 를 Pages 에 배포합니다.

1. GitHub 에 저장소 생성 후 **전체 소스**를 push (아래 "커밋 대상" 참고)
2. 저장소 **Settings → Pages → Source → GitHub Actions** 선택
3. Actions 탭에서 "Deploy PWA to GitHub Pages" 완료 확인 → `https://<계정>.github.io/<저장소>/`
4. 그 주소를 Chrome/Edge 로 열고 주소창 오른쪽 **설치** 아이콘으로 PC 앱 설치

`user.github.io` 형태가 아닌 일반 저장소면 base 경로(`/저장소이름/`)는 워크플로가 자동 설정합니다.

### 커밋 대상 (Git 에 올리는 파일)

올림: `src/`, `public/`(favicon·icons·`ocr/eng.traineddata.gz`), `scripts/`,
`index.html`, `vite.config.js`, `package.json`, `package-lock.json`,
`.github/`, `.gitignore`, `.gitattributes`, `README.md`

올리지 않음(`.gitignore` 처리): `node_modules/`, `dist/`, `dev-dist/`,
`public/ocr/`(worker·core — 빌드 시 재생성)

> `dist/` 는 **커밋하지 않습니다.** GitHub Actions 가 매 push 마다 새로 빌드합니다.

사내 IIS 등 정적 호스팅에 올릴 때는:

```powershell
$env:VITE_BASE = "/vmb/"   # 서브 경로에 둘 경우
npm run build
# dist/ 폴더 전체를 업로드
```

## 파일 구조

```
src/
  lib/db.js          Dexie(IndexedDB) 스키마 + CRUD
  lib/tol.js         공차 계산 / OK·NG 판정 / ISO 주차
  lib/units.js       단위·계측기 기본 목록 + datalist 옵션 병합
  lib/backup.js      JSON 백업 내보내기·가져오기(병합/교체)
  lib/ocr.js         치수 영역 크롭 + Tesseract.js OCR + 치수 텍스트 파싱
  lib/fs.js          File System Access — 저장 폴더 지정/쓰기, 다운로드 대체
  lib/report.js      CSV · 인쇄용(성적서/이력) HTML 생성
  components/
    MarkerCanvas.jsx 도면 위 마커 표시·클릭 추가·드래그·치수 영역(ROI) 지정
    ui.jsx           토스트 / 브레드크럼 / 이미지 리사이즈 / datalist 입력 / 접이식 패널
  pages/
    ItemList.jsx     품목 목록
    ItemForm.jsx     품목 등록·수정
    Settings.jsx     저장 폴더 지정 · 자동 저장 · 백업/복원
    ItemDetail.jsx   탭 컨테이너
    MeasureEntry.jsx 주간 측정 입력 화면
    tabs/
      DrawingsTab.jsx  도면 업로드 + 번호 지정
      MarkersTab.jsx   치수표(기준치수·공차 일괄 편집)
      SessionsTab.jsx  주간 측정 세션 목록
      HistoryTab.jsx   번호 × 주차 이력 매트릭스
```

## 데이터 모델

| 테이블 | 내용 |
|---|---|
| `items` | 품번·품명·호기 |
| `drawings` | 도면 이미지(dataURL) |
| `markers` | 지정 번호 = 치수 항목 (위치 xr/yr, 기준치수, 공차 상/하한, 단위 `unit`, 계측기 `gauge`, 치수 인식 영역 `roi`) |
| `sessions` | 주간 측정 회차 (측정일 `date`, 측정 시각 `time`, 주차, 측정자) |
| `readings` | 세션 × 마커 측정값 |
| `settings` | 앱 설정 (자동 저장 옵션 등) — key 로 조회 |

> 저장 폴더 핸들(`FileSystemDirectoryHandle`)은 Dexie 로 저장이 안 되므로 별도 IndexedDB `vmb_fs` 에 직접 보관합니다 ([src/lib/fs.js](src/lib/fs.js)).
