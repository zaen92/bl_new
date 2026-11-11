# STEP 1 GitHub Actions

Workflow: `.github/workflows/step1-tests.yml` — **STEP 1 Emulator tests**.

- `codex/step1-foundation` push 및 `workflow_dispatch`로 시작합니다.
- GitHub 호스팅 Ubuntu 24.04, `.nvmrc`의 Node 22.23.4, Temurin Java **21.0.13+9**를 사용합니다. Actions도 공식 저장소 태그를 조회한 커밋 SHA로 고정했습니다.
- 루트/Functions 두 lockfile에 `npm ci`를 적용합니다. Playwright 1.65.0과 해당 버전의 공식 Chromium을 설치하고 `CHROMIUM_PATH`로 기존 설정에 연결합니다. UI/CSS/앱은 바꾸지 않습니다.
- Firestore 공식 JAR를 GitHub 러너에서 준비·크기/MD5/SHA-256 검증합니다. CI 캐시는 러너 OS와 package-lock hash로 구분하고 검증된 JAR만 저장합니다. Auth/Functions는 CLI JS 런타임을 사용합니다.
- 이전 미실행 11개를 우선 확인하도록 `npm test`를 먼저 실행합니다. 빌드/단위/UI/Auth는 별도 단계이며 Firestore 준비 실패와 관계없이 해당 선행 의존성이 준비되면 실행합니다.
- Google 테스트에 `continue-on-error`를 사용하지 않습니다. Auth 실패는 실패로 유지하며 다른 단계와 구분합니다. 실제 Google OAuth는 이 CI 대상이 아닙니다.
- 프로덕션 설정/서비스 계정/저장소 Secret이 필요하지 않습니다. 모든 Firebase 요청은 `demo-jaeinit` Emulator 대상으로 구성합니다. HMAC 키는 각 실행에서 무작위로 생성한 로컬 테스트 파일이며 출력/캐시/업로드하지 않고 끝에 삭제합니다.
- Workflow 권한은 `contents:read`, checkout 인증 정보 보존은 비활성화했습니다. 실제 배포·결제·STEP 2 명령은 없습니다.

## 결과와 로그

Actions 실행 → `Emulator integration, UI and Auth` 작업에서 각 단계를 확인합니다. Job Summary에는 실행/실패/미실행 상태와 테스트 수를 기록합니다. 실행되지 않은 단계는 **not run**으로 표시합니다.

`step1-test-evidence-<attempt>` artifact에는 **가공된 로그와 숫자 결과 JSON만** 들어갑니다. `.secret.local`, `.env`, 원시 Firebase debug log, Emulator 데이터, Playwright trace/네트워크 덤프는 올리지 않습니다. 로그 수집기는 로컬 테스트 키, Bearer/JWT, 인증 링크의 oobCode 등 민감 값을 출력 전에 지우며 원래 명령의 실패 exit code를 유지합니다. 실제 운영 비밀은 애초에 제공하지 않습니다. 보관 기간은 7일입니다.

필수 case 기대 수를 확인하고 0개/누락/skip 실행을 성공으로 인정하지 않습니다.

| 단계 | 기대 수 | 내용 |
|---|---:|---|
| unit | 7 | 기존 단위·SDK 직렬화·캐시 검증 |
| integration | 18 | 보안 4 + 서버 7 + **같은 단위 7 재실행** |
| ui | 4 | 기존 UI·글/사진/초안/JSON 저장 |
| auth | 2 | 이메일 + Google Emulator |
| ci-tools | 3 | 로그 비밀값 제거·결과 집계·실패 코드 유지 |

필수 앱 테스트는 고유 항목 **24개**, 별도 CI 도구 회귀 **3개**입니다. 명령별 테스트 실행 수를 더할 때 integration의 단위 7개를 중복 집계하지 않습니다. 공식 다운로드/브라우저 설치가 실패하면 관련 테스트는 미실행이며, 단위 테스트 통과로 서버 통과를 대신하지 않습니다.

## 수동 실행

1. GitHub에서 `zaen92/bl_new` → **Actions**를 엽니다.
2. Actions 사용 승인이 표시되면 저장소 소유자가 승인합니다. Settings → Actions → General 정책에서 이 workflow와 공식 GitHub Actions 사용이 허용되어야 합니다.
3. **STEP 1 Emulator tests** → **Run workflow** → 브랜치 **codex/step1-foundation** → 실행합니다.
4. 실행 URL을 보관하고 각 단계 결과와 Summary/artifact를 확인합니다. 미인증/권한 부족으로 이 채팅에서 조회하지 못한 실행은 사용자가 직접 확인할 수 있습니다.

`workflow_dispatch` 수동 메뉴는 GitHub의 기본 브랜치에 workflow가 있는지에도 영향을 받습니다. 기본 브랜치에 없어 메뉴가 보이지 않으면 이 작업 브랜치에 새 커밋을 push하여 자동 실행할 수 있습니다. 이 작업에서 다른 브랜치 병합이나 기본 브랜치 변경을 임의 수행하지 않습니다.

본인 로컬에서 이미 GitHub 인증이 되어 있다면:

```bash
gh workflow run step1-tests.yml --repo zaen92/bl_new --ref codex/step1-foundation
gh run list --repo zaen92/bl_new --branch codex/step1-foundation
gh run view RUN_ID --repo zaen92/bl_new --log-failed
```

토큰이나 비밀번호를 채팅으로 보내지 마세요. Workflows 작성/push 권한이 거부되면 GitHub 연결 App의 해당 저장소 Workflows 쓰기 권한을 소유자가 검토해야 합니다. API 조회 실패가 Git push 실패와 같은 의미는 아닙니다.

## 실패 분류와 완료 조건

- 의존성/공식 다운로드/Java/브라우저 설치에서 실패: CI 환경 준비 실패이며 해당 테스트 미실행.
- Firestore 규칙/무료 지급/직렬화/소유권 assertion 실패: 오류 로그와 실제 test case를 분석해 코드 또는 테스트 환경 문제를 판단합니다. 규칙을 완화하거나 case를 생략하지 않습니다.
- Google 외부 SDK·브라우저 연결 실패: Auth 단계 실패로 보고하고 실제 OAuth 검증과 구분합니다. TLS 검증을 끄지 않습니다.
- 모든 필수 앱 case가 실제로 실행되어 통과한 결과와 실행 URL이 있어야 STEP 1 검증 완료로 판단합니다. Workflow 파일 생성 또는 push만으로 완료라고 판단하지 않습니다.
