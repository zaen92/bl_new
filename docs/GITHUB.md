# 독립 GitHub 프로젝트 관리

이 프로젝트의 유일한 원격은 `https://github.com/zaen92/bl_new.git`입니다. 기존 `/workspace/bl_new`의 코드만 관리하며 다른 저장소/브랜치의 코드를 가져오거나 합치지 않습니다.

작업 브랜치: `codex/step1-foundation`. 최초 원격 조회는 성공했고 원격 브랜치가 없는 빈 저장소였습니다. 기존 로컬 파일·구조를 유지한 채 독립 루트 커밋을 준비했습니다. 원격 푸시의 최종 결과는 이번 작업 완료 보고와 Git 로그로 확인합니다.

## 일상 작업

```bash
cd /workspace/bl_new
git status --short --branch
git log --oneline -5
# 현재 작업 브랜치에서 변경을 검토하고 명시적으로 필요한 파일만 추가
git diff
git add <검토한_파일>
git commit -m "변경 요약"
git push origin codex/step1-foundation
```

이 작업은 main 생성·병합·강제 푸시·다른 원격 추가·다른 저장소에서 pull을 하지 않습니다. GitHub에서 main이 보이지 않더라도 현재 작업 브랜치의 코드가 별도로 보존됩니다. 병합이나 기본 브랜치 변경은 별도 결정입니다.

`.env.local`, `functions/.secret.local`, 서비스 계정 키, node_modules, `.local` 로그·백업, 빌드 결과는 커밋하지 않습니다. GitHub 작업에는 플랫폼 HTTPS Git 프록시 인증을 우선 사용합니다. 토큰 변수가 없다는 이유로 새 토큰을 만들 필요는 없습니다.

## 푸시 권한이 거부되는 경우

1. GitHub에서 본인이 `zaen92/bl_new` 저장소에 쓰기 권한이 있는지 확인합니다.
2. Codex의 GitHub 연결 설정에서 해당 계정/조직과 저장소 접근 범위를 확인하고, 필요하면 GitHub App의 저장소 접근 권한을 승인합니다. 조직 SSO가 있다면 연결 권한도 확인합니다.
3. 같은 원격에 대한 push를 재시도합니다. 토큰·비밀번호·서비스 계정 키를 채팅으로 보내거나 remote URL에 넣지 않습니다.
4. 본인 컴퓨터에서만 push할 수 있다면 안전하게 프로젝트 파일 또는 커밋을 옮긴 뒤, GitHub CLI/운영체제 자격 증명 도구로 본인이 인증해 같은 브랜치를 push합니다. 기존 파일·Git 이력을 초기화하지 않습니다.

다른 새 저장소를 꼭 사용하려면 먼저 GitHub에서 비공개 빈 저장소를 만들고(README/템플릿 자동 생성 없이), 새 `owner/repo`를 정한 뒤 원격 변경을 별도 요청하세요. 현재는 기존 원격이 연결되어 있으므로 새 저장소를 만들 필요가 없습니다.
