# GitHub 독립 관리 전환 재검증 — 2026-11-10 14:38 이후 (KST)

현재 코드만 `codex/step1-foundation` 작업 브랜치로 분리했습니다. 기존 origin `https://github.com/zaen92/bl_new.git`의 읽기 접근이 확인되었고 원격에는 브랜치가 없었습니다. 다른 저장소 코드 가져오기, 병합, main 변경, 파일 구조 변경, 앱 공개 배포, STEP 2 개발은 하지 않았습니다.

이번 실행 결과:

| 명령 / 검증 | 결과 |
|---|---|
| `npm run build` | 통과. SDK 번들 크기 경고만 있음 |
| `npm run test:unit` | 3 통과 |
| `npm run test:ui` | 4 통과 |
| `npm run test:auth` | 이메일 1 통과 / Google 팝업 1 실패: apis.google.com 터널 연결 차단 |
| `npm test` | 명령 실패(exit 1), Firestore JAR 공식 다운로드 403. 보안 4 + 서버 7 = **11개 본문 미실행** |
| 실제 Google OAuth | 실제 프로젝트 설정 없음, 미실행. Emulator와 별도 |

`storage.googleapis.com`과 `apis.google.com`의 새 HTTPS 요청은 모두 프록시 CONNECT 403입니다. 현재 실행 정책은 revision 1 / enforced / 사용자 정의 허용 목록 빈 상태이며, 환경 설정 초안의 두 도메인은 아직 적용되지 않았습니다. 환경 설정에서 기존 프리셋을 유지하며 두 호스트를 추가한 변경을 저장하고 **현재 실행 환경에 적용**해야 합니다. 적용 후 새 연결과 `npm test`, `npm run test:auth`로 재검증합니다. 초안 저장만으로 검증 성공이나 런타임 반영을 주장하지 않습니다.

무료 2개·반복 로그인·재가입·동시 지급·타인 글/잔액/결제 기록 권한은 테스트 정의가 있으나 Firestore가 시작되지 않아 여전히 검증 미완료입니다. 따라서 STEP 2 착수 조건은 충족되지 않았으며 착수하지 않았습니다.

자동 테스트 합계는 **8 통과 / 1 실패 / 11 미실행**입니다. 실제 Google OAuth는 별도 미실행입니다.

이번 변경은 독립 저장소 관리·Firebase 연결 준비 문서 및 검증 기록입니다. `functions/src/prompt.js` 파일 끝의 여분 빈 줄만 정리했으며 로직은 바꾸지 않았습니다. 기존 UI/CSS/애플리케이션 소스, 의존성, 비밀 파일을 변경하지 않았습니다. 커밋 대상에서 `.env.local`, `functions/.secret.local`, `.local` 원시 로그/백업, node_modules, dist를 제외했습니다. 로컬 테스트용 HMAC 키도 Git에 넣지 않았습니다.

이번 원시 로그는 Git 제외 경로 `.local/git-step1-{build,unit,ui,auth,firestore}.log`에 보관합니다. GitHub 권한 안내는 `docs/GITHUB.md`, 실제 Firebase 프로젝트/Web App/Auth/Firestore 생성·로컬/운영 설정 구분은 `docs/FIREBASE_SETUP.md`에 있습니다.

---

# STEP 1 검증 기록

## 최신 재검증 — 2026-11-10 (KST)

대상: `/workspace/bl_new`. STEP 1 범위만 재검증했으며 앱 공개 배포, 실제 Firebase 프로젝트 변경, STEP 2 기능 개발은 수행하지 않았습니다. 기존 UI/CSS/애플리케이션 로직도 변경하지 않았습니다.

환경: 로컬 Node 22.23.4, npm 11.9.0, Java 21.0.13, Chromium. 실제 Firebase Web 설정 환경 변수와 `.env.local`은 없으며 `demo-jaeinit` Emulator 기본 모드입니다. 로컬 HMAC 비밀 파일은 존재 여부만 확인하고 값을 읽거나 출력하지 않았습니다. 플랫폼 ADC 변수의 존재만으로 실제 Firebase 프로젝트 연결이 있다고 판단하지 않았습니다.

