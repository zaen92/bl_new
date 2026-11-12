# 잰잇 블로그 스튜디오 — STEP 2 최종 FREE/PRO 정책

기준 `56a1092`, 브랜치 `codex/step2-ai-generation`. 신규 이메일 인증 회원에게 최초 5크레딧, FREE 계정 글 5개/평생 JSON 내보내기 5회/스타일 1개를 제공합니다. PRO(결제 구현은 STEP 3)는 글·내보내기 상품상 무제한과 여러 스타일을 지원하며 잔액 0에도 유지합니다. 새 사진은 메모리 요청으로만 분석하며 서버·기기 DB·공식 JSON에 저장하지 않습니다. 사진 미리보기는 생성 직후 가능하고 다시 열면 재첨부합니다.

현재 안내: [STEP2.md](docs/STEP2.md) · [API](docs/API.md) · [스키마](docs/SCHEMA.md) · [이전 사진/데이터 migration](docs/POLICY_MIGRATION.md) · [개인정보 안내 준비](docs/PRIVACY.md) · [검증 상태](docs/VALIDATION.md).

앱 사진용 Firebase Storage 설정/Emulator는 필요하지 않습니다. Auth/Firestore/Functions Emulator를 사용하며 기존 CSS·결과 기능을 유지합니다. `scripts/local-setup.sh` 후 `npm run emulators`와 별도 터미널 `npm run dev`를 사용합니다. 실제 API 비밀은 Secret Manager에만 등록합니다. CI는 명시적 mock이며 결제/가격 확정/운영 배포는 하지 않았습니다.

**아래는 이전 STEP 2/STEP 1의 보존 기록입니다. 무료 2회·Storage·사진 포함 JSON 안내는 폐기된 정책이며 현재 실행 안내로 사용하지 마세요.**

---

# 잰잇 블로그 스튜디오 — STEP 2 개발 브랜치

현재 브랜치는 `codex/step2-ai-generation`이며 기준 STEP 1 `d83f78c`와 브랜치를 보존합니다. 서버 AI 호출, 예약/환급, 생성 이력, 비공개 Storage, 스타일·비용 제한을 추가했습니다. 실제 키 없이 CI에서는 Emulator-only mock으로 검증합니다. **실제 Anthropic/Naver 호출·결제·운영 배포는 실행하지 않았습니다.**

**GitHub Actions 고유 앱 57개 + CI 도구 3개 통과**: https://github.com/zaen92/bl_new/actions/runs/43166390306 (앱 코드 `f6f00a0`, 실제 API는 미실행).

현재 사용법·서버 Secret Manager 등록·추정 비용 측정·한계·사진 마이그레이션은 [docs/STEP2.md](docs/STEP2.md), API는 [docs/API.md](docs/API.md), 최신 검증 상태는 [docs/VALIDATION.md](docs/VALIDATION.md)를 참고하세요. 기존 CSS/기기 저장/JSON 백업·복원은 유지합니다.

## 로컬 mock 실행 (실제 키 불필요)

1. 두 lockfile 의존성을 설치합니다: `npm ci`, `npm --prefix functions ci`.
2. 기존 `functions/.secret.local` 가입 HMAC 키는 보존합니다. 테스트용 로컬 파일에 빠진 이름만 placeholder로 추가합니다: `CLAUDE_API_KEY=emulator-only`, `NAVER_CLIENT_ID=emulator-only`, `NAVER_CLIENT_SECRET=emulator-only`. 실제 API 키를 여기에 쓰지 마세요.
3. Git 제외 `functions/.env.local`에 `AI_PROVIDER_MODE=mock`, `AI_MOCK_DELAY_MS=0`, `ENFORCE_APP_CHECK=false`를 명시합니다. `scripts/local-setup.sh`는 기존 값을 덮어쓰지 않고 누락된 Emulator 전용 placeholder를 준비합니다. mock은 Emulator에서만 허용하며 기본은 disabled입니다.
4. 정상 다운로드가 가능한 환경에서 `npm run emulators:prepare -- --storage` 후 `npm run emulators`, 다른 터미널에서 `npm run dev`를 실행합니다. 코덱스의 기존 제한 환경에서 다운로드를 반복하지 말고 GitHub Actions의 **STEP 2 AI generation mock tests**를 사용하세요.
5. `npm run test:step2:unit`은 외부 HTTP mock 10개입니다. `npm test`는 Storage까지 포함한 Emulator 47개, `npm run test:step2:e2e`는 실제 Emulator + mock worker 브라우저 4개입니다. 기존 단위/UI/Auth 검증도 유지합니다.

