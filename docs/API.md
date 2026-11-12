# STEP 2 API (현재 브랜치)

모든 사용자 API는 Firebase Callable, Auth 현재 이메일 인증/활성 상태 확인 후 실행합니다. 지역 `asia-northeast3`. 클라이언트 UID/잔액/스타일/가격은 신뢰하지 않습니다. 비용과 모델은 서버 설정을 사용합니다.

- `ensureProfile({})`: 기존 무료 2 지급 멱등 API 유지.
- `uploadGenerationPhotos({requestId,photos:dataURL[]})`: 최대 10장/장당 2MiB/합계 6MiB 검사, 회원 200MB quota 예약 후 비공개 Storage 저장. `{photoGroupId,count}` 반환. 공개 URL/token 없음.
- `requestGeneration({requestId,title,memo,content,placeInfo,type,volume,photoGroupId?})`: 크레딧/요청 제한/비용 예약 후 durable worker 생성. `{generationId,status,creditsRemaining,duplicate}` 반환. Callable stream은 접수 chunk를 전달하며 `generations/{id}`의 인증 snapshot으로 부분 응답/진행/최종 상태를 봅니다. 구 인라인 photos 입력은 업로드 API로 분리해야 합니다.
- `getGeneration({generationId})`: 본인 결과/상태/사진 복구. 보관 기간이 지난 미저장 사진은 photosExpired로 구분하고 본문 결과는 유지합니다.
- `updateBlogStyle({preset,blogName,greeting,closing,tone,emoji,instructions})`: 본인 계정에 검증된 스타일 저장. 생성 시 서버가 읽어 snapshot.
- `savePost({id,requestId,expectedVersion,post,photoGroupId?,generationId?})`: 새 Storage 그룹/성공한 본인 생성의 사진을 연결해 무료 저장. 기존 CAS/요청 멱등성 유지. 구 인라인 이미지/chunks API는 호환 경로 유지. 새 UI는 Storage 경로 사용.
- `getPost({id})`: 기존 chunks 또는 새 Storage 사진을 소유권 확인 후 반환.
- `updateAIConfig(config)`: 현재 Auth customClaims.admin=true인 관리자만 모델/한도/가격/비상 정지를 검증하여 변경.
- `recoverGenerations({})`: 관리자 전용 만료 작업 복구. 예약/정산과 동일 서비스 함수 사용.
- `createOrder`, `confirmPayment`: 계속 unimplemented. STEP 3 결제/상품 가격은 미구현.

생성 상태는 reserved → running → succeeded 또는 failed_refunded입니다. 멱등 ID 재전송은 새 AI 호출을 시작하지 않습니다. 신규 재생성은 새 요청 ID와 새 1크레딧이 필요합니다. 같은 ID로 다른 입력은 already-exists입니다.

예상 오류: unauthenticated/failed-precondition(인증/회원), invalid-argument(입력/사진), resource-exhausted(잔액/횟수/동시성/비용/저장 용량), unavailable(비상 정지/업로드), permission-denied(타인 데이터), aborted(CAS/진행 중 업로드).

세부 원자성·환급·보수적 비용 상한·현재 mock/실제 구분·스키마는 [STEP2.md](STEP2.md)를 참고하세요. 아래 문서는 STEP 1 시점의 설계 기록입니다.

---

# STEP 1 API 설계 기록

# 서버 API와 STEP 2 계약

Firebase Callable v2, 지역 `asia-northeast3`. SDK가 Firebase ID 토큰을 전달하며 서버는 현재 Auth 계정의 활성/이메일 인증 상태를 다시 확인합니다. 클라이언트 입력에 `uid`, `balance`, `amount`, `admin`이 있어도 권한이나 지급에 사용하지 않습니다.

## STEP 1 구현 API

- `ensureProfile({}) → {created:boolean,credits:number}`: 이메일 소유 확인 후 회원 초기화. Secret Manager `SIGNUP_IDENTITY_HMAC_KEY`가 필요합니다. 로그인 시 호출하고 재시도할 수 있습니다. 무료 2개 정책은 최초 인증 회원 초기화 시 적용됩니다.
- `savePost({id,requestId,expectedVersion,post}) → {id,version}`: 본인 회원 프로필 필요. `id`/`requestId`는 1~100자의 영숫자/`_`/`-`. 기존 글 소유권 검증 및 버전 CAS. 같은 마지막 requestId 재요청은 같은 결과를 반환합니다. 변경 충돌은 `aborted`, 다른 회원 글은 `permission-denied`, 잘못된 크기/필드는 `invalid-argument`입니다. 사진과 본문을 한 번에 커밋합니다. 무제한 과거 requestId 중복 제거는 제공하지 않습니다. 네트워크 오류 후 재시도는 동일 requestId를 유지해야 합니다.
- `getPost({id}) → post + {id,imgs[]}`: 서버에서 소유권 확인 후 일관된 본문/사진 로드. 현재 UI는 서버 글을 직접 삭제/수정하지 않고 명시적으로 복사합니다.
- 회원 조회: `users/{currentUid}` snapshot. 글 조회: `posts where uid == currentUid order by updatedAt desc limit 100`. UID 없는 전체 조회는 규칙에서 거절됩니다. 100개 이후 페이지네이션은 후속 기능입니다.