### 실행 결과

| 범위 | 통과 | 실패 | 미실행 | 근거 |
|---|---:|---:|---:|---|
| 단위 `npm run test:unit` | 3 | 0 | 0 | HMAC·입력 검증·원본 프롬프트 |
| 브라우저 UI `npm run test:ui` | 4 | 0 | 0 | 기존 글/사진/결과/초안/JSON 복원·비로그인 생성 차단 |
| Auth Emulator `npm run test:auth` | 1 | 1 | 0 | 이메일 가입/로그인 통과. Google 팝업은 네트워크 차단으로 실패 |
| 필수 Firestore 보안·서버 테스트 | 0 | 0 | **11** | `npm test` 실행했지만 JAR 다운로드 단계에서 중단. 테스트 본문은 시작하지 않음 |
| 실제 Google OAuth | 0 | 0 | 1 시나리오 | 실제 Firebase Web 설정/제공자 설정이 없어 미실행. Emulator Google 팝업과 구분 |

총 자동 테스트 기준 **8 통과 / 1 실패 / 11 미실행**입니다. 실제 OAuth는 이 자동 테스트 합계와 별도입니다. `npm test`의 명령 자체는 exit 1로 실패했지만, 실행하지 못한 11개를 테스트 실패 또는 성공으로 세지 않습니다. 전체 `npm test`에는 단위 테스트 3개도 포함되며 이번에는 단위 전용 명령으로 별도 검증했습니다.

- `npm run build`: 통과. Firebase SDK 포함 JS 번들 500KB 초과 경고가 있으며 빌드 오류는 없습니다.
- Firebase SDK 재다운로드: 공식 `registry.npmjs.org`에서 `firebase@12.19.0`, `@firebase/auth@1.13.6` tarball을 새 HTTPS 연결로 내려받고 각 SHA-512를 `package-lock.json`의 integrity와 비교해 일치 확인. 설치 버전·lockfile은 변경하지 않았습니다.
- Firestore Emulator 재다운로드: 공식 CLI로 `cloud-firestore-emulator-v1.19.8.jar` 재시도, `403 Domain forbidden`, exit 1. 빈 캐시에 정상 JAR가 생기지 않았고 서명/체크섬/TLS 검증을 우회하지 않았습니다.

### 네트워크 정책과 정확한 재현 근거

실행 환경 ID: `ccarenv_b64_Y2NhcmVudl8xNzI5ZjljYjgwNmM4MTkxODNjOTQ4YTNlZDcyMGJmYw`.

재검증 시작 시 상태: `spec_revision=1`, `observed_spec_revision=1`, `observations_current=true`, network policy `enforced`, 사용자 정의 `allowed_hosts=[]`. 환경 설정 초안 revision 3에는 `apis.google.com`, `storage.googleapis.com`이 저장되어 있으나 현재 실행 정책에는 적용되지 않았습니다. `/etc/codex/network-policy.json`은 시작 정책 스냅샷으로만 참고했습니다.

| 공식 목적지 | 이번 새 요청의 결과 | 필요한 조치 |
|---|---|---|
| `registry.npmjs.org` | HTTPS 200 및 두 SDK tarball SHA-512 검증 통과 | 기존 패키지 프리셋 유지 |
| `storage.googleapis.com` | 프록시 CONNECT 403 / CLI `Domain forbidden` | 현재 환경 사용자 정의 허용 목록에 적용 |
| `apis.google.com` | 프록시 CONNECT 403 / 브라우저 `net::ERR_TUNNEL_CONNECTION_FAILED` | 현재 환경 사용자 정의 허용 목록에 적용 |

공식 파일 URL:

- `https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.19.8.jar`
- `https://apis.google.com/js/api.js`