실제 Firebase 연결은 별도 테스트 프로젝트에서 Secret Manager/Storage/트리거/규칙을 준비해야 합니다. 결제 API는 닫혀 있습니다. 아래는 보존한 STEP 1 안내이며 해당 시점과 현재 결과를 구분하세요.

---

# 잰잇 블로그 스튜디오 — SaaS STEP 1

첨부된 `jaeinit_blog_studio_v3.html`을 기준으로, 화면의 CSS/색상/입력/결과/사진 미리보기를 유지하고 인증·API·저장 코드를 분리했습니다. 기존 API 설정 모달은 회원 계정 모달로 교체했습니다.

- Google / 이메일 로그인, 인증 메일·비밀번호 재설정
- **이메일 소유 확인 후** 첫 회원 초기화 시 서버에서 무료 2크레딧 지급
- 회원 프로필·크레딧 실시간 조회, 회원별 글 목록·원문·사진 서버 저장/불러오기
- 기기 보관함, 작성 중 자동 저장, 기존 v3 글 복사, JSON 내보내기/가져오기
- 클라이언트 금융 데이터 쓰기 전면 거부. 상품 관리만 관리자 custom claim으로 허용
- AI 생성/네이버 검색/토스 결제는 STEP 2 인터페이스만 정의. 호출하면 `unimplemented`이며 생성·과금·차감하지 않음

실제 Firebase 프로젝트 ID와 웹 설정은 제공되지 않았습니다. 기본 설정은 실서비스에 접근하지 않는 `demo-jaeinit` Emulator 모드입니다. 실제 배포는 수행하지 않았습니다.

## 파일 구조

```text
index.html                    기존 화면 마크업 + 계정/백업 UI
src/styles.css                원본 v3 CSS
src/studio.js                 입력·사진·결과·미리보기·복사 UI
src/account.js                Google/이메일 인증과 회원 상태
src/firebase.js               Firebase 설정 및 Emulator 연결
src/api.js                    Callable API·회원별 Firestore 조회
src/local-store.js            IndexedDB·기존 데이터 복사·JSON 백업
functions/src/index.js        인증 검사 및 Callable 엔드포인트
functions/src/profile.js      원자적 최초 가입 지급
functions/src/posts.js        소유권·버전 검사·사진 분할 저장
functions/src/prompt.js       원본 생성 프롬프트 보존 (다음 단계용)
firestore.rules               데이터 접근 권한
firestore.indexes.json        목록 복합 인덱스 / 큰 필드 인덱싱 제외
scripts/                      로컬 준비·Emulator·상품 초안 등록
tests/                        단위·보안 규칙·서버·브라우저 테스트
docs/                         분석·스키마·API 계약·검증 결과
```

## 로컬 실행

Node.js 22.23.4, npm, Java 21 이상이 필요합니다. Java는 Firestore Emulator에 사용됩니다. `npm ci` 후 npm 스크립트는 고정된 로컬 Node 22를 사용합니다.

```bash
cd /workspace/bl_new
bash scripts/local-setup.sh
# 터미널 1: Auth, Firestore, Functions
npm run emulators
# 터미널 2: 웹 앱
npm run dev
```

Vite 설정 파일이 없으면 Emulator 모드가 기본입니다. 명시적으로 설정하려면 `.env.example`을 `.env.local`로 복사하세요. 브라우저에서 로컬 Vite 서버를 열어 사용합니다. 다른 컴퓨터/휴대폰에서는 Emulator 주소 `127.0.0.1`을 그대로 사용할 수 없습니다.

`local-setup.sh`는 두 lockfile로 `npm ci`하고, 없을 때만 로컬 테스트용 HMAC 키 `functions/.secret.local`을 생성하고 빌드합니다. 이 파일은 Git에서 제외됩니다. 실제 API/결제 키를 이 파일이나 Vite 환경 변수에 넣지 마세요.

