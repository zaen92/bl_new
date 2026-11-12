# 현재 schema v3 — 최종 FREE/PRO 정책

- ops/service: signupCredits, freePostLimit, freeExportLimit, freeStyleLimit, proStyleLimit. 기본 5/5/5/1/50. 관리자 API만 쓰기.
- users: 기존 credits/buckets/원장 연결 보존 + tier(FREE/PRO), signupClaimId, savedPostCount, exportsUsed, activeStyleId, styleCount. 브라우저 쓰기 금지. 과거 누락 필드는 ensureProfile에서 보완.
- signupClaims: 기존 HMAC identity/firstUid/createdAt + exportsUsed. 회원 삭제·재가입/로그인/JSON으로 초기화하지 않음. 클라이언트 읽기/쓰기 금지.
- users/{uid}/styles/{id}: uid,style,updatedAt. 본인 읽기/서버 쓰기. 기존 blogStyle default 호환.
- posts: uid,title,type,volume,date,form,data(전체 생성 결과 텍스트),style,photoPositions,version,lastRequestId,createdAt,updatedAt,schemaVersion:3. 이미지 필드/신규 하위 chunks 없음. 저장 count와 원자 갱신.
- exportApprovals/{sha256(uid+requestId)}: uid,digest,bytes,exportsUsed,createdAt. 원본 파일/사진 없음. 같은 ID는 같은 파일만 승인.
- generations: 텍스트 input/style/result/status/phase/creditType/photoCount/photoManifest(순서/MIME/크기/해시)/lease와 시각. 원본 사진/Base64/부분 원문 없음.
- generationInternal, generationCosts, dailyCosts, creditLedger: 기존 private 비용/멱등성/예약/확정/환급 구조 유지.
- generationJobs/photoGroups/Storage 객체/새 photoChunks를 만들지 않습니다. 기존 자료는 읽기 경로를 닫고 관리자 migration까지 보존합니다.
- deletedUsers: 계정 접근 차단 marker. 사진 전용 retention quota/scheduler 없음.

과거 freeCredits 없는 잔액 bucket 분류의 2는 당시 지급량이며 현재 신규 5 지급과 다릅니다. 원장이나 기존 잔액을 바꾸지 않습니다. 자세한 migration은 [POLICY_MIGRATION.md](POLICY_MIGRATION.md).

---

## 이전 스키마 보존 기록 (현재 정책 아님)

# STEP 2 additive schema

`users`는 기존 credits/생성일을 유지하고 freeCredits,paidCredits,heldFree,heldPaid,activeGenerations,aiLimits,storageBytes,storageReservedBytes,blogStyle을 추가합니다. 최초 예약에서 STEP 1 잔액을 보존하며 bucket을 채웁니다. 신규 가입은 schemaVersion 2입니다.

추가 private 컬렉션은 generationInternal, generationJobs, generationCosts, dailyCosts, ops, deletedUsers이며 photoGroups는 본인 메타데이터만 읽습니다. generations는 본인 진행/결과 전용이고 운영 비용 필드는 분리합니다. Storage-backed posts는 photoGroupId/generationId를 추가합니다. 기존 photoChunks는 계속 읽을 수 있습니다.

컬렉션별 필드/권한, TTL·삭제·원장 이벤트는 [STEP2.md](STEP2.md)에 정의했습니다. 다음은 STEP 1의 원래 스키마 기록입니다.

---

# Firestore 스키마 v1

금액은 정수 KRW, 크레딧은 정수입니다. 시간은 서버 `Timestamp`, 회원 식별은 Auth UID입니다. 아래 `예정` 필드는 STEP 2 데이터 계약이며 STEP 1에서 주문/생성 문서를 만들지 않습니다.

