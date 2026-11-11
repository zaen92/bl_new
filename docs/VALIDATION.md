# GitHub Actions 독립 CI 구축 — 2026-11-11 (KST)

`.github/workflows/step1-tests.yml`을 추가했습니다. GitHub 호스팅 Ubuntu 24.04 / Node 22.23.4 / Temurin Java 21.0.13+9에서 두 lockfile 설치, 공식 Firestore 준비·검증, 실제 Auth/Firestore/Functions 실행, 빌드/단위/UI/Auth 검증을 구성했습니다. push 대상은 `codex/step1-foundation`이며 workflow_dispatch도 지원합니다. 현재 코덱스 환경에서 Firebase/브라우저 다운로드는 재시도하지 않았습니다.

## 실행 증거 상태

이 문서 작성 시점에는 **GitHub 실제 실행 결과를 아직 확인하지 않았습니다**. Workflow 구성/로컬 검사와 GitHub CI 완료는 구분합니다. 실제 실행 URL과 결과가 확인되면 별도 기록합니다. 이 단락은 STEP 1 완료 판정의 증거가 아닙니다.

GitHub API의 기존 인증으로 읽기 요청을 시도했으나 `api.github.com` 연결이 `Forbidden`이었습니다. GitHub Actions 웹 페이지는 HTTP 200이어서 push 후 공개 페이지에서 실행 여부를 확인할 예정입니다. 인증값은 출력하지 않았고 새 비밀이나 서비스 계정은 요청하지 않았습니다.

로컬에서 수행한 추가 검사: CI 로그 제거/집계/실패 코드 보존 회귀 **3개 통과**, 기존 단위 **7개 통과**. 실제 Emulator 서버 11개를 이 결과로 대신하지 않습니다.

## 구성 및 보호

- Actions는 공식 저장소 태그를 읽어 확인한 commit SHA로 고정하고 런타임은 기존 `.nvmrc`와 정확한 Java 21 버전을 지정했습니다. 프로젝트 의존성은 두 lockfile의 `npm ci`로 고정합니다.
- CI 캐시에는 공식 검증을 통과한 JAR만 저장합니다. 실제 운영 Firebase/서비스 계정/결제/API 비밀은 사용하지 않습니다.
- 가입 HMAC 키는 job마다 임의 생성한 Emulator 전용 로컬 파일입니다. 로그에 출력하거나 artifact/cache에 포함하지 않고 마지막에 삭제합니다. 값 대신 타임스탬프 문자열을 쓰거나 보안 규칙을 완화하지 않습니다.
- `scripts/ci-run.mjs`, `ci-utils.mjs`, `ci-summary.mjs`가 로그의 테스트 비밀·Bearer/JWT·이메일 인증 코드 등을 출력 전에 제거하고 원래 exit status와 실제 테스트 수를 기록합니다. 실행하지 않은 단계는 not run입니다. 0개·skip·누락을 통과로 표시하지 않습니다.
- Artifact는 가공된 로그/숫자 JSON만 포함합니다. 원시 debug log·브라우저 trace·비밀 파일·Emulator 데이터는 업로드하지 않습니다.
- Google 외부 SDK 실패는 Auth 단계의 실패로 유지하고 실제 Google OAuth와 구분합니다. 다른 단계가 실행되도록 조건을 분리했으며 `continue-on-error`는 없습니다.
- 서버 테스트가 종료할 때 실제 Admin Firestore 연결과 app을 정리하도록 after hook을 추가했습니다. 검증 assertion/비즈니스 로직은 유지했습니다. UI/CSS/앱 기능 변경은 없습니다.

필수 고유 case: 단위 7 + UI 4 + Auth 2 + 보안 4 + 서버 7 = **24개**, CI 도구 3개는 별도입니다. `npm test`의 18개에는 동일 단위 7개가 다시 포함되므로 중복 집계하지 않습니다. 로컬 결과와 GitHub 결과도 합산하지 않습니다. 수동 실행·권한 안내는 `docs/CI.md`를 참고하세요.

