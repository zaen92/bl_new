# STEP 2 최종 정책 — FREE / PRO (2026-11-12)

기준 `56a1092`, 작업 브랜치 `codex/step2-ai-generation`. 기존 STEP 1 브랜치/CSS를 보존합니다. 결제·가격 확정·운영 배포는 하지 않았습니다.

## 현재 정책

| 기능 | FREE | PRO |
|---|---|---|
| AI 생성 | 이메일 인증 후 최초 5크레딧 | 잔여 크레딧만큼 |
| 전체 생성/검색/사진 분석/미리보기 | 제공 | 제공 |
| 계정 저장 | 5개 | 상품상 개수 제한 없음, 페이지 조회 |
| 공식 JSON 내보내기 | 가입 후 누적 5회 | 무제한 |
| JSON 불러오기 | 무제한 | 무제한 |
| 스타일 | 1개 저장/수정 | 여러 개 저장/선택 |
| 사진 영구 보관 | 없음 | 없음 |

신규 tier는 FREE입니다. PRO 전환/환불 자격 처리는 STEP 3의 서버 결제 검증에서만 구현할 예정입니다. 현재 클라이언트용 등급 변경 API는 없습니다. PRO 테스트는 Admin SDK의 Emulator fixture만 사용하며 크레딧 0에서도 PRO를 유지합니다. 월 구독/월 리셋/생성 외 크레딧 차감은 없습니다.

관리자 `updateServicePolicy`가 `ops/service`의 signupCredits=5, freePostLimit=5, freeExportLimit=5, freeStyleLimit=1, proStyleLimit=50을 검증해 변경합니다. PRO 스타일 50은 조정 가능한 기술적 한도이며 글/내보내기 개수 제한과 다릅니다. 상품 가격은 정의하지 않았습니다.

## 사진이 없는 durable worker로의 전환

사진 포함 여부와 관계없이 인증된 `requestGeneration` HTTP invocation이 작업을 담당합니다. 사진은 브라우저 메모리에서 압축한 후 요청에 첨부합니다. 서버는 인증·이메일 인증·입력·사진 크기를 검증하고 Firestore에서 크레딧/비용을 예약한 다음, 같은 invocation의 메모리 사진을 Claude에 전달합니다. 외부 API는 트랜잭션 밖에서 호출합니다. 비밀은 서버 Secret Manager에만 있습니다.

**generationJobs 큐, Storage upload/get, photoGroups 생성, 신규 photoChunks, 사진 quota/90일 보관/사진 정리 scheduler를 사용하지 않습니다.** 이미지 원문/Base64를 Firestore/Storage/큐/로그에 기록하지 않습니다. generation 문서에는 텍스트 입력·스타일·상태·완성 결과·사진 수 및 검증용 해시/크기 metadata만 있습니다. 부분 응답 원문도 DB에 저장하지 않고 단계만 기록합니다. 사진 배치는 본문의 [사진1] 및 posts.photoPositions로 보존합니다.

`requestId`와 UID의 SHA-256으로 generation ID를 고정하고 사진 해시를 포함한 fingerprint로 다른 입력의 ID 재사용을 막습니다. 같은 요청은 한 번만 예약/claim/호출합니다. callable의 접수 chunk 및 Firestore 상태 구독으로 실시간 상태를 표시합니다. 요청 중 연결이 끊겨도 서버가 계속 실행되면 텍스트 결과를 복구할 수 있지만, **서버 종료 후 사진을 재구성하거나 작업을 자동 재개하지 않습니다.** 기존 요청은 lease 만료 후 5분 주기 복구로 원래 bucket에 한 번만 환급합니다. 사용자가 새 ID로 재생성할 때만 새 크레딧을 예약합니다. 사진은 새로고침 후 재첨부해야 합니다.

호출 제한: 최대 10장, decoded 장당 2MiB / 합계 6MiB, 전체 JSON 요청 9MiB. base64 약 8MiB + 본문은 이 한도 안에 들어갑니다. Cloud Functions 2세대 HTTP 요청 한도 32MB보다 보수적입니다. 스트리밍 응답 한도 10MB에 큰 사진 응답을 반환하지 않습니다. 함수 timeout 360초, provider 기본 120초/최대 240초, 클라이언트 timeout 360초입니다. 공식 제한 출처: https://firebase.google.com/docs/functions/quotas . 플랫폼 제한/실제 지연은 승인된 테스트 Firebase에서 확인해야 합니다.