Emulator 최초 다운로드에는 `storage.googleapis.com` 접근이 필요합니다. 현재 Cloud 환경에서 이 도메인이 차단되어 전체 Emulator 검증은 보류 상태입니다. 환경 설정 초안에 도메인 추가를 저장해 두었습니다. 기본 패키지 다운로드 허용 목록은 유지했습니다.

Emulator 데이터는 기본적으로 종료 시 사라집니다. 유지가 필요하면 초기 실행 후 다음과 같이 내보내고 다음 시작에 가져오세요. 실제 사용자 데이터를 테스트 환경에 가져오지 마세요.

```bash
bash scripts/firebase-local.sh emulators:export .local/emulator-data --project demo-jaeinit
npm run emulators -- --import .local/emulator-data --export-on-exit .local/emulator-data
# 선택: 비활성 10/30/70회 상품 초안. 실제 가격은 미정
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed
```

Emulator 이메일 인증 링크는 Emulator 터미널 로그에 나타납니다. 메일에서 인증한 후 계정 모달의 **인증 확인 / 잔액 새로고침**을 누릅니다. Google 로그인의 Emulator 팝업은 테스트용 계정 선택기입니다.

## Firebase 실제 프로젝트 연결

1. Firebase 콘솔에서 프로젝트와 Web 앱을 생성하고 Firestore 위치를 결정합니다. Functions 기본 지역은 `asia-northeast3`입니다. Functions/Secret Manager 사용에는 적절한 결제 요금제와 IAM 권한이 필요합니다.
2. Authentication에서 **Google**과 **Email/Password**를 활성화하고, Hosting 도메인 및 필요한 개발 도메인을 Authorized domains에 등록합니다. 비밀번호 정책은 최소 8자 이상을 권장합니다.
3. 콘솔 Web 설정으로 `.env.local`의 `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`를 채우고 `VITE_USE_EMULATORS=false`로 설정합니다. Firebase 웹 API 키는 공개 클라이언트 식별 설정이며 Claude/네이버/토스 비밀키와 다릅니다.
4. Firebase CLI를 로컬에서 인증하고 프로젝트를 **명시적으로 지정**합니다. 운영 연결·배포는 이 작업에서 수행하지 않았습니다.
5. 서버 가입 식별용 비밀키를 Firebase Secret Manager에 생성합니다. 32바이트 이상의 암호학적으로 안전한 무작위 값을 보안 프롬프트에 입력합니다. 채팅/소스/명령행 인수에 값을 넣지 마세요.

   ```bash
   npx firebase functions:secrets:set SIGNUP_IDENTITY_HMAC_KEY --project YOUR_PROJECT_ID
   ```

   같은 키를 계속 유지해야 재가입 지급 방지가 유지됩니다. 키 교체는 기존 지급 식별자를 함께 보존/이전하는 별도 마이그레이션이 필요합니다. 로컬 테스트 키를 운영에 복사하지 마세요.
6. 현재 단계에서는 **공개 배포를 하지 않습니다**. 설정 후 `npm run dev`로 로컬에서 로그인만 확인할 수 있습니다. 실제 Google OAuth 성공과 서버 회원 초기화 성공을 분리해서 확인하세요. 서버 함수·규칙이 해당 테스트 프로젝트에 준비되지 않았다면 로그인 후 회원 초기화는 실패할 수 있습니다. 이 경우 OAuth 자체의 실패로 분류하지 않습니다. 배포는 별도 승인된 후속 작업입니다.

