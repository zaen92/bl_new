# Firebase 실제 연결 준비 (STEP 1 이후, 공개 배포 없음)

현재 실제 프로젝트 설정값은 제공되지 않았습니다. `demo-jaeinit`은 Emulator 식별자이며 실제 Firebase 프로젝트를 생성하거나 운영 설정값을 대신 만들어 넣지 않았습니다. 아래 단계는 사용자가 본인의 **테스트용 프로젝트**에서 수행할 준비 절차입니다.

## 1. 프로젝트와 Web App

1. Firebase Console에 본인 Google 계정으로 로그인하고 **프로젝트 추가**를 선택합니다.
2. 테스트용 이름을 정하고 콘솔이 제안하는 project ID를 확인해 생성합니다. Google Analytics는 이번 기능의 필수 요건이 아닙니다.
3. 프로젝트 설정 → 일반 → 내 앱 → Web(`</>`)을 선택하고 앱 닉네임을 정해 등록합니다. Hosting 배포를 바로 진행할 필요는 없습니다.
4. Web 앱의 SDK 설정에서 `apiKey`, `authDomain`, `projectId`, `appId`를 확인합니다. 이 값들은 Firebase 공개 클라이언트 설정입니다. 여기서 서비스 계정 키를 만들거나 브라우저에 넣지 않습니다.

## 2. Authentication

1. Build → Authentication → 시작하기를 선택합니다.
2. Sign-in method에서 **Google**을 활성화하고 지원 이메일을 지정합니다.
3. **Email/Password**도 활성화합니다. 이메일 링크 로그인은 현재 구현의 필수 기능이 아닙니다.
4. Settings → Authorized domains에 로컬 테스트용 `localhost`를 등록합니다. 실제로 사용할 인증 호스트만 등록합니다.
5. Google Cloud OAuth 동의 화면이 테스트 상태이면 본인의 테스트 Google 계정을 테스트 사용자로 등록합니다.
6. 이메일 인증/비밀번호 재설정 템플릿과 발신 설정을 검토합니다. 무료 크레딧 지급은 이메일 인증을 완료한 뒤 서버 회원 초기화가 성공해야 발생합니다.

## 3. Firestore Database

1. Build → Firestore Database → 데이터베이스 만들기를 선택합니다.
2. 기본 `(default)` 데이터베이스를 사용하고 서비스 지역을 검토해 선택합니다. 지역은 이후 쉽게 바꿀 수 없으므로 신중히 결정합니다. 현재 Functions 코드 지역은 `asia-northeast3`입니다.
3. 전체 공개 테스트 규칙을 사용하지 말고 잠긴 상태에서 준비합니다. 이 저장소의 `firestore.rules` 및 `firestore.indexes.json`을 테스트 완료 후 별도 승인된 적용 단계에서 사용합니다.
4. 브라우저에서 잔액·원장·주문을 수동 생성하지 않습니다. 회원·무료 크레딧은 서버 `ensureProfile`이 생성합니다.
5. 실제 Cloud Functions/Secret Manager 사용에는 적절한 요금제·IAM 권한이 필요합니다. 가입 식별 키 `SIGNUP_IDENTITY_HMAC_KEY`는 Firebase Secret Manager에 보관하고 필요한 함수에만 바인딩합니다. 채팅/소스/Vite 변수에 넣지 않습니다.

이번 단계에서 실제 규칙·함수·Hosting 배포는 하지 않습니다. 서버가 아직 테스트 프로젝트에 준비되지 않았다면 실제 Auth 로그인이 성공해도 회원 초기화/크레딧 조회까지 성공하는 것은 아닙니다.

## 4. 환경 변수 위치

Git에서 제외되는 `/workspace/bl_new/.env.local`에 콘솔에서 확인한 공개 설정만 입력합니다.

```dotenv
VITE_FIREBASE_API_KEY=<Web앱의_apiKey>
VITE_FIREBASE_AUTH_DOMAIN=<Web앱의_authDomain>
VITE_FIREBASE_PROJECT_ID=<실제_테스트_projectId>
VITE_FIREBASE_APP_ID=<Web앱의_appId>
VITE_USE_EMULATORS=false
```

값 입력 후 Vite 개발 서버를 재시작합니다. `npm run build`는 이 공개 설정을 번들에 포함하므로 어떤 프로젝트 설정으로 빌드하는지 확인해야 합니다. `<...>`는 설명용 자리표시자이며 그대로 사용할 수 없습니다.

Claude·네이버·토스 비밀키, 서비스 계정 JSON, 가입 식별 HMAC 키는 어떤 `VITE_` 변수에도 입력하지 않습니다. Firebase 공개 `apiKey`와 외부 API 비밀키는 다릅니다.

## 5. 로컬 / 실제 테스트 / 운영 구분

| 구분 | 설정 | 데이터/로그인 | 주의점 |
|---|---|---|---|
| Emulator | `.env.example`의 demo 설정, `VITE_USE_EMULATORS=true` 또는 설정 없는 기본 모드 | Auth 9099, Firestore 8080, Functions 5001 | 실제 프로젝트/과금 없이 테스트. 종료 시 데이터는 기본 소멸 |
| 실제 Firebase 테스트 | 본인 테스트 프로젝트 공개 Web 설정, `VITE_USE_EMULATORS=false` | 실제 Firebase Auth·Firestore·서버 함수 | 실제 사용자/데이터에 영향 가능. Emulator 결과와 별도 검증 |
| 운영 | 별도 검토된 운영 프로젝트·공개 설정·서버 Secrets·권한 | 실제 서비스 데이터 | 현재 미설정·미배포. STEP 1 검증 완료와 별도 배포 승인이 필요 |

로컬 Emulator로 돌아갈 때는 `.env.example`의 demo 설정을 `.env.local`에 적용하고 Vite를 재시작합니다. `.firebaserc` 기본값은 안전한 `demo-jaeinit`으로 유지합니다. 실제 프로젝트를 사용하는 CLI 명령은 나중에 승인된 단계에서 `--project 실제_ID`로 명시하며, 현재 테스트 명령은 demo만 사용합니다.

## 6. Emulator와 실제 Google OAuth

- Emulator Google 팝업은 로컬 테스트 제공자 계정 선택창이며 실제 Google OAuth를 검증하지 않습니다.
- 실제 OAuth는 `accounts.google.com` 로그인과 해당 테스트 프로젝트의 `authDomain`을 사용합니다. Firebase Auth 성공, 회원 초기화 성공, 크레딧 지급 성공을 각각 구분합니다.
- 현재 Emulator조차 Google SDK의 `apis.google.com` 로딩이 차단되어 실패합니다. 우선 Cloud 환경 설정에 `apis.google.com`, `storage.googleapis.com`을 실제 적용해야 합니다. 전체 Emulator 검증에 실제 Firebase 프로젝트는 필요하지 않습니다.
- 실제 OAuth 실행 시에는 실제 관찰된 Google 인증/토큰/프로젝트 인증 호스트에 대한 네트워크 허용도 필요합니다. 테스트 계정 자격 증명은 사용자가 브라우저에 직접 입력하고 채팅으로 전달하지 않습니다.

## 시작 가능한 시점

미실행된 Firestore 보안 4개 + 서버 통합 7개, Google Emulator 로그인을 통과한 뒤 STEP 1의 준비 상태를 다시 판정합니다. 현재 상태에서 STEP 2를 시작하거나 실제 결제를 연결하지 않습니다.