## 크레딧 및 이전 사용자

서버에서 인증된 이메일의 기존 HMAC signupClaims를 확인해 최초 한 번만 `ops/service.signupCredits`를 지급합니다. 동시 요청/동일 이메일 재가입/중복 로그인은 추가 지급하지 않습니다. 기존 users.credits와 원장 문서는 변경하지 않습니다. 정책 변경은 새 최초 지급에만 적용됩니다.

기존 bucket이 없는 STEP 1/초기 STEP 2 계정의 분류는 **당시 무료 지급 2개** 기준을 유지합니다. 이것은 현재 가입 지급량이 아니라 과거 잔액의 종류를 보존하는 migration입니다. 임의로 5개로 올리거나 과거 원장을 다시 쓰지 않습니다. 무료 우선 예약 → 성공 held 해제/commit → 실패 원래 종류 refund의 트랜잭션 및 결정적 원장 ID를 유지합니다.

## 저장/JSON/스타일

- 저장: 텍스트/입력/장소/제목/유형/분량/SEO/키워드/본문/태그/릴스/썸네일/스타일/사진 번호/서버 시각만 whitelist로 저장합니다. FREE 신규 저장은 users.savedPostCount와 같은 트랜잭션으로 최대 5개입니다. 수정은 count 증가 없음, 삭제는 공간 복구. 기존 초과 계정은 삭제하지 않고 신규 저장만 막습니다. 과거 count가 없으면 기존 문서 수를 계산합니다.
- 글 목록: 초기 실시간 20개, 서버 `listPosts`는 pageSize 최대 50과 소유권을 검사하는 cursor로 다음 페이지를 조회합니다. PRO 전체 저장 수 제한은 없습니다.
- JSON: 브라우저에서 텍스트 전용 파일을 생성/검증/해시한 후 서버 approveJSONExport 승인을 받습니다. 승인 ID/digest/bytes가 같으면 재시도 시 추가 집계하지 않습니다. 다른 파일은 같은 승인을 재사용할 수 없습니다. FREE는 누적 5, 월 리셋 없음. 다운로드 click 이후 pending ID를 지우며 실제 디스크 저장 완료는 보장할 수 없습니다. 승인 직후 페이지가 종료되면 해당 승인은 사용된 것으로 남을 수 있습니다.
- exportsUsed는 영구 signup claim에도 기록해 이메일 재가입으로 초기화하지 않습니다. 같은 글을 새 승인 ID로 다시 내보내면 새 1회입니다. UI 밖에서 사용자 자신이 텍스트를 복사/재구성하는 행위를 차단하지 않습니다.
- JSON/기기 저장 whitelist는 API 키·토큰·tier·관리자 claim·credits·원장·주문·카운터·cloudLinks·legacyRaw·이미지를 제외합니다. 과거 JSON의 imgs는 무시하고 텍스트/유형/분량/폼/스타일/배치를 복원합니다. 파일 50MiB·본문/태그 길이·형식 검증을 거치며 손상/악성 입력은 저장 전에 거부합니다. 현재 작업은 확인 후 텍스트 백업하고 불러옵니다. 원본 사진은 복원하지 않습니다. JSON 스타일은 글 metadata이며 계정의 선택 스타일/등급을 자동 변경하지 않습니다.
- 신규 IndexedDB 쓰기는 사진을 제외합니다. IndexedDB v2의 textPosts/textDrafts만 새로 쓰고, v1 posts/drafts 및 원본 localStorage/과거 사진은 덮어쓰거나 삭제하지 않습니다. 읽기 호환 마이그레이션은 텍스트만 새 저장소로 복사합니다. 앱 읽기/백업 경로에서는 사진을 반환하지 않습니다. 직접 원본 보관/삭제는 별도 migration 안내를 따릅니다.
- 스타일: users/{uid}/styles/{id}, activeStyleId. FREE 1개 수정 가능, PRO 여러 개 추가/선택/삭제 가능. 기존 blogStyle은 default로 읽고 다중 저장 시 보존합니다. generation은 서버의 선택 스타일을 읽으며 request.style 및 JSON으로 우회하지 않습니다. 잰잇 preset을 유지합니다.

## 보안/비용/회원 탈퇴