---

# 이전 작업 기록 (해당 시점 결과)

# Emulator 실행 환경·캐시 안정화 — 2026-11-11 (KST)

기준 커밋 `6defd55`, 작업 브랜치 `codex/step1-foundation`. UI/CSS·앱 기능·서버 비즈니스 로직·Firestore 규칙은 변경하지 않았습니다. 다른 저장소 통합·실제 Firebase 배포·STEP 2 개발은 없습니다.

## 캐시 조사와 변경

- 프로젝트 지정 캐시 `/workspace/.cache/firebase`는 비어 있었고 공식 기본 캐시 `/home/agent/.cache/firebase/emulators`도 없었습니다. 접근 가능한 `/workspace`, `/tmp`, `/opt`의 파일 검색에서도 정상 Firestore JAR를 확보하지 못했습니다. 일부 다른 프로세스의 `/tmp` 디렉터리는 접근 거부이므로 전체 머신 어디에도 파일이 없다고 단정하지 않습니다.
- 공식 CLI 14.27.0은 JAR가 있으면 재사용하지만 시작 때 기존 파일의 해시를 다시 검사하지는 않습니다. 반면 `setup:emulators:firestore`는 기존 파일 유무와 무관하게 다운로드합니다. 테스트가 캐시를 지우는 코드는 없었습니다. 성공했던 다른 실행의 캐시 경로/볼륨이 달랐는지는 이 정보만으로 확정할 수 없습니다.
- `scripts/emulator-cache.mjs`, `scripts/prepare-emulators.mjs`를 추가했습니다. 설치된 CLI의 공식 메타데이터에서 버전·공식 HTTPS URL·크기·MD5·SHA-256을 읽습니다. 정상 대상은 재다운로드하지 않습니다. CLI 기본 캐시 또는 명시한 재사용 디렉터리의 파일도 동일 기준을 만족해야 하며 복사 후 다시 검증합니다.
- 누락 때만 고정된 공식 CLI로 다운로드하고 무결성을 재검사합니다. 검증 실패한 파일을 실행하지 않으며 준비 모드에서는 별도 `.invalid-artifacts` 디렉터리에 보존합니다. 임의 미러/체크섬 수정/검증 없는 binary override를 사용하지 않습니다.
- `scripts/local-setup.sh` 끝에 Firestore/선택적 개발 UI 사전 준비를 추가했습니다. `scripts/firebase-local.sh`는 서비스/테스트 시작 전 캐시를 읽기 전용 검사하고, 누락·손상 시 다운로드 없이 실패합니다. Auth-only 실행은 JAR가 필요 없으므로 독립 실행됩니다.
- `npm run emulators:prepare -- --ui` 실제 실행: Java 21 정상, 두 캐시의 JAR 누락 확인 후 공식 GCS 다운로드 **403 Domain forbidden**. UI는 Firestore 준비 실패로 아직 시도하지 않았습니다. 정상 공식 파일이 없으므로 실제 정상 JAR 재사용 경로의 성공은 검증하지 못했습니다.
- 캐시 검증 단위 테스트 3개를 추가했습니다. 누락·잘림·동일 크기 변조 거부, 사전 검사에서 다운로드/삭제/실행 없음, 대상별 JAR/UI 필요 여부를 검사합니다. 작은 바이트 fixture는 검증기 테스트에서만 사용하며 Emulator로 실행하지 않았습니다.

공식 Firestore 파일: `cloud-firestore-emulator-v1.19.8.jar`, 63,634,791 bytes, SHA-256 `9d43599ed6151199e8d604dc87fac51218e49e5f3a48519b1ae560bbe5e3382d`. 자세한 경로·재사용·시작 절차는 `docs/EMULATOR_SETUP.md`에 기록했습니다.

## 실제 Chromium NSS 접근 문제 확인·해결

제공된 프록시 CA는 이전과 같은 DER 지문이며 `OpenAI-nebula-dns` / `C,,`로 이미 신뢰되어 있었습니다. 읽기 전용 `certutil` 검사만으로 Chromium 사용 가능을 판단해서는 안 됨을 확인했습니다.

