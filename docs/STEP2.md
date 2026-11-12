# STEP 2 — 서버 AI 생성 기반

현재 작업은 `d83f78c`에서 분리한 `codex/step2-ai-generation`입니다. STEP 1 브랜치·CSS·기기 저장·JSON 이동을 유지합니다. 결제/상품 가격/운영 배포는 이 단계에 포함하지 않습니다.

## 호출 경로

브라우저는 API 키를 받거나 저장하지 않습니다. 인증/이메일 인증 후 사진이 있으면 `uploadGenerationPhotos`로 비공개 Storage에 먼저 저장하고, `requestGeneration`에 고유 requestId·입력·photoGroupId를 보냅니다. 서버는 계정의 스타일과 운영 제한을 읽고 크레딧·동시성·전체 비용을 예약하면서 private 작업 문서를 생성합니다. Firestore worker만 Claude/Naver를 호출합니다.

`requestGeneration`은 접수 chunk와 `{generationId,status,creditsRemaining,duplicate}`를 반환합니다. 이후 인증된 Firestore snapshot으로 단계/부분 텍스트를 전달합니다. 실제 Claude 응답은 서버에서 SSE로 파싱하고, 완료된 JSON의 모든 기존 결과 필드를 검증합니다. 외부 API 요청은 Firestore 트랜잭션 밖에서 실행합니다.

요청 ID는 UID와 함께 SHA-256한 문서 ID로 고정합니다. 같은 ID의 다른 입력은 거부하고, 작업을 한 번 claim한 뒤에는 재전달된 worker가 AI를 다시 호출하지 않습니다. 네트워크 불명/서버 종료에서는 오래된 예약을 환급하고 같은 요청을 재호출하지 않는 보수적 at-most-once 정책입니다. 사용자가 새 요청 ID로 재생성할 때만 다시 1크레딧을 예약합니다. 검색의 정상 `pause_turn` 연속 호출은 제한 횟수 내에서 이어가며 중복 작업 재실행과 구분합니다.

## 잔액/원장

- 기존 `users.credits` 총 가용 잔액을 보존합니다.
- 신규 가입: 이메일 인증 후 `credits=2,freeCredits=2,paidCredits=0`.
- 이전 STEP 1 계정은 첫 생성에서 기존 잔액 중 최대 2를 무료, 나머지를 유료로 분류하는 additive migration입니다. STEP 1에는 실제 구매가 없었습니다. 외부에서 임의 지급한 구 계정이 있다면 운영 전 종류를 검토해야 합니다.
- 예약: 무료 우선 가용 1 차감, `heldFree` 또는 `heldPaid` 1 증가, 결정적 reserve 원장.
- 성공: held 1 감소, delta 0 commit 원장. 실패: held 1 감소, **원래 종류** 가용 1 복구 및 refund 원장.
- terminal 상태와 결정적 원장 ID를 같은 트랜잭션으로 기록하므로 환급 작업이 겹쳐도 이중 지급하지 않습니다.
- 5분 주기 복구는 만료된 lease를 조회합니다. 완료 시 lease 필드를 지워 오래된 완료 건 때문에 복구 쿼리가 굶지 않게 합니다. 관리자 수동 복구 API도 같은 함수를 사용합니다.

## 데이터/보안

| 문서 | 용도 / 읽기 |
|---|---|
| users | 총/무료/유료/held 잔액, 활성 작업 수, 제한 카운터, 저장 용량, blogStyle. 본인/관리자 읽기, 서버만 쓰기 |
| generations | 본인 입력·스타일 snapshot, 상태/부분 텍스트/결과, 사진 그룹, lease. 본인/관리자 읽기 |
| generationInternal | fingerprint·운영 설정 snapshot·비용 예약·일자. 관리자만 읽기 |
| generationJobs | private durable worker 알림. 브라우저 읽기/쓰기 불가 |
| generationCosts | 토큰·검색·성공한 message 응답 수·예상 USD·실패 코드·가격 snapshot. 관리자만 읽기 |
| dailyCosts | UTC 일자별 예약/소비 추정치. 관리자만 읽기 |
| ops/ai | 제한/모델/가격/중지 설정. 관리자만 읽기, 검증된 관리자 API만 쓰기 |
| photoGroups | 소유자·파일 경로/해시/크기·저장 글 참조 수·만료/업로드 상태. 본인/관리자 읽기, 서버만 쓰기 |
| deletedUsers | 삭제 marker·재정리 커서. 브라우저 접근 불가 |