Auth의 현재 verified/disabled 상태, App Check 실제 boolean 검증, 사용자별 분당 3/하루 20/동시 2, 토큰/검색/timeout/일일 예산 및 운영 중지를 유지합니다. ops/ai에서 모델/제한/단가를 변경합니다. 기본 모델 claude-sonnet-4-6, 검색 web_search_20250305. 공식 API 계약은 문서 또는 Anthropic 공식 SDK API 정의로 확인합니다.

generationCosts/dailyCosts/ops/generationInternal은 관리자만 읽고 서버만 씁니다. 입력/이메일/키는 application log에 출력하지 않습니다. 알려진 usage는 추정 비용으로, 전송/스트림 중단의 불명 비용은 보수적 예약 상한으로 기록합니다. 늦게 확정 usage가 오면 비용만 보정하며 환급 크레딧을 재차감하지 않습니다. 현재 구성 단가는 실제 청구/상품 가격 확정이 아니며 Anthropic 청구서와 대조해야 합니다.

Auth 삭제 trigger는 deletedUsers marker를 기록해 접근을 차단합니다. 사진 전용 삭제/보관 scheduler는 제거했습니다. 기존 사진 자료는 이번 작업에서 삭제하지 않으므로 실제 기존 계정 탈퇴 데이터 정리는 별도 migration/개인정보 삭제 절차가 필요합니다. 자세한 절차는 [POLICY_MIGRATION.md](POLICY_MIGRATION.md), 개인정보 안내는 [PRIVACY.md](PRIVACY.md)를 보세요.

## 실제 Firebase 준비 (실행/배포 아님)

1. 별도 테스트 Firebase 프로젝트의 Auth/Firestore/Functions 및 필요한 Blaze/IAM을 준비합니다. **앱 사진용 Storage bucket 활성화/CORS/Storage Emulator 설정은 필요 없습니다.** Functions 배포가 자체 사용하는 Cloud Build/Artifact Registry/내부 bucket은 지우지 않습니다.
2. 루트 `.env.local`에는 공개 VITE_FIREBASE_*와 VITE_USE_EMULATORS=false, 선택적 공개 VITE_APPCHECK_SITE_KEY만 입력합니다. provider 비밀/서비스 계정 키는 넣지 않습니다.
3. Secret Manager: `firebase functions:secrets:set CLAUDE_API_KEY --project TEST_PROJECT_ID` 및 NAVER_CLIENT_ID/NAVER_CLIENT_SECRET. 기존 SIGNUP_IDENTITY_HMAC_KEY는 보존하며 재생성하지 않습니다. 값은 CLI 보안 프롬프트로 입력합니다.
4. 비밀이 아닌 `functions/.env.TEST_PROJECT_ID`: AI_PROVIDER_MODE=anthropic, ENFORCE_APP_CHECK=true(실제 토큰 확인 후). STORAGE_BUCKET은 사용하지 않습니다.
5. 승인된 테스트 배포 때 firestore.rules/indexes/Functions/recoverySchedule을 적용합니다. 구 generationWorker/uploadGenerationPhotos/사진 scheduler의 폐기는 migration 안내에 따라 검토합니다. 이번에는 배포하지 않았습니다.
6. 실제 1회 생성의 generationCosts token/search/chargedMicros/estimated를 Anthropic usage/청구서와 비교합니다. 실제 사진 품질·검색·OAuth·App Check·timeout/중단 복구를 테스트 프로젝트에서 검증해야 합니다.

## 로컬/CI

`npm ci`, `npm --prefix functions ci`, `scripts/local-setup.sh`는 기존 값을 보존하고 Emulator-only placeholder/AI_PROVIDER_MODE=mock/ENFORCE_APP_CHECK=false를 준비합니다. 실제 비밀을 .secret.local에 쓰지 않습니다. 공식 Firestore 파일을 준비한 환경에서 `npm run emulators`와 `npm run dev`를 실행합니다. 기존 제한 Cloud에서는 다운로드를 반복하지 말고 STEP 2 GitHub Actions를 사용합니다.

`npm test`는 Auth/Firestore/Functions의 58개, provider 단위 10, 기존 unit 7(일부 중복), UI 4, Auth 2, 정책 E2E 6을 검증합니다. 최종 실제 결과는 [VALIDATION.md](VALIDATION.md)에 기록합니다. mock은 Emulator 밖에서 허용하지 않습니다. 실제 API 테스트가 통과한 것으로 표시하지 않습니다.