7. 관리자 권한은 신뢰할 수 있는 Admin SDK 운영 도구에서 `setCustomUserClaims(uid, {admin:true})`로 부여합니다. 브라우저에서 역할을 설정하지 않습니다. 기존 custom claim이 있으면 병합해 보존하고, 부여 후 ID 토큰을 갱신합니다. 관리자는 상품만 직접 수정할 수 있고 잔액·원장·주문은 관리자 브라우저도 직접 수정할 수 없습니다.
8. STEP 2에서 `CLAUDE_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, `TOSS_SECRET_KEY`를 **Firebase Secret Manager**에 등록하고 필요한 함수에만 `defineSecret` / `secrets`로 바인딩합니다. 현재 코드는 외부 서비스를 호출하지 않으므로 이 비밀키를 요청하거나 사용하지 않습니다. `VITE_` 변수나 Firestore에 넣지 않습니다.

실서비스에서는 본인의 계정으로 Google 로그인/이메일 인증/무료 지급/서버 권한 검증을 다시 수행해야 합니다. Emulator 결과는 실제 OAuth 설정이나 운영 IAM을 증명하지 않습니다.

## 기존 데이터 보호와 이동

원본 v3는 `jaeinit_saved_posts`에 `{id,title,type,date,data}`만 저장했습니다. 사진, 입력 원문, 분량, 작성 중 결과는 메모리에만 있었으므로 이미 닫힌 v3 세션의 사진/미저장 내용은 복구할 수 없습니다.

- 같은 브라우저 **같은 origin**에 있는 `jaeinit_saved_posts`만 자동으로 기기 보관함에 복사합니다. 원본 키는 삭제/덮어쓰기하지 않습니다. 잘못된 JSON도 유지하고 오류를 표시합니다.
- `file://` HTML에서 새 Hosting 도메인으로 옮기면 브라우저 저장소가 공유되지 않습니다. 기존 페이지를 닫기 전에 아래 방법으로 글 JSON을 내보내고 새 화면에서 **기존 글 / JSON 백업 가져오기**를 선택하세요. 기존 사진은 별도 원본에서 다시 업로드해야 합니다.
- 새 기기 저장은 IndexedDB를 사용합니다. 글·사진·입력 원문·분량·결과·작성 중 상태를 보존합니다. 브라우저 데이터 삭제/비공개 모드 종료/저장공간 부족에 대비해 JSON 백업을 보관하세요. 기기 보관함은 로그아웃해도 남으며 공용 기기에서는 다른 사용자가 볼 수 있습니다.
- 내 계정으로 복사할 때만 현재 로그인 계정에 업로드합니다. 로그인 시 기기 데이터를 자동으로 올리지 않습니다. 원본 기기 글은 유지합니다. 클라우드 글은 최근 100개를 조회하며 로컬 삭제가 서버 글을 삭제하지 않습니다.
- 클라우드 저장은 최대 20장, base64 합계 4MiB, 본문/원문 데이터 650KB 제한입니다. 초과 시 부분 저장하지 않고 오류를 표시하며 기기 원본은 남깁니다. 사진은 원본 v3와 동일하게 1400px/JPEG로 압축됩니다. 원본 사진 파일 자체를 별도로 보관하세요.
- 새로 작성/다른 글 불러오기 전에 현재 내용을 기기 보관함에 자동 백업합니다. 복원은 현재 초안을 덮지 않고 기기 글로 추가합니다.
- 오래된 `jaeinit_claude_key`, `jaeinit_naver_id`, `jaeinit_naver_sec`만 지웁니다. 이전 브라우저 노출 API 키는 발급처에서 교체하세요.

기존 v3 페이지 개발자 도구 Console에서 **글 데이터만** 내보내는 예:

```js
const raw = localStorage.getItem('jaeinit_saved_posts') || '[]';
const url = URL.createObjectURL(new Blob([raw], {type:'application/json'}));
const link = document.createElement('a');
link.href = url; link.download = 'jaeinit-v3-posts.json'; link.click();
setTimeout(() => URL.revokeObjectURL(url), 1000);
```

## 테스트

```bash
npm run test:unit    # 순수 HMAC/검증/원본 프롬프트
npm run test:ui      # Chromium: 원본 결과/사진/저장/이전/권한 UI
npm run test:auth    # 실제 Auth Emulator: 이메일 가입/로그인, Google 팝업
npm test            # Auth+Firestore+Functions: 보안 규칙 및 원자적 지급·API 통합
```

브라우저 테스트는 기본 `/usr/bin/chromium`을 사용합니다. 다른 OS에서는 `CHROMIUM_PATH`를 지정하거나 Playwright 설정의 실행 경로를 설치된 브라우저에 맞추세요. 전체 테스트는 독립된 Emulator에서 실행하며 이미 켜진 Emulator와 포트가 충돌하면 먼저 해당 개발 프로세스를 종료하세요.

검증 결과와 미검증 범위는 [docs/VALIDATION.md](docs/VALIDATION.md), 컬렉션은 [docs/SCHEMA.md](docs/SCHEMA.md), 서버 계약과 다음 단계는 [docs/API.md](docs/API.md), 원본 분석은 [docs/ANALYSIS.md](docs/ANALYSIS.md)를 참고하세요.

