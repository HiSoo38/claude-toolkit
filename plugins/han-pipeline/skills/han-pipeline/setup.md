# 설정 · 기반 작업

## 설정 파일 만들기

설정 파일은 `<저장소>/.claude/han-pipeline.md` 다. 프로젝트 `CLAUDE.md` 는 건드리지 않는다. 커밋할지는 사용자가 정한다.

1. `han.mjs start` 출력의 자동 감지 값을 아래 형식에 옮긴다. 공용 디렉터리는 `han-pipeline:explorer` 로 찾는다.
2. 사람마다 다른 값인 화면 자동 테스트 범위만 SKILL.md 3 단계 "질문은 여기서 한 번에" 에 넣어 묻는다 (`조회만` (권장, 운영 데이터를 바꾸지 않음) / `테스트 계정` / `로컬 DB`).
   - `테스트 계정` 을 고르면: 계정 값은 사용자가 `.env.local` 같은 무시된 파일에 `HAN_E2E_EMAIL` · `HAN_E2E_PASSWORD` 로 넣게 안내한다. 대화나 설정 파일에 쓰지 않는다.
3. 만든 파일 내용을 보고에 보여 준다. 그 밖의 값은 묻지 않고 감지 값으로 진행한다 (사용자가 나중에 고친다).

```markdown
# han-pipeline 설정

## 설정

- 통합 브랜치: develop
- 배포 브랜치: main
- 통합 브랜치 머지: 자동        # 자동 | 사람
- 계획서 위치: docs/plans
- 공용 디렉터리: src/components, src/lib, src/hooks
- 타입 검사: npx tsc --noEmit
                                # 모노레포면 앱마다 [경로] 표시: [apps/web,packages] npx tsc -p apps/web/tsconfig.json && [apps/admin,packages] npx tsc -p apps/admin/tsconfig.json
                                #   표시 하나는 다음 표시 앞까지를 덮는다. 그 경로 아래 코드가 바뀌었을 때만 돈다. 표시 없는 명령은 늘 돈다. 없는 경로를 적으면 검사가 실패한다
- 린트: npx eslint {files}
- 테스트: npx vitest related {files} --run --maxWorkers=1 --passWithNoTests
- 파일 길이 한도: 400
- 파일 길이 예외:               # 쉼표로 구분한 경로 (사용자 승인을 받은 것만)
- 화면 테스트: 조회만           # 조회만 | 테스트 계정 | 로컬 DB
- 로그인 세션 파일:             # 소셜 로그인 프로젝트에서 저장해 둔 Playwright 세션 (예: playwright/.auth/user.json)
- 쓰기 테스트 조건:             # 쓰기 테스트를 돌려도 되는 때 (예: 환경변수 HAN_E2E_WRITE=1 — 개인 DB 로 서버를 켠 사람만 켠다). 비우면 쓰기 테스트는 늘 건너뛴다
- dev 서버 주소: http://localhost:3000   # package.json 의 dev 스크립트 포트를 확인해서 적는다
- 자원 등급: 자동               # 자동 | 빠듯 | 보통 | 여유
- 동시 기능 수: 3               # 여러 기능을 한 번에 맡겼을 때 동시에 띄울 작업 폴더 수 (parallel.md)
- 워크트리 준비:                # 새 작업 폴더에서 한 번 돌릴 명령 (Next.js 면 비워 두어도 npx next typegen)

## 학습 규칙

(사용자가 승인한 규칙만)

## 리뷰 지적 기록
```

- `{files}` 는 `check` 가 바뀐 코드 파일 목록으로 바꾼다.
- 검사 명령은 한 프로세스짜리만 쓴다. 전체 빌드 명령을 넣지 않는다.
- `자원 등급` 은 측정값이 체감과 다를 때 사람이 고정하는 칸이다.
- `동시 기능 수` 를 늘려도 무거운 검사는 PC 전체에서 한 번에 하나씩만 돈다. 늘어나는 것은 동시에 코드를 쓰는 에이전트 수다.

## 테스트 도구 설치

사용자 승인을 받은 뒤에만. 프로젝트의 패키지 매니저(lock 파일로 판단)를 쓴다. 아래는 npm · TypeScript 기준.

