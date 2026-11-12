# 최종 정책 데이터 마이그레이션/보관 절차

이번 커밋은 코드 변경이며 운영 데이터 삭제·이동·배포를 실행하지 않았습니다. 구 Storage bucket, photoGroups, photoChunks, 기기 원본은 그대로 둡니다. IndexedDB v2는 textPosts/textDrafts를 사용하고 v1 posts/drafts에는 새 쓰기·삭제를 하지 않습니다. 새 앱은 이미지 원문을 쓰거나 읽지 않고 텍스트/배치만 사용합니다.

## 배포 전 운영자 검토

1. 별도 테스트 프로젝트에서 백업/복구 가능성을 먼저 검증합니다. 운영 Firestore export/기존 bucket object 및 원장 inventory는 관리자 전용 경로로 보관하고 공개 JSON에 넣지 않습니다.
2. 기존 배포가 있다면 관리자 중지 ops/ai.enabled=false로 새 생성을 잠시 막고, 기존 예약 작업을 완료/만료 후 정상 원장 환급합니다. 구 generationJobs를 새 코드로 재실행하지 않습니다. 새 HTTP 구조에는 과거 사진을 넘기지 않습니다.
3. 이미 배포된 구 사진 보관/삭제 Scheduler를 승인된 변경 절차로 중지합니다. 새 소스에서 export를 없애는 것만으로 원격 구 함수가 즉시 삭제되는 것은 아닙니다. generationWorker/uploadGenerationPhotos/deletedPhotoSchedule 등 구 endpoint 제거 계획도 검토합니다. CLI 배포 중 함수 삭제 질문을 무심코 승인하지 않습니다.
4. 기존 users/creditLedger/signupClaims 및 HMAC 키는 보존합니다. 기존 잔액/원장에 3개를 덧붙이거나 2를 5로 바꾸지 않습니다. 신규 최초 지급만 ops/service.signupCredits를 사용합니다. 첫 ensureProfile에서 FREE 기본값(기존 PRO는 보존)/내보내기 카운터/글 개수를 추가합니다. 초과 글은 유지하며 신규 저장만 제한합니다.
5. 과거 단일 blogStyle은 호환 조회하고 첫 다중 스타일 저장에서 default를 보존합니다. 변경 전/후 원문/스타일/원장 checksum 및 글 개수를 관리자 테스트로 비교합니다.
6. 기존 글은 텍스트와 사진 위치를 읽습니다. 사진은 별도 로컬 원본을 사용자에게 확보하게 한 뒤 재첨부합니다. 기존 사용자에게 사진 저장 정책 변경/기존 원본 확보/정리 기간을 고지하고 동의·법적 보관 요건을 정합니다. 이번 작업에서 그 기간이나 일괄 삭제를 임의 결정하지 않았습니다.
7. 사용자 요청/승인된 보존 기간에 맞춰 별도 관리자 작업으로 Storage 객체·photoGroups·photoChunks(삭제 글 아래 orphan 포함)·기기 legacy 원본을 정리합니다. 소유권 및 백업/복구 경로를 확인하고 dry-run inventory → 검토 → 별도 승인된 실제 삭제 순서로 진행합니다. 자동 삭제 스크립트는 이 변경에 넣지 않았습니다.
8. **Functions 배포 자체에 필요한 내부 bucket/Artifact Registry/Cloud Build 자료는 앱 사진 자료와 구분합니다.** firebase.json의 앱 storage 설정 제거를 이유로 프로젝트 인프라를 지우지 않습니다.

Auth 계정 삭제는 marker로 접근을 차단합니다. 과거 사진이 남아 있는 서비스는 계정 삭제 후 물리 삭제/법적 보존 처리를 위 절차와 개인정보 정책에 맞춰 별도 실행해야 합니다. 새 사진을 서버에 저장하지 않는 것과 과거 데이터가 이미 삭제된 것은 다릅니다.

## 테스트 교체 근거

- 무료 2회 지급 assertion → 무료 5회 지급/5회 후 0/6회 차단. 과거 잔액 2 및 원장 보존 fixture는 migration 회귀로 유지합니다.
- Storage upload/90일/quota/savedRefs 테스트 → 메모리 사진 분석·크기/개수 한도·본문 배치·영구 이미지/큐 부재·첨부 소실 환급 테스트.
- Storage 소유자 조회/token 테스트 → 텍스트 전용 계정 저장/JSON, legacy 사진 데이터 접근 차단, 스타일/내보내기 승인 권한 테스트. 보안 수준을 낮추는 우회가 아닙니다.
- 기기/JSON 사진 복원 테스트 → 기존 텍스트/배치/설정 복원과 사진 제거/재첨부, 원본 미삭제 검증. ZIP/이미지 작업파일은 추가하지 않았습니다.
- 정책 트랜잭션 11개 및 추가 E2E로 FREE/PRO/동시 한도/누적 카운터/페이지 조회를 검증합니다. 수를 맞추기 위해 obsolete Storage Emulator를 실행하지 않습니다.