## STEP 1 재검증: 네트워크 및 실제 OAuth 설정

2026-11-10 재검증에서도 실행 환경은 policy revision 1이며, 저장된 초안의 두 도메인이 적용되지 않았습니다. 정확한 결과와 필수 11개 항목별 상태는 [docs/VALIDATION.md](docs/VALIDATION.md)에 기록했습니다.

네트워크 제한 해제 순서:

1. 이 클라우드 환경의 **환경 설정**에서 네트워크/인터넷 접근 설정을 엽니다.
2. 기존 `package_managers` 프리셋과 다른 허용 항목은 유지합니다. 사용자 정의 도메인에 `storage.googleapis.com`, `apis.google.com`을 추가합니다. 호스트명만 입력하고 `https://`, 경로, 포트는 넣지 않습니다. 이미 초안에 있으면 중복 추가할 필요가 없습니다.
3. 변경을 저장하여 현재 실행 환경에 적용합니다. 초안 저장과 현재 실행 환경 적용은 다릅니다. 실행 환경 상태의 정책 revision/허용 목록이 바뀌었는지 확인해야 합니다. 이 조치는 앱의 공개 배포와 다릅니다.
4. 적용 후 공식 Firestore JAR와 Google SDK URL을 새 연결로 확인하고 `npm test`, `npm run test:auth`를 재실행합니다. 계속 403이면 두 도메인과 실행 환경의 정책 적용 상태를 환경 관리자에게 확인해야 합니다. TLS/체크섬 검증을 끄거나 프록시를 우회하지 않습니다.

실제 Google OAuth 확인이 필요할 때는 Emulator 테스트와 별도로 **본인 소유 Firebase 테스트 프로젝트**를 사용합니다. Emulator 11개 테스트에는 실제 Firebase 프로젝트가 필요하지 않습니다.

1. Firebase Console → 프로젝트 설정 → 일반 → 내 앱 → Web 앱 → SDK 설정에서 공개 `apiKey`, `authDomain`, `projectId`, `appId`를 확인합니다.
2. `/workspace/bl_new/.env.local`에 아래 이름으로 입력합니다. 예시 문자열을 실제 테스트 프로젝트 값으로 바꿉니다. 실제 비밀키나 서비스 계정 JSON은 넣지 않습니다.

   ```dotenv
   VITE_FIREBASE_API_KEY=테스트프로젝트의_공개_Web_API키
   VITE_FIREBASE_AUTH_DOMAIN=테스트프로젝트ID.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=테스트프로젝트ID
   VITE_FIREBASE_APP_ID=테스트프로젝트의_Web_appId
   VITE_USE_EMULATORS=false
   ```

3. Firebase Console → Authentication → Sign-in method에서 Google과 Email/Password를 활성화하고 Google 제공자의 지원 이메일을 설정합니다. Authentication → Settings → Authorized domains에 `localhost`를 추가합니다. 로컬 확인은 `localhost` 호스트를 사용합니다. Google Cloud OAuth 동의 화면이 테스트 상태이면 사용하는 Google 계정을 테스트 사용자로 등록합니다.
4. Vite를 재시작하고 로컬 앱에서 Google 로그인을 선택합니다. 실제 창이 `accounts.google.com` 흐름인지 확인합니다. Emulator의 `127.0.0.1:9099` 계정 선택창은 실제 Google OAuth가 아닙니다.
5. 클라우드 브라우저에서 실행할 경우 Google SDK뿐 아니라 테스트 프로젝트의 `authDomain`, `accounts.google.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` 등 실제 관찰되는 인증 요청도 허용되어야 합니다. 이는 실 OAuth를 위한 조건이며 현재 두 도메인 차단 뒤의 전체 요청 경로는 아직 관찰하지 못했습니다. 필요하지 않은 와일드카드 허용은 피하고 차단된 정확한 호스트를 확인합니다.
6. 팝업 성공, Firebase Auth 사용자 생성/로그인, 서버 `ensureProfile`·크레딧 지급을 각각 별도로 기록합니다. 실제 계정 자격 증명은 사용자가 브라우저에서 직접 입력하고 채팅에 전달하지 않습니다. 테스트 후 `.env.local`을 Emulator 설정으로 돌리고 Vite를 다시 시작합니다.

