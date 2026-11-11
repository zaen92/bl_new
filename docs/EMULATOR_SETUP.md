# STEP 1 Emulator 캐시·시작 절차

## 실제 캐시와 공식 기준

이 프로젝트는 설치와 테스트 모두 같은 `FIREBASE_EMULATORS_PATH`를 사용합니다. 지정하지 않으면 `/workspace/bl_new`의 형제 캐시 `/workspace/.cache/firebase`입니다. Firebase CLI 자체의 기본값은 `$HOME/.cache/firebase/emulators`이며, 둘은 원래 다른 위치입니다. 준비 스크립트는 CLI 기본 위치도 재사용 후보로 확인합니다. 테스트 실행은 캐시를 삭제하지 않으며 `npm ci`도 이 외부 캐시를 지우지 않습니다.

lockfile의 Firebase CLI 14.27.0이 제공하는 `lib/emulator/downloadableEmulatorInfo.json`을 신뢰 기준으로 읽습니다. 예:

| 대상 | 파일 | 크기 | SHA-256 |
|---|---|---:|---|
| Firestore 1.19.8 | `cloud-firestore-emulator-v1.19.8.jar` | 63,634,791 bytes | `9d43599ed6151199e8d604dc87fac51218e49e5f3a48519b1ae560bbe5e3382d` |
| 선택적 UI 1.15.0 | `ui-v1.15.0.zip` | 3,538,469 bytes | `97d8c4c574e3f20c4d690a2ce8373eef76ab024da73279a062dba8517f88cf9a` |

실제 검사값은 문서 상수가 아니라 설치된 CLI 메타데이터에서 읽습니다. 파일 크기, CLI 기준 MD5, SHA-256을 모두 확인합니다. 버전이나 파일명만 같다고 받아들이지 않습니다. 바이너리 경로 override와 검증을 생략하는 UI snapshot 모드는 이 러너에서 거부합니다. 메타데이터가 알려지지 않은 형식이면 실패하며 임의 체크섬을 만들지 않습니다.

## 설치 시 한 번 준비

```bash
cd /workspace/bl_new
bash scripts/local-setup.sh
# 의존성과 빌드가 이미 준비되어 있다면:
npm run emulators:prepare
# 개발용 Emulator UI까지 사용할 때:
npm run emulators:prepare -- --ui
```

설치 스크립트는 lockfile 설치 → 로컬 테스트용 비밀 파일 보존/최초 생성 → 빌드 → 공식 Firestore/UI 사전 준비 순서입니다. 마지막 준비가 실패하면 설치 명령도 실패로 끝나며, 전체 환경 준비 완료로 표시하지 않습니다. 정상 캐시는 네트워크 요청 없이 검증·재사용합니다. Firestore 준비가 실패하면 UI 다운로드는 아직 시도하지 않은 상태입니다.

캐시가 없을 때만 고정된 공식 CLI의 `setup:emulators:firestore` 또는 `setup:emulators:ui`를 실행합니다. 이 공식 setup 명령 자체는 매번 다운로드하므로, 스크립트가 먼저 유효한 캐시인지 검사하여 불필요한 실행을 막습니다. 다운로드 후 SHA-256/MD5/크기를 다시 확인합니다. 정상 UI ZIP이 있고 추출만 누락되면 검증된 ZIP을 공식 CLI extractor로 복원합니다. UI의 사전 검사는 ZIP 무결성과 실행 진입점 존재를 확인합니다.

다른 성공한 실행에서 **같은 공식 버전 파일**을 이미 보관했다면:

```bash
npm run emulators:prepare -- --reuse-from /정상_공식_캐시가_있는_디렉터리
```

이것은 다운로드 URL 변경이 아닙니다. 파일을 실행 전에 동일한 공식 기준으로 검증하고, 복사본도 다시 검증해 원자적으로 캐시에 배치합니다. 다른 버전 파일, 임의 JAR, 검사에 실패한 파일을 대체 실행하지 않습니다. 검증 실패한 기존 대상은 준비 모드에서 `.invalid-artifacts`에 격리하며 원본을 임의 삭제하지 않습니다. 읽기 전용 검사 모드는 격리나 다운로드도 하지 않습니다. 서로 다른 CLI 버전의 캐시는 서로 다른 경로에 분리하는 것이 좋습니다.