| 컬렉션 / ID | 필드 | 쓰기 / 읽기 |
|---|---|---|
| `users/{uid}` | `uid,email,displayName,photoURL,credits,schemaVersion,createdAt,updatedAt` | 서버만 쓰기 / 본인·관리자 읽기 |
| `creditLedger/signup_{uid}` | `uid,delta:2,balanceAfter:2,reason:'signup',referenceId,createdAt` | 서버만 쓰기 / 본인·관리자 읽기 |
| `creditLedger/{eventId}` 예정 | 동일 구조, reason=`generation_debit,generation_refund,purchase`, referenceId=생성/주문 ID | 서버만 쓰기 / 본인·관리자 읽기 |
| `creditPackages/credits_10`, `_30`, `_70` | `credits:10\|30\|70,priceKRW:int,active:bool` | 관리자 claim만 쓰기 / 로그인 사용자 읽기 |
| `orders/{orderId}` 예정 | `uid,packageId,credits,amountKRW,currency:'KRW',status,provider:'toss',purchaseType:'one_time',paymentKey,createdAt,paidAt` | 서버만 쓰기 / 본인·관리자 읽기 |
| `generations/{generationId}` 예정 | `uid,requestId,status,costCredits:1,inputRef,resultRef,errorCode,createdAt,completedAt` | 서버만 쓰기 / 본인·관리자 읽기 |
| `posts/{id}` | `uid,title,type,volume,date,form,data,photoCount,version,lastRequestId,schemaVersion,createdAt,updatedAt` | 소유권 확인 서버 API만 쓰기 / 본인·관리자 읽기 |
| `posts/{id}/photoChunks/{imageIndex}_{part}` | `imageIndex:int,part:int,value:string` | 서버만 쓰기 / 상위 글 본인·관리자 읽기 |
| `signupClaims/{HMAC_SHA256(normalizedEmail)}` | `firstUid,createdAt,version:1` | 서버만 읽기/쓰기. 관리자 브라우저도 접근 불가 |

`creditPackages` 가격은 사용자에게서 제공되지 않았습니다. 로컬 seed는 `priceKRW:null,active:false`인 초안만 만듭니다. 관리자는 양의 정수 가격을 정한 후 활성화해야 합니다. 클라이언트 상품 쓰기 규칙은 유효한 양수 가격만 허용하므로 seed 초안은 Admin SDK로만 등록됩니다. 결제 횟수는 10/30/70이고 자동 결제·정기 구독 필드는 없습니다.

`form`: `ti`(제목), `mi`(추가 메모), `ci`(경험 원문), `ii`(장소 정보).

`data`: 원본 v3 JSON 필드 `title_1,title_2,title_3,keyword_main,keyword_sub,keyword_location,keyword_intent,place_name,place_address,place_hours,place_price,body,hashtags[],reel,thumbnail`. 클라우드 서버는 이 필드만 수락하고 별도 uid/크레딧/역할 값은 무시합니다. 기기/JSON 백업은 원본 데이터도 보존합니다.

사진은 Firestore 문서 1MiB 제한을 피하도록 180,000자 이하 조각으로 나눠 글과 함께 트랜잭션 저장합니다. 이미지와 긴 본문 필드 인덱싱은 제외합니다. 본문과 사진의 버전 일관성은 로드 트랜잭션으로 보장합니다. 요청은 최대 사진 20장/4MiB, 원문·결과 JSON 650KB입니다. 대량 서비스로 확장할 때는 Firebase Storage로 사진 이전을 권장합니다.

## 지급 불변식

1. Firebase Auth에서 UID의 현재 상태를 서버 조회합니다. 이메일 인증/이메일 존재/활성 계정이 모두 필요합니다. 클라이언트가 전송한 이메일이나 `credits`는 신뢰하지 않습니다.
2. `trim().toLowerCase()`한 이메일을 서버 비밀키 HMAC으로 변환합니다. 원문 이메일은 지급 방지 컬렉션에 저장하지 않습니다.
3. 하나의 Firestore 트랜잭션에서 user, claim, 결정적 `signup_{uid}` 원장을 읽습니다.
4. user가 이미 있으면 잔액을 변경하지 않습니다. claim과 원장이 모두 없을 때만 user=2, claim, +2 원장을 함께 생성합니다. 이미 지급된 동일 이메일의 새 UID는 user=0입니다.
5. 인증 계정을 삭제해도 지급 claim/원장을 삭제하지 않습니다. UID별 사용자/원장과 이메일별 claim 모두를 검사하여 중복 로그인·동시 요청·같은 이메일 재가입을 차단합니다. 실제 개인정보 삭제 정책에서는 claim 보유 목적·기간을 별도로 정하고 임의로 삭제하는 기능을 만들지 않아야 합니다.
6. 같은 사람의 **다른 이메일**, Gmail 별칭 등까지 식별하는 본인확인 정책은 이 구현의 범위가 아닙니다. 동일한 정규화 이메일에 대한 중복 지급만 보장합니다.

프로필은 최초 확인한 Auth 정보의 스냅샷입니다. 표시 이름 변경/소셜 계정 연결/이메일 변경 동기화는 별도 후속 기능입니다.