현재 실제 프로젝트 설정은 제공되지 않았으며 이 실제 OAuth 시나리오는 실행하지 않았습니다.

## 독립 GitHub 관리와 Firebase 준비

현재 코드만 `zaen92/bl_new`의 `codex/step1-foundation` 브랜치에서 독립적으로 관리합니다. 다른 저장소/브랜치 코드는 가져오지 않습니다. GitHub 연결·권한 안내는 [docs/GITHUB.md](docs/GITHUB.md), Firebase 프로젝트/Web App/Auth/Firestore 생성과 환경별 설정은 [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md)를 참고하세요. 공개 배포와 STEP 2 개발은 아직 진행하지 않습니다.

## STEP 1 SDK 객체 및 Chromium 신뢰 진단

서버 코드·직접 서버 통합 테스트·상품 seed는 `functions/src/admin.js`에서 Admin SDK를 가져옵니다. 루트와 functions에 동일 버전이 설치되어도 서로 다른 모듈 경로의 `FieldValue`/`Timestamp` 객체는 섞으면 안 됩니다. 통합 테스트의 Firestore 인스턴스를 루트 SDK에서 만들지 마세요. 서버 트랜잭션은 계속 네이티브 `FieldValue.serverTimestamp()`를 사용합니다.

관리형 테스트 환경의 CA는 다음 **읽기 전용** 진단으로 시스템 체인과 사용자 Chromium NSS 저장소의 DER 지문/SSL 신뢰를 비교할 수 있습니다.

```bash
python scripts/check-browser-ca.py
```

이 스크립트는 인증서를 등록하거나 TLS 검증을 끄지 않습니다. 제공된 프록시 CA가 다른 이름으로 이미 등록되어 있을 수 있으므로 닉네임 대신 지문을 비교합니다. 등록이 없거나 시스템 체인 검증에 실패하면 환경 관리자에게 해당 환경의 검증된 CA 등록을 요청해야 합니다. 운영 시스템/일반 개발자 컴퓨터의 신뢰 저장소를 바꾸는 용도가 아닙니다.

최신 검증 상태는 `docs/VALIDATION.md`의 맨 위 SDK/CA 수정 기록을 확인하세요. 로컬 직렬화 회귀 통과와 실제 Firestore 트랜잭션 통과를 구분합니다.

## Emulator 사전 준비와 캐시 재사용

설치 단계에서 공식 바이너리를 준비하고 테스트 단계에서는 재다운로드하지 않습니다. `npm run emulators:prepare`로 Firestore를 준비하고, 개발용 UI도 필요하면 `-- --ui`를 추가하세요. `npm run emulators:check` 및 모든 Emulator 시작 명령은 같은 캐시의 크기·MD5·SHA-256과 Java를 사전 검사합니다. 기존 정상 공식 파일은 검증 후 재사용할 수 있습니다.

캐시 위치, 성공한 실행의 파일 재사용, Chromium NSS 읽기/쓰기 권한과 TLS 오류 구분은 [docs/EMULATOR_SETUP.md](docs/EMULATOR_SETUP.md)를 참고하세요. 현재 정상 JAR가 없으므로 실제 서버 검증 완료를 의미하지 않습니다.

## 독립 CI 검증

GitHub Actions의 **STEP 1 Emulator tests**가 작업 브랜치 push 및 수동 실행을 지원합니다. GitHub 호스팅 러너에서 공식 Emulator를 준비하고 기존 테스트를 실행하며, 운영 Firebase 비밀이나 배포는 사용하지 않습니다. 실행 방법·기대 테스트 수·로그 보호는 [docs/CI.md](docs/CI.md), 실제 확인된 결과는 [docs/VALIDATION.md](docs/VALIDATION.md)를 참고하세요.

STEP 1 Emulator 필수 고유 테스트 24개가 [GitHub Actions Run #2](https://github.com/zaen92/bl_new/actions/runs/43010870395)에서 모두 통과했습니다. CI 도구 3개도 별도 통과했습니다. 과거 로컬 네트워크 차단 기록은 해당 시점의 결과이며 최신 완료 근거는 `docs/VALIDATION.md` 맨 위를 참고하세요. 실제 Google OAuth/운영 연결·STEP 2·배포는 별도입니다.