Server API는 Auth의 현재 verified/disabled 상태를 확인합니다. `ENFORCE_APP_CHECK`를 활성화할 준비가 되어 있으며, 클라이언트는 공개 `VITE_APPCHECK_SITE_KEY`가 있을 때 App Check를 초기화합니다. 운영 활성화 전 정상 클라이언트 토큰을 검증해야 합니다. 기본값 false는 실제 App Check 강제 적용 완료를 의미하지 않습니다.

## 사진

신규 화면 사진은 서버 검증 후 `/users/{uid}/photos/{group}/{index}`에 저장합니다. Storage 직접 읽기·쓰기는 소유자도 거부합니다. Firebase REST의 인증 읽기에도 공개 토큰이 자동 생성되는 동작을 막기 위한 구조입니다. verified 소유자는 getPost/getGeneration 서버 API로 사진을 읽습니다. 서버는 공개 Firebase 다운로드 토큰이나 signed URL을 만들지 않습니다. 결과/글 읽기 API도 소유권을 확인한 뒤 사진 데이터를 전달합니다.

기본 최대 10장, 장당 decoded 2MiB, 합계 decoded 6MiB, 회원별 **200,000,000 bytes**입니다. 원래 1400px/JPEG 압축을 유지합니다. 업로드 이전에 quota를 트랜잭션 예약하고 완료 시 실사용으로 옮깁니다. 실패·서버 중단 업로드는 정리 후 한 번만 quota를 풀어줍니다. 초과 시 기기 원본은 지우지 않습니다.

미저장 사진은 마지막 사용 후 90일 보관합니다. 저장된 글이 참조하는 그룹은 만료하지 않습니다. Auth 삭제 trigger는 삭제 marker로 새 접근을 막고 사진을 제거하며, 매일 sweep으로 삭제 중 오류/경합의 잔여 파일을 정리합니다. trigger/스케줄은 배포 후 서비스 권한이 준비되어야 자동 실행됩니다. Emulator 테스트에서는 같은 정리 함수를 직접 실행합니다.

기존 Firestore `photoChunks` 읽기와 구 API는 유지됩니다. 새 UI의 서버 저장은 Storage를 사용하며, 기존 기기/Firestore 사진을 열어 계정에 복사하면 검증된 Storage로 옮길 수 있습니다. 원래 글은 자동 삭제하지 않습니다. 10장/6MiB를 넘는 구 글은 그대로 읽을 수 있지만 새 정책으로 옮기려면 사용자 선택으로 분할/압축해야 하며 자동 잘라내기는 하지 않습니다.

## 제한과 비용

기본 분당 3 / UTC 하루 20 / 동시 2입니다. `ops/ai`의 검증된 관리자 설정에서 변경합니다. 입력은 count_tokens로 사전 확인하고 기본 48,000 tokens, 출력 전체 8,192 tokens, 검색 3회, provider message 요청 최대 3회, 120초 제한입니다. 서버 worker timeout보다 긴 보수적 lease 후 복구합니다.

기본 모델 `claude-sonnet-4-6`, 검색 `web_search_20250305`. 모델은 관리자 설정으로 변경할 수 있으나 지원 도구·context 상한·가격을 함께 검토해야 합니다. 가격 웹페이지는 현재 환경에서 검증하지 못했습니다. 아래 금액은 운영자가 공식 가격/청구서와 대조해야 하는 구성 가능한 추정값입니다. 현재 기본 추정가는 input 3 / output 15 USD per million tokens, search 0.01 USD입니다. 금액은 USD micros 정수로 기록합니다. 일일 AI 비용 한도 기본 $20이며, 최대 context·연속 요청·출력·검색의 보수적 비용을 미리 예약합니다. 이것은 Cloud Billing 청구서/Storage/Functions/Firestore 전체 비용의 강제 상한이 아닙니다.

응답 중 실제 관측한 usage로 추정 비용을 정산합니다. 실패해도 관측 usage는 기록합니다. 종료 이벤트 없이 스트림이 끊기면 관측 토큰이 일부 있어도 불완전한 비용으로 보고, 청구 여부를 알 수 없는 전송 중단은 예약 상한으로 보수적으로 잡으며 estimated=true로 표시합니다. 늦은 실제 usage가 도착하면 비용만 보정하고 환급된 크레딧을 다시 차감하지 않습니다. 실제 청구액은 Anthropic 청구서와 대조해야 합니다. 관리자 `enabled=false`는 신규 및 아직 provider를 시작하지 않은 작업을 막습니다. 이미 외부 API가 시작된 요청을 즉시 되돌릴 수는 없습니다.