동일 Playwright launch options의 Chromium 156으로 `https://registry.npmjs.org/firebase/latest`를 열면 일반 샌드박스에서는 **ERR_CERT_AUTHORITY_INVALID**였습니다. 승인된 파일 접근 진단에서 Chromium이 `/home/agent/.pki/nssdb/cert9.db`, `key4.db`를 **O_RDWR**로 여는 것이 확인되었고 같은 HTTPS 주소가 **200**이었습니다. 실제 SQLite DB 초기화에 쓰기 접근이 필요했던 것입니다.

`/home/agent/.pki/nssdb` **한 디렉터리에만 현재 턴 쓰기 권한**을 요청해 승인받았습니다. 그 뒤 일반 테스트 실행기에서도 같은 공식 HTTPS 주소가 TLS 검증을 유지한 채 **200**이었습니다. CA 등록 내용, 시스템/운영 신뢰 저장소, 브라우저 TLS 검증 플래그는 변경하지 않았습니다. 프로필/홈 경로도 바꾸지 않았습니다. 권한은 현재 턴 범위로, 다음 작업에 자동 유지된다고 가정하지 않습니다.

`scripts/check-browser-ca.py`는 이제 신뢰 지문·체인뿐 아니라 NSS 디렉터리와 SQLite 파일의 쓰기 접근도 검사합니다. 관리형 환경의 `scripts/test-auth.sh`는 이 검사를 통과해야 Chromium을 시작합니다. 검사 자체는 신뢰 저장소를 변경하지 않습니다.

NSS 접근 조건을 해결한 뒤의 Google SDK 오류는 **ERR_TUNNEL_CONNECTION_FAILED**입니다. 현재 프록시가 Google SDK 터널을 막은 것이며 인증서 오류와 다르게 분류합니다. Auth Emulator 팝업은 실제 Google OAuth가 아니며 실제 OAuth는 계속 미실행입니다. `ignoreHTTPSErrors`, 인증서 검증 비활성화, 임의 CA 교체는 하지 않았습니다.

## 전체 명령 실행 결과

| 명령 / 범위 | 통과 | 실패 | 미실행 | 근거 |
|---|---:|---:|---:|---|
| `npm run build` | 빌드 통과 | 0 | 0 | 기존 JS/CSS 결과 해시 유지. 번들 크기 경고만 있음 |
| `npm run test:unit` | **7** | 0 | 0 | 기존 4개 + 캐시/사전 검사 3개 |
| `npm run test:ui` | **4** | 0 | 0 | 기존 화면·글/사진/초안/JSON 저장 회귀 |
| `npm run test:auth` | 이메일 **1** | Google **1** | 0 | NSS 검사 통과 후 새 Chromium 실행. SDK 터널 차단 |
| `npm test` | 0 | 0 | **11** | 캐시 누락 사전 검사 exit 1. 보안 4+서버 7개 본문 미실행. **다운로드 시도 없음** |
| 공식 Emulator 사전 준비 | 0 | 준비 실패 | 0 | 검증 가능한 캐시가 없어 공식 CLI 다운로드 시도, GCS 403 |
| CA/NSS 읽기·쓰기 진단 및 실제 HTTPS probe | 진단 통과 | 0 | 0 | 기존 신뢰 유지, 현재 턴 제한 권한으로 실제 TLS 200 |

자동 테스트의 고유 항목 합계는 **12 통과 / 1 실패 / 11 미실행**입니다. 전체 `npm test`에는 이미 별도 명령으로 통과한 단위 7개도 포함되지만 중복 집계하지 않습니다. 준비/빌드/진단 명령은 자동 테스트 수와 별도입니다.