```bash
han.mjs run "npm install -D vitest"
han.mjs run "npm install -D @playwright/test"
han.mjs run "npx playwright install chromium"     # 예산이 "빠듯" 이면 하지 않고 보고에 명령만 적는다
```

- 패키지는 하나씩 설치한다 (한꺼번에 받으면 메모리를 많이 쓰고, npm 의 peer 의존성 계산 오류도 잘 난다).
- 최신판이 프로젝트의 기존 타입 패키지와 peer 의존성이 맞지 않으면 프로젝트 쪽 버전을 올리지 말고, 맞는 이전 주 버전을 고른다 (`npm view <패키지>@<주 버전> peerDependencies`).

- `vitest.config.ts`: 경로 별칭(`tsconfig` 의 `paths`)을 `resolve.alias` 로 옮기고, `environment: "node"`, `include` 를 소스 폴더의 `*.test.ts` 로, `maxWorkers: 1`.
- `playwright.config.ts`: `testDir: "e2e"`, `workers: 1`, `fullyParallel: false`, 브라우저는 chromium 하나, `use.baseURL` 은 `process.env.HAN_BASE_URL ?? <dev 서버 주소>`, `screenshot: "only-on-failure"`. **`webServer` 를 넣지 않는다** (이미 켜진 dev 서버를 쓴다). 로그인 세션 파일이 있으면 `use.storageState` 로 쓴다 (파일이 없을 때는 넣지 않게 `existsSync` 로 확인).
- `package.json` scripts: `"test": "vitest run --maxWorkers=1"`, `"test:e2e": "playwright test --workers=1"`.
- `.gitignore`: `/test-results/`, `/playwright-report/`, `/playwright/.cache/`, `/playwright/.auth/`.
- 소셜 로그인(GitHub · Google 등)만 있는 프로젝트: 테스트 계정 비밀번호로 로그인할 수 없으므로 **저장한 로그인 세션**을 쓴다. 사용자가 한 번 `npx playwright codegen --save-storage=playwright/.auth/user.json <dev 서버 주소>/login` 으로 열린 브라우저에서 로그인하고 창을 닫으면 세션이 저장된다. 이 방법을 `e2e/README.md` 에 적어 둔다. 실제 계정이므로 범위는 `조회만` 을 유지한다.
- 동작 확인용 테스트를 하나씩 둔다: 순수 함수 하나의 단위 테스트, 로그인 없이 열리는 페이지 하나의 화면 테스트.
- 설정의 `테스트` 칸을 채운다.

## 기반 작업 (새 프로젝트)

소스 코드가 거의 없을 때 기능보다 먼저 한다. 기반 작업은 요청한 기능과 **따로** 한 묶음(계획서 하나, git 모드면 PR 하나)으로 하고, 끝나면 이어서 요청한 기능으로 넘어간다. 이것도 계획서 · 체크리스트를 쓰고 SKILL.md 4~9 단계를 거친다. 검사 도구가 생기기 전의 `check` 는 대부분 건너뜀으로 끝나니, 3 번까지 끝낸 뒤 처음으로 `check` 를 제대로 돌린다.

1. **스택**: 요구사항이나 사용자가 정한 게 있으면 그대로. 없으면 후보 1~2개와 이유를 SKILL.md 3 단계 질문에 넣어 묻는다.
2. **폴더 구조**: 기능별 폴더(`features/<기능>/`)와 공용 디렉터리(`components/` · `lib/` · `hooks/` 등)를 만들고, 각 폴더에 무엇을 두는지 `README` 나 프로젝트 `CLAUDE.md` 에 한 줄씩 적는다. 이것이 이후 구조 설계의 기준이 된다.
3. **검사 도구**: 타입 검사 · 린트 설정.
4. **테스트 도구**: 위 "테스트 도구 설치".
5. **설정 파일**: 위 "설정 파일 만들기" (검사 · 테스트 명령이 생긴 뒤라 자동 감지가 채운다). 저장소에 `develop` 이 없으면 설정의 통합 브랜치는 배포 브랜치와 같게 감지된다 — 보고에 `develop` 을 만들지 묻는 줄을 넣는다.
6. 사용자가 DB 설계를 가져왔으면 그 설계대로 마이그레이션 파일을 만든다 (적용은 사람이 한다).