## 실제 Firebase/Secret Manager 설정 (배포 실행 아님)

1. 실제 Functions/Storage/스케줄을 사용하는 별도 테스트 프로젝트는 Blaze와 관련 IAM 설정을 준비합니다. 이 작업에서는 활성화/배포하지 않았습니다. 별도 테스트 Firebase 프로젝트에서 Auth/Firestore/Storage를 활성화하고 해당 bucket 이름을 확인합니다. 기존 프로젝트 Web 공개 설정은 `.env.local`; 실제 provider 비밀은 넣지 않습니다.
2. Firebase Secret Manager에 CLI 보안 프롬프트로 `CLAUDE_API_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`, 기존 `SIGNUP_IDENTITY_HMAC_KEY`를 등록합니다. 예: `firebase functions:secrets:set CLAUDE_API_KEY --project TEST_PROJECT_ID`. 값은 채팅/명령행 인수/소스에 넣지 않습니다.
3. 비밀이 아닌 Functions 환경 설정 `functions/.env.TEST_PROJECT_ID`에 `AI_PROVIDER_MODE=anthropic`, `STORAGE_BUCKET=실제_bucket`, 필요 시 `ENFORCE_APP_CHECK=true`를 설정합니다. HMAC 키를 재생성하지 않습니다. 아직 실제 배포는 하지 않았습니다.
4. `firestore.rules`, `firestore.indexes.json`, `storage.rules`, Functions 스케줄/Firestore/Auth 트리거와 Storage/Firestore 서비스 권한을 승인된 배포 단계에서 적용합니다. Storage 직접 클라이언트 접근은 열지 않습니다. 서버 서비스 계정의 bucket IAM과 실제 테스트 프로젝트에서의 소유권·삭제 동작을 확인해야 합니다.
5. 관리자 custom claim을 가진 본인 계정으로 `updateAIConfig`를 사용해 model/rates/limits/pause를 검토합니다. 비용 collection은 사용자 브라우저에 노출하지 않습니다.
6. 실제 테스트 시 1회 생성의 generationCosts usage/chargedMicros/estimated/provider와 Anthropic usage·청구서를 대조합니다. 본 단계에 실제 키가 없으므로 유료 실제 API 호출/실제 비용 측정은 미실행입니다.

## Mock 및 CI

Mock은 `FUNCTIONS_EMULATOR=true`인 경우에만 `AI_PROVIDER_MODE=mock`으로 허용합니다. 기본 disabled이며 실제 환경에서 mock으로 성공을 가장하지 않습니다. CI는 가짜 키 placeholder와 Emulator만 사용합니다. CallableOptions에는 불리언 parameter 객체 대신 검증된 환경변수의 실제 boolean을 전달합니다. Emulator 설정을 명확히 하도록 `functions/.env.local`에 `ENFORCE_APP_CHECK=false`를 명시합니다. 운영 설정을 바꾸는 작업이 아닙니다. `AI_MOCK_DELAY_MS`는 Emulator E2E 지연 재현용이며 실제 provider에 영향을 주지 않습니다.

STEP 1 workflow/브랜치는 보존합니다. Step 2에서는 `step2-tests.yml`을 사용해 Storage를 포함한 실제 Emulator와 mock provider를 검증합니다. 테스트 수와 실제 실행 결과는 `VALIDATION.md`에 별도로 기록합니다. 실제 Google OAuth/Anthropic 유료 호출/생산 IAM은 통과로 집계하지 않습니다.

## 공식 API 계약 확인 출처

공식 문서 사이트가 차단될 때는 Anthropic 공식 SDK의 공개 API 정의만 읽어 model/tool/SSE 계약을 확인합니다: https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/messages/messages.ts . `claude-sonnet-4-6`, `web_search_20250305`(및 최신 20260209 정의), `content_block_delta`를 확인했습니다. 다운로드한 소스는 프로젝트에 통합하지 않습니다. CI evidence에는 출처 URL·시각·SHA-256과 웹사이트 접근 결과를 구분해 기록합니다. 이 확인은 실제 모델 호출/가격/성능 검증을 대신하지 않습니다.