Firebase CLI의 MOTD/remote-config 경고는 자체 메시지에서도 non-fatal로 분류됩니다. 이번 필수 차단은 위의 JAR 다운로드입니다. 아직 관찰되지 않은 다른 호스트까지 무조건 허용하지 않았습니다. 정책 적용 후 리다이렉트/추가 SDK 요청이 차단되면 실제 요청의 정확한 호스트를 추가로 확인해야 합니다.

설정 방법: 환경 설정 → 네트워크/인터넷 접근 → 기존 프리셋·항목을 유지하며 두 호스트를 추가 → 변경 저장·현재 환경 적용 → 실행 정책 revision 및 허용 목록 재확인 → 새 연결로 재시도. 이미 초안에 있으므로 중복 선언이나 비밀키 추가는 필요하지 않습니다. 공개 앱 배포는 필요하지 않습니다. 자세한 연결 절차와 테스트 프로젝트의 공개 Web 설정 입력 위치는 README의 ‘STEP 1 재검증’ 절에 있습니다.

### Google 로그인: 환경 제한과 코드 검증의 구분

실제 Google OAuth는 미실행입니다. Auth Emulator의 Google 제공자 계정 선택창 테스트는 실행되어 **실패**했습니다. 클릭 후 SDK 요청 로그에서 `https://apis.google.com/js/api.js net::ERR_TUNNEL_CONNECTION_FAILED`가 기록되었고, 팝업 이벤트가 발생하지 않아 30초 후 타임아웃됐습니다. 화면은 `auth/internal-error`를 표시했습니다.

코드는 공식 Firebase SDK `signInWithPopup(auth, new GoogleAuthProvider())`를 사용합니다. 설치된 SDK가 Emulator에서도 GAPI 라이브러리를 먼저 로드하는 경로를 확인했습니다. 따라서 **관찰된 현재 실패의 직접 원인은 SDK 로드 단계의 네트워크 차단**입니다. 네트워크가 복구된 뒤의 팝업/토큰 교환/서버 초기화까지 정상인지 또는 추가 코드 결함이 있는지는 아직 검증할 수 없으며, 코드 전체에 문제가 없다고 단정하지 않습니다.

실제 OAuth 검증은 별도 테스트 Firebase 프로젝트의 공개 Web 설정, Google 제공자 활성화, `localhost` authorized domain, 필요한 경우 동의 화면 테스트 사용자 등록이 필요합니다. 실제 Google 로그인, Firebase Auth 성공, 서버 회원 초기화 성공을 각각 기록해야 합니다. 서비스 계정/Claude/네이버/토스 비밀키를 브라우저에 넣는 방식은 사용하지 않습니다.

### 필수 11개 테스트별 상태

아래는 기존 테스트 수를 유지한 채 요청된 검증을 강화한 목록입니다. 모두 Firestore 다운로드 차단으로 **미실행**입니다.

| 번호 | 파일 | 시나리오 | 결과 |
|---:|---|---|---|
| 1 | security.test.js | 익명 회원/잔액/원장/주문/글/상품 읽기 거부 | 미실행 |
| 2 | security.test.js | 본인 읽기 허용, 타인 읽기·타인 uid 필터 조회·전체 조회 거부, 사진 소유권 | 미실행 |
| 3 | security.test.js | 일반 사용자와 관리자 브라우저의 금융/글 생성·변경·삭제 거부. 본인과 **타인 실제 문서** 모두 대상 | 미실행 |
| 4 | security.test.js | 관리자 custom claim 상품 쓰기 및 가격/수량 검증 | 미실행 |
| 5 | server.test.js | 12개 동시 회원 초기화와 반복 요청에서 정확히 잔액 2 / +2 원장 1개 | 미실행 |
| 6 | server.test.js | 프로필 삭제/재생성, 동일 이메일·대소문자/공백 변형 재가입 시 재지급 없음 | 미실행 |
| 7 | server.test.js | 다른 UID 두 개의 동일 이메일 동시 초기화 지급 합계 2 | 미실행 |
| 8 | server.test.js | 미인증/비활성 계정 프로필 생성 거부 | 미실행 |
| 9 | server.test.js | 서버 글·사진·원문 원자 저장, 소유권, CAS, 요청 멱등성, 사진 교체 | 미실행 |
| 10 | server.test.js | 잘못된/대형 이미지 거부 및 부분 클라우드 쓰기 없음 | 미실행 |
| 11 | server.test.js | 실제 Auth→Callable: **8개 동시 초기화, 3번 실제 재로그인**, 변조 credits 무시, 잔액 2/원장 1개 유지, 재가입·비활성 거부, 닫힌 인터페이스 | 미실행 |