**공통 admin.js의 실제 Emulator 검증, 무료 2개·24건 동시 요청 중복 지급 방지·같은 이메일 재가입·글/사진 저장 트랜잭션·타인 접근 차단·서버 원자성은 이번에도 실행되지 않았습니다.** 단위 SDK 직렬화 회귀 통과를 실제 서버 성공으로 대체하지 않았습니다. 따라서 **STEP 1 필수 검증 완료가 아닙니다.**

## 남은 실행 조건과 기록

현재 필요한 것은 고정된 공식 파일을 정상 다운로드한 뒤 같은 캐시 경로를 유지하거나, 성공한 실행의 동일 버전 공식 파일을 해시 검증하여 재사용하는 것입니다. 이번 준비에서 공식 GCS 403이 재발했고 Google SDK도 프록시 터널 오류였습니다. 네트워크 설정 초안을 반복 변경하거나 우회를 시도하지 않았습니다. 외부 제약이 없는 정상 파일을 확보해야 실제 서버 테스트가 시작될 수 있습니다.

원시 로그/추적은 Git 제외 `.local/cache-{prepare,check,build,unit-final,ui,auth-final,full-final}.log`, `.local/cache-browser-{nss,file-access}.trace`, `.local/cache-browser-https*.log`에 보관합니다. 사용자 인증 링크/프로세스 경로가 있는 원시 로그는 커밋하지 않습니다.

변경 파일: `package.json`, `scripts/emulator-cache.mjs`, `scripts/prepare-emulators.mjs`, `scripts/firebase-local.sh`, `scripts/local-setup.sh`, `scripts/test-auth.sh`, `scripts/check-browser-ca.py`, `tests/emulator-cache.test.js`, `README.md`, `docs/EMULATOR_SETUP.md`, `docs/VALIDATION.md`. 의존성/lockfile 버전 변경은 없습니다.

---

# 이전 작업 기록 (해당 시점 결과)

# SDK 객체 충돌 수정 및 CA 재검증 — 2026-11-10 (KST)

요청 범위: STEP 1만 수정. 기존 `codex/step1-foundation` 브랜치를 사용하고 다른 프로젝트 코드/병합, UI/CSS 변경, 실제 Firebase 배포, STEP 2·결제 개발은 하지 않았습니다.

## 1. SDK 충돌 원인과 수정

모듈 해석을 직접 조사한 결과:

| 소비자 | firebase-admin | @google-cloud/firestore | 실제 경로 |
|---|---|---|---|
| 루트 테스트 | 13.10.0 | 7.11.6 | `/workspace/bl_new/node_modules/...` |
| Functions 서버 | 13.10.0 | 7.11.6 | `/workspace/bl_new/functions/node_modules/...` |

동일 버전이라도 별도 경로로 로드하면 `FieldValue` 생성자가 다릅니다. 두 방향의 `serverTimestamp() instanceof 상대SDK.FieldValue`가 모두 false임을 확인했습니다. 기존 테스트는 루트 SDK의 `getFirestore()`를 사용하고, 호출된 `profile.js`/`posts.js`는 functions SDK의 `FieldValue.serverTimestamp()`를 사용했습니다.

실제 Admin SDK의 로컬 WriteBatch 문서 검증기에 이 조합을 전달하여 다음 오류를 재현했습니다:

```text
Couldn't serialize object of type "ServerTimestampTransform" (found in field "createdAt").
Firestore doesn't support JavaScript objects with custom prototypes.
```

수정은 `functions/src/admin.js`를 공통 SDK import 경계로 추가한 것입니다. 서버 진입점·프로필·글 서비스·서버 통합 테스트·seed가 모두 이 모듈에서 `initializeApp`, `getFirestore`, `getAuth`, `FieldValue`, `Timestamp`를 가져옵니다. 실제 Functions 배포 패키지 안에서 해석되므로 루트 node_modules에 의존하지 않습니다. 버전만 맞추거나 모듈 캐시를 우회하는 방법은 사용하지 않았습니다.