현재 UI의 계정 복사는 새 글 ID를 생성해 한 번 저장합니다. 성공 응답을 받지 못한 불확실한 네트워크 오류 후 다시 클릭하면 복제 글이 생길 수 있으나 기존 글을 덮거나 삭제하지 않습니다. 금융 처리와 달리 저장 UI는 최소 한 번 복사를 우선합니다. 향후 업로드 outbox를 두어 브라우저 재시작에도 동일 requestId를 유지할 수 있습니다.

## STEP 2용 닫힌 엔드포인트

`requestGeneration`, `createOrder`, `confirmPayment`는 실제로 배포 가능한 Callable입니다. 비로그인 `unauthenticated`, 미인증 `failed-precondition`, 초기화된 회원 `unimplemented`를 반환합니다. 외부 호출·주문 생성·잔액 차감·지급은 없습니다. 아래는 후속 구현 계약이며 아직 성공 응답을 반환하지 않습니다.

### requestGeneration

입력:
```json
{"requestId":"uuid","title":"제목","memo":"메모","content":"경험","placeInfo":"장소","type":"카페","volume":"normal","photos":["data:image/jpeg;base64,..."]}
```

예정 응답: `{generationId,status,result?,creditsRemaining}`. 같은 UID+requestId는 같은 생성으로 수렴해야 합니다. 서버에서 입력 검증 후 트랜잭션으로 잔액 >=1 확인, 1크레딧 예약/차감, generation과 원장을 함께 만듭니다. 차감 후 비밀키가 바인딩된 서버만 Claude/네이버를 호출합니다. 성공 시 result를 저장하고 실패 시 결정적 원장 ID로 정확히 한 번 환불합니다. 외부 호출을 Firestore 트랜잭션 콜백 안에서 실행하지 않습니다. 타임아웃/재시작/중복 요청·부정 요청에 대한 상태 복구를 테스트한 뒤 활성화합니다.

### createOrder

입력: `{requestId,packageId:'credits_10'|'credits_30'|'credits_70'}`.
예정 응답: `{orderId,orderName,amount,currency:'KRW',customerKey,successUrl,failUrl}`.

서버가 활성 `creditPackages`의 수량/가격을 읽고 주문에 스냅샷을 기록합니다. 가격·수량·UID를 브라우저가 지정하지 않습니다. 가격 미정/상품 비활성은 거절합니다. 토스 **일회성 결제 위젯**을 연결하고 자동 결제/빌링키 발급은 사용하지 않습니다. Toss 클라이언트 키만 브라우저에 제공하고 비밀키는 서버에 둡니다.

### confirmPayment

입력: `{orderId,paymentKey,amount}`. amount는 토스 콜백 값과 서버 주문 금액을 비교하는 값일 뿐 가격 결정에 사용하지 않습니다.
예정 응답: `{orderId,status:'paid',credited:number,balance:number}`.

주문 소유권·금액·통화·상품 스냅샷을 확인한 뒤 Secret Manager 비밀키로 토스 승인 API를 호출합니다. 토스 승인 응답의 주문/금액/완료 상태도 검증합니다. 외부 승인과 DB 커밋 사이 중단을 고려한 reconciliation이 필요합니다. 결제 승인·웹훅 재전송·동시 확인에서 하나의 `purchase_{orderId}` 원장과 지급 트랜잭션만 허용합니다. 브라우저 성공 URL만으로 크레딧을 지급하면 안 됩니다.

예정 주문 상태: `created → confirming → paid | failed | canceled`; 생성 상태: `reserved → running → succeeded | failed_refunded`. 취소/환불과 크레딧 사용 이후 환불 정책은 별도 확정이 필요합니다.

## 다음 단계 권장 순서

1. 네트워크 허용 적용 후 전체 Emulator 테스트를 실행해 보안 규칙/지급/저장 트랜잭션을 검증합니다.
2. 실제 Firebase 프로젝트를 연결하고 테스트 계정으로 운영 Auth/메일/Hosting 설정을 검증합니다.
3. AI/네이버 서버 호출, 1회=1크레딧 처리, idempotency/outbox/실패 환불, App Check 및 호출량 제한을 추가합니다.
4. 10/30/70회 가격을 확정하고 토스 테스트 상점의 일회성 결제·승인·웹훅·중복 지급 방지를 구현합니다.
5. 사진 Storage 이전, 목록 페이지네이션, 클라우드 수정/삭제와 보관 정책, 실제 기기 간 백업 복원/관측성을 보강합니다.