무료 2개가 정확히 지급되는지, 로그인/동시 요청에서 중복 지급되지 않는지, 타인 글·크레딧·결제 기록 읽기/수정이 막히는지는 구현과 테스트 정의를 정적 확인했을 뿐, 이번에도 실제 Firestore 결과로 증명하지 못했습니다. 운영 사용 가능 또는 보안 검증 완료로 표시하지 않습니다.

### 이번 변경 파일과 재시도

- `tests/security.test.js`: 타인 uid 쿼리와 타인 실제 문서 변경/삭제 거부 검증 추가.
- `tests/server.test.js`: 기존 Callable 시나리오 안에 동시 요청과 실제 반복 로그인·원장 수 확인 추가.
- `README.md`: 현재 공개 배포 금지 명시, 네트워크 적용·실제 테스트 Firebase 설정 단계 추가.
- `docs/VALIDATION.md`: 현재 결과, 개별 11개 상태, OAuth 구분 기록.
- UI/CSS/운영 소스/Firestore 규칙/Secret 값/의존성·lockfile은 변경하지 않았습니다. 새 테스트 assertion들은 Firestore 차단으로 아직 실행되지 않았습니다.

원시 로그는 Git 제외 경로 `.local/step1-firestore-recheck.log`, `.local/step1-auth-recheck.log`, `.local/step1-unit-recheck.log`, `.local/step1-ui-recheck.log`, `.local/step1-build-recheck.log`에 보관했습니다. Auth 로그의 링크/코드는 테스트 데이터이지만 외부 공유하지 않습니다. SDK 검증 tarball과 보조 스크립트도 `.local/sdk-verification/`, `.local/verify-sdk-download.mjs`에만 두었습니다.

네트워크 변경이 실제 반영된 뒤 `npm test`, `npm run test:auth`를 재실행하고 이 기록을 갱신해야 합니다. 전체 Emulator 테스트에는 실제 Firebase 프로젝트나 서비스 계정 키가 필요하지 않습니다.

---

# 이전 구현 시점 기록 (재검증 결과와 별도)


검증 환경: Node 22.23.4 (npm 스크립트 로컬 런타임), npm 11.9.0, Java 21, 시스템 Chromium. 2026-11-10.

| 명령 / 범위 | 결과 | 확인한 내용 |
|---|---|---|
| `bash scripts/local-setup.sh` | 통과 | root/functions lockfile 설치, 테스트용 키 보존, Vite 빌드. 재실행 완료 |
| `npm run build` | 통과 | 모듈/번들 빌드. Firebase SDK 포함 JS 500KB 초과 경고 있음 |
| `npm run test:unit` | **3 통과** | HMAC 정규화/키 검증, 글 입력 검증, 원본 한국어 생성 프롬프트 계약 |
| `npm run test:ui` | **4 통과** | 실제 Chromium에서 아래 흐름 검증 |
| `npm run test:auth` | **1 통과, 1 실패(환경 차단)** | 이메일 가입/로그인/인증 필요 표시/로그아웃 통과. Google 팝업은 SDK 로드 오류로 열리지 않음 |
| `npm test` | **시작 단계 차단, Emulator 테스트 미실행** | 공식 Firestore JAR 다운로드 `403 Domain forbidden` |

브라우저 4개 시나리오:

1. 기존 v3 글 복사·원본 키 유지, 오래된 비밀키 제거, 제목 3개/위치/본문 표시, 실제 사진 압축·미리보기, 새로고침 후 사진·입력·결과 복원, 기기 저장, JSON 백업 파일 내용에 사진/원문이 있고 옛 비밀키가 없는지 확인.
2. 비로그인 생성 버튼 → 로그인 모달/오류, 입력 유지, Claude/네이버/토스 외부 요청 0건.
3. 저장된 HTML 문자열이 장소/미리보기에서 실행되지 않음, 기기 삭제 후 새로고침 시 원본 v3 JSON에서 다시 생기지 않음, 원본 JSON 자체는 보존.
4. JSON 복원으로 원문·사진을 되살리고 현재 초안은 유지, 같은 파일 재가져오기 중복 방지.

## 환경 차단의 진단

- `storage.googleapis.com`: Firebase CLI가 `https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.19.8.jar`를 받으려다 `403 Domain forbidden`으로 종료했습니다. 체크섬/TLS 검증을 우회하지 않았습니다.
- `apis.google.com`: Google 로그인 팝업의 Firebase Auth SDK는 Emulator에서도 `https://apis.google.com/js/api.js`를 먼저 로드합니다. 현재 Cloud 프록시의 직접 HEAD 요청이 `403 Forbidden`입니다. 브라우저에는 `auth/internal-error`가 표시되어 팝업 테스트가 타임아웃됐습니다. 해당 SDK 로딩 코드와 네트워크 거부를 확인했습니다. 실제 운영 Google OAuth 성공 여부는 확인하지 못했습니다.
- 두 호스트 추가를 환경 설정 **초안**에 저장했습니다. 초안 저장은 런타임 적용이나 환경 게시를 뜻하지 않습니다. 변경이 적용되면 새 연결로 재검증해야 합니다.

## 작성했지만 아직 실행하지 못한 테스트

보안 규칙 4개 (`tests/security.test.js`): 익명 조회 거부, 본인/다른 회원 읽기·쿼리 제한·사진 권한, 관리자 포함 금융 데이터 쓰기 거부, 상품 관리자 claim·가격 검증.

서버 통합 7개 (`tests/server.test.js`): 12개 동시 초기화·반복 요청의 정확히 2크레딧/원장 1개, 탈퇴/재가입/동일 이메일/프로필 재생성 방지, 다른 UID 동일 이메일 동시 요청, 미인증/비활성 계정 거부, 사진/원문 보존·CAS·소유권·요청 멱등성, 잘못된/대형 이미지 원자적 거부, 실제 Auth → Callable 무료 지급/재가입/STEP 2 닫힘/저장·불러오기.

**위 11개를 통과했다고 주장하지 않습니다. 규칙 컴파일과 Firestore 트랜잭션의 실제 동작은 Emulator 접근 복구 후 확인해야 합니다.** 전체 `npm test`에는 별도 통과한 단위 테스트 3개도 포함됩니다.

## 미검증 / 명시적 제한

- 실제 Firebase 프로젝트 연결·배포·운영 IAM/Secret Manager·Google OAuth·실제 메일 수신.
- 실제 AI/네이버/토스 호출과 SSE 결과 생성, 결제/크레딧 차감·환불: 요청된 STEP 2 범위로 미구현.
- 원본 v3가 저장하지 않았던 사진/입력은 소급 복구 불가. HTML 파일에서 Hosting으로 origin이 바뀔 때 자동 이전 불가, JSON 가져오기를 사용해야 함.
- IndexedDB는 기기 저장이므로 브라우저 초기화·용량 제한·OS 중단에서 절대 보존을 보장하지 않음. 백업과 명시적 계정 복사를 제공.
- same-email 가입 지급만 방지. 별칭/여러 이메일을 이용한 한 사람의 중복 가입 방지는 별도 정책 필요.
- 저장 UI 서버 복사의 응답 유실 후 재클릭은 새 글 중복 복사가 생길 수 있음. 원본 삭제나 결제 중복 처리는 발생하지 않음.
- 환경 초안은 저장했지만 게시 및 새 작업에서의 복원 검증은 수행하지 않음. 현재 Git 파일은 모두 신규이며 커밋/원격 push는 수행하지 않음.