같은 경계를 사용하는 실제 WriteBatch 문서 검증은 네이티브 `serverTimestamp()`/`Timestamp`를 직렬화 오류 없이 수락했습니다. 이 검증을 단위 회귀 테스트로 추가했습니다. **이는 네트워크 없는 실제 SDK 쓰기 검증이며 Firestore 커밋/트랜잭션 통과를 의미하지 않습니다.** 타임스탬프 문자열 변환·mock SDK·보안 검증 생략은 없습니다. 기존 +2 지급, HMAC 지급 기록, 원장, 트랜잭션 로직은 import 외에는 바꾸지 않았습니다.

서버 테스트는 직접 초기화 **24건**, 동일 이메일 다른 UID **24건**, 실제 Callable 초기화 **24건**으로 보강했습니다. 잔액 2·원장 1개·balanceAfter 2 및 user/claim/ledger의 동일 서버 Timestamp, 글 생성·수정 Timestamp 검증도 추가했습니다. 아래 제약으로 실제 서버 테스트는 아직 통과 확인하지 못했습니다.

## 2. Chromium CA 신뢰 확인

플랫폼 제공 공개 CA `/usr/local/share/ca-certificates/environment-proxy-ca.crt`만 대상으로 조사했습니다. 시스템 CA bundle의 `openssl verify` 결과 OK, `CA:TRUE`, 유효기간 2024-12-03 ~ 2034-12-01입니다.

SHA-256:
`c71b4d1e9d7775c538c688ab10cea9ce417d7312e89838f9d15ff73256cd7fc3`

사용자 NSS DB: `/home/agent/.pki/nssdb`. `certutil`이 있고 파일은 해당 사용자 소유입니다. 승인된 범위에서 같은 CA 등록을 시도했지만 NSS는 이미 있는 동일 인증서를 재사용했습니다. 기존 닉네임 **`OpenAI-nebula-dns`**, 신뢰 **`C,,`** 인증서의 DER SHA-256이 위 지문과 정확히 같습니다. 따라서 새 닉네임이 나타나지 않는 것을 등록 실패나 미신뢰로 판단하면 안 됩니다. 기존 신뢰를 넓히거나 다른 인증서를 추가할 필요가 없습니다. 재현 가능한 읽기 전용 지문/시스템 체인/NSS SSL 신뢰 진단 `scripts/check-browser-ca.py`를 추가했고 통과했습니다.

Chromium 프로세스를 새로 시작해 재검증했습니다. `ignoreHTTPSErrors`, `--ignore-certificate-errors`, `NODE_TLS_REJECT_UNAUTHORIZED=0`, 검증 없는 다운로드를 사용하지 않았습니다. 운영 환경의 신뢰 저장소를 변경하지 않았습니다.

사용자가 보고한 `net::ERR_CERT_AUTHORITY_INVALID`는 이번 실행에서는 재현되지 않았습니다. 현재 Google 요청의 실제 오류는 **`net::ERR_TUNNEL_CONNECTION_FAILED`**이며, TLS 핸드셰이크 이전의 프록시 차단입니다. CA 신뢰 진단 통과를 Google 로그인 통과로 표시하지 않습니다.

## 3. 수정 후 전체 회귀 결과

| 명령 / 검증 | 통과 | 실패 | 미실행 | 결과 |
|---|---:|---:|---:|---|
| `npm run build` | 빌드 통과 | 0 | 0 | 기존 번들 크기 경고만 있음. 웹 결과 JS/CSS 해시도 이전과 동일 |
| `npm run test:unit` | **4** | 0 | 0 | 기존 3개 + 실제 SDK 서버 Timestamp 직렬화 회귀 |
| `npm run test:ui` | **4** | 0 | 0 | 기존 UI·원문·사진·기기 저장·JSON 이동 회귀 |
| `npm run test:auth` | 이메일 **1** | Google **1** | 0 | 새 Chromium 실행. SDK 프록시 터널 차단으로 팝업 미발생 |
| `npm test` | 0 | 0 | **11** | 명령 exit 1: 공식 Firestore JAR 다운로드 403, 보안 4+서버 7개 본문 시작 전 중단 |
| 요청한 서버 4개 선택 재실행 | 0 | 0 | **4** | 별도 선택 명령도 JAR 403. 위 11개에 포함되며 중복 집계하지 않음 |
| `python scripts/check-browser-ca.py` | 진단 통과 | 0 | 0 | 시스템 체인 및 사용자 NSS의 동일 CA·SSL 신뢰 확인 |