## 테스트·서비스 시작 시 사전 검사

```bash
npm run emulators:check
npm test
npm run emulators
```

- `emulators:check`: Java 21+와 Firestore 캐시 무결성 검사. HTTP 요청/파일 변경 없음.
- `npm test`: 동일 검사 통과 후만 Auth·Firestore·Functions 시작. 테스트 시작 시 자동 다운로드 없음.
- `npm run emulators`: Firestore 및 개발용 UI 캐시도 검사 후 시작.
- `npm run test:auth`: Auth Emulator는 CLI의 JS 코드라 JAR가 필요 없습니다. Firestore 캐시 없이 독립 실행 가능합니다. 관리형 환경에서는 먼저 CA/NSS 접근 사전 검사.
- 다른 위치를 사용하려면 **준비와 테스트 양쪽에 동일한** `FIREBASE_EMULATORS_PATH=/캐시경로`를 지정합니다. CI/환경 스냅샷에서도 해당 디렉터리를 보존해야 합니다. 프로세스 자체는 다시 시작해야 합니다.

## Chromium NSS와 TLS

```bash
python scripts/check-browser-ca.py
```

이 환경의 제공 CA는 사용자 NSS에 `OpenAI-nebula-dns` 이름, SSL CA 신뢰 `C,,`로 이미 등록되어 있습니다. 추가 등록하지 않고 시스템 체인·DER 지문을 검증합니다. Chromium 156이 이 DB의 `pkcs11.txt`, `cert9.db`, `key4.db`를 실제로 참조하는 것을 시스템 호출 추적으로 확인했습니다.

중요한 실행 조건은 **사용자 NSS DB의 읽기/쓰기 접근**입니다. Chromium의 NSS/SQLite 초기화는 인증서를 읽기만 하려는 경우에도 `cert9.db`, `key4.db`를 O_RDWR로 열고 디렉터리에 journal/lock 파일을 만들 수 있어야 합니다. 명령 샌드박스가 DB를 읽기 전용으로 제공하면 CA가 있어도 `ERR_CERT_AUTHORITY_INVALID`가 날 수 있습니다.

이번 작업에서는 `/home/agent/.pki/nssdb`에 대한 좁은 쓰기 권한을 현재 턴에만 승인받아 정상 TLS 검증이 되는 것을 확인했습니다. 운영 인증서 저장소나 CA 자체는 바꾸지 않았습니다. 이 권한은 Git·파일 스냅샷으로 복원되지 않으므로 새 테스트 작업에서는 동일한 제한된 권한 또는 해당 DB에 정상 접근 가능한 승인된 테스트 실행기가 필요합니다. 필요 이상의 홈 디렉터리/네트워크 권한을 요청하지 않습니다. 스크립트가 권한을 자동 우회하지 않고 시작 전에 정확한 원인을 표시합니다.

TLS를 검증하는 실제 Chromium으로 npm 공식 HTTPS 주소는 200이었으며, Google SDK는 별도의 `ERR_TUNNEL_CONNECTION_FAILED`로 실패했습니다. 신뢰 오류와 프록시 터널 차단은 서로 다른 문제입니다. `ignoreHTTPSErrors`나 인증서 검증 해제 플래그는 사용하지 않습니다. Auth Emulator Google 팝업은 실제 Google OAuth와도 구분합니다.

## 현재 외부 제약

2026-11-11 이번 환경의 지정·기본 캐시에 정상 공식 JAR가 없었습니다. 공식 설치 명령은 `storage.googleapis.com`에서 `403 Domain forbidden`을 받았습니다. 유효 파일을 확보하지 못했으므로 서버 트랜잭션 테스트를 실행하거나 통과로 표시하지 않았습니다. 과거 다운로드 성공 여부/당시 볼륨 보존 여부를 이 결과만으로 단정하지 않습니다.

다음에 공식 다운로드가 가능한 실행에서 `npm run emulators:prepare -- --ui`를 완료하고 검증된 캐시 경로를 보존하면 테스트 때 재다운로드하지 않습니다. 성공했던 실행의 정상 파일을 가져올 경우에도 위의 공식 무결성 검사를 통과해야 합니다. 확인되지 않은 미러를 사용하지 않습니다.