자동 테스트 총 **9 통과 / 1 실패 / 11 미실행**입니다. 빌드·CA 진단은 별도입니다. 실제 Google OAuth는 테스트 프로젝트 설정이 없어 별도 미실행입니다.

선택 재실행한 4개는 동시 회원 초기화, 탈퇴 후 동일 이메일 재가입 방지, 동일 이메일 동시 지급 방지, 글·사진 저장입니다. `--test-name-pattern='concurrent/repeated|deletion/re-registration|24 distinct UIDs|cloud post preserves' tests/server.test.js`로 지정했으나 Emulator 준비 단계에서 중단됐습니다. 성공이나 실제 테스트 실패로 세지 않았습니다.

무료 2크레딧·24건 동시 중복 방지·재가입·타인 접근 차단·실제 서버 트랜잭션의 원자성은 수정된 테스트 정의가 있으며, **실제 Emulator 결과로는 여전히 미검증**입니다. UI 테스트나 로컬 SDK 회귀로 대체해 통과 처리하지 않았습니다. 모든 필수 테스트가 통과하지 않았으므로 **STEP 1 검증 완료가 아닙니다.**

## 4. 이번 실행의 제약과 증거

사용자의 다른 진단에서 요청이 성공했다는 보고와 달리, 이번 연결된 실행 환경의 공식 CLI는 `cloud-firestore-emulator-v1.19.8.jar`에 `403 Domain forbidden`을 반환했고 캐시가 비어 있습니다. 승인된 live sidecar 상태 조회에서도 `policy.http.mode=allowlist`, `allowed_domains=[]`였습니다. 기존 domain 설정 초안을 다시 쓰거나 사용자에게 같은 네트워크 변경 안내를 반복하지 않았습니다. 테스트 데이터를 모방하거나 비공식 JAR로 대체하지 않았습니다. 현재 환경에서 관찰한 오류와 사용자가 보고한 다른 실행 결과를 구분합니다.

로그는 Git 제외 `.local/sdk-{before,build-final,unit-final,ui-final,auth-final,full-final,targeted-final}.log`, `.local/ca-{before,after,same-process}.log`에 보관했습니다. Auth 로그는 테스트 인증 링크가 포함되어 Git에 넣지 않습니다.

변경 파일:

- `functions/src/admin.js` 신규: SDK 공통 경계.
- `functions/src/index.js`, `profile.js`, `posts.js`: 공통 SDK import.
- `scripts/seed-packages.js`: 서버와 같은 SDK 사용.
- `scripts/check-browser-ca.py` 신규: 환경 CA/NSS 읽기 전용 진단.
- `tests/server.test.js`: 동일 SDK, 24건 동시성, 네이티브 Timestamp·원자 커밋 assertion.
- `tests/unit.test.js`: 실제 SDK Timestamp 쓰기 검증 회귀.
- `README.md`, `docs/VALIDATION.md`: 원인·사용법·검증 결과.

---

# 이전 작업 기록 (아래 결과는 해당 시점 기준)

# GitHub 독립 관리 전환 재검증 — 2026-11-10 14:38 이후 (KST)

현재 코드만 `codex/step1-foundation` 작업 브랜치로 분리했습니다. 기존 origin `https://github.com/zaen92/bl_new.git`의 읽기 접근이 확인되었고 원격에는 브랜치가 없었습니다. 최초 코드 커밋 `2ab6b1a592dc30799323a787747b0aae22e1956f`의 푸시가 성공했고 원격 브랜치 SHA 일치도 확인했습니다. 다른 저장소 코드 가져오기, 병합, main 변경, 파일 구조 변경, 앱 공개 배포, STEP 2 개발은 하지 않았습니다.

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
