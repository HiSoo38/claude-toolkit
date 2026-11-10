# CHANGELOG

레포 전체 변경 이력. 형식과 작성 규칙은 [ADDING.md](./ADDING.md#7-버전-올리기와-changelog) 참고.
날짜 내림차순. 항목 앞의 `[플러그인]` 은 영향받는 플러그인, `[repo]` 는 레포 공통.

## 2026-11-10

### 추가

- [han-pipeline] 0.3.0 — 화면을 바꾼 항목마다 「화면 상태 표」(정상 · 로그인 안 함 · 권한 없음 · 빈 목록 · 서버 오류 · 모바일 폭)를 테스트 계획에 넣고 자동 · 사람에게 배정한다. 정상 흐름만 보다가 권한 없음 안내가 제목과 겹치는 것을 사람이 화면에서 찾았다
- [han-pipeline] 0.3.0 — 현황 파악에 「앞뒤 기능 잇기」: 이번 데이터를 읽는 다른 화면, 이번 화면이 읽는 데이터를 만드는 다른 길(관리자 처리 등)을 계획서에 적는다. 관리자 「이수 확정」 API 를 만들고도 회원 목록이 진도만 봐서 확정한 과정이 안 나온 빈틈이 각 기능 테스트를 다 통과했다
- [han-pipeline] 0.3.0 — 보고 맨 위에 「이번에 하지 않은 것」을 다시 보여 준다. 시나리오의 데이터 전제 표시(`[전제: …]`), 설정 `쓰기 테스트 조건`(맞지 않으면 쓰기 화면 테스트를 건너뜀), 대화 요약 뒤 스킬이 안 보일 때 대처(함정 표)

- [han-pipeline] 0.2.0 — 통합 · 배포 브랜치(develop · main)에서는 커밋하지 않는다. 작은 수정도 `feature/` · `fix/` · `docs/` 브랜치(또는 작업 폴더)를 따서 PR 로 올리고, 통합 브랜치에는 PR 머지로만 들어간다. 훅이 두 브랜치의 커밋과 통합 브랜치로 바로 하는 push 를 막는다. 로컬 모드의 커밋 명령도 통합 · 배포 브랜치면 브랜치 따기부터 보여 준다
- [han-pipeline] 0.2.0 — 0.1.0 뒤에 들어갔으나 버전을 올리지 않아 업데이트로 가지 않던 것을 함께 낸다: worktree 를 만들며 Orca 작업공간에 Claude 띄우기(`worktree add --launch`), 기능마다 사람이 밟을 `test-scenarios.md`, Codex 리뷰는 PC 전체 검사 줄에 세우지 않고 바로 실행

## 2026-11-06

### 추가

- [han-pipeline] 0.1.0 — 새 플러그인. 개발 요청 하나를 현황 파악 → 구조 설계 → 계획서 · 체크리스트 → 테스트 먼저 구현 → `han.mjs check` 검사 관문(훅이 검사 안 한 커밋 · PR 을 막음) → 화면 자동 테스트 → (git 모드) PR · Codex + Claude 리뷰 · 확인 리뷰 · 통합 브랜치 머지 → 보고까지 진행한다. 사람만 하는 일(배포 브랜치 머지 · DB 적용 등)은 훅이 막는다
- [han-pipeline] 0.1.0 — 여러 기능을 한 번에 맡기면 기능마다 git worktree 작업 폴더 · 브랜치 · 하위 에이전트를 따로 두고 동시에 진행한다 (`han.mjs worktree add|list|remove`, `parallel.md`). 같은 파일 · 테이블을 고치는 기능은 차례로 묶고, 통합 브랜치 머지는 메인 세션이 하나씩 한다. 작업 폴더는 원래 폴더의 node_modules 를 연결한다
- [han-pipeline] 0.1.0 — 무거운 일(타입 검사 · 린트 · 테스트 · Codex)은 PC 전체 잠금으로 여러 세션 · 작업 폴더 사이에서도 한 번에 하나만 돈다. `han.mjs stamp` 는 동시에 받아도 겹치지 않는 DB 마이그레이션 파일 시각을 준다

## 2026-10-30

### 수정

- [feature-flow] 0.1.3 — Codex 를 못 쓸 때(설치 안 됨 · 사용 한도 · 오류) 멈추지 않고 Claude 리뷰어 Agent 로 대신해 두 리뷰어를 채운다. 리뷰 첫 줄 · 요약 표에 `Claude(Codex 대신: <이유>)` 로 적는다. 사용 한도에 걸리면 기다리느라 기능 진행이 멈췄다
- [feature-flow] 0.1.2 — 머지 직전 PR 맨 아래에 리뷰 요약 코멘트 1건(회차별 지적 수 · 처리 · 리뷰 링크)을 단다. PR Review 는 커밋 사이에 끼고 고친 줄의 인라인 지적은 Outdated 로 접혀 PR 에서 커밋만 보였다
- [feature-flow] 0.1.1 — Codex 리뷰 지시문을 `- < 파일` 로 표준 입력에 넘긴다. 인자로 넘기면 Windows 에서 지시문 안 큰따옴표에서 잘려 Codex 가 첫 줄만 받았다

### 추가

- [feature-flow] 0.1.0 — 새 플러그인. `/feature-flow:ship-feature` 가 기능 하나를 브랜치 → 계획서 · 체크리스트 → 성격별 커밋 → PR → 전수 리뷰(Codex + Claude 동시) → GitHub PR Review 게시 → 한 번에 수정 → 확인 리뷰(Codex) → develop 머지 → develop→main PR 까지 진행한다. 리뷰는 PR 하나당 전수 1번 + 확인 1번. 프로젝트 `CLAUDE.md` 의 `## 작업 흐름 설정` 으로 통합 · 배포 브랜치, 계획서 위치, 검증 명령, develop 머지 여부(자동 · 사람)를 바꾼다

## 2026-10-27

### 변경

- [dev-pipeline] 0.3.0 — 리뷰를 통과한 작업은 `/work-task` 가 **각 사용자의 커밋 규칙**(전역 · 프로젝트 CLAUDE.md)대로 작업 브랜치에 커밋하고, push 는 항상 사용자에게 묻는다. 규칙이 없을 때만 기본 형식을 쓴다. 설정 `작업 브랜치 커밋: 자동 | 사람`, `push: 물어봄 | 안 함`. `/wave-status` 에 커밋 · push 상태 열
- [dev-pipeline] 0.2.0 — 구현 계획 문서. `/plan-tasks` 가 계획서(`docs/tasks/plan.md`: 목표·범위, 작업 간 공통 약속, 작업·웨이브, 공유 파일 소유, 테스트 전략, 위험), 구현 체크리스트(`checklist.md`: 작업마다 순서대로 따라 하면 끝나는 `T<번호>-<순번>` 항목), 작업 카드(`T<번호>.md`)를 만든다. 작업별 결과는 `results/T<번호>.md` 에 남는다
- [dev-pipeline] 0.2.0 — 진행 상황 보기. 새 훅 `hooks/log_agents.py` 가 dev-pipeline 에이전트의 시작·끝(작업 설명, 걸린 시간, 결과 첫 줄)을 `.git/dev-pipeline/progress.log` 에 자동으로 남기고, Codex 리뷰와 작업 단계도 같은 로그에 남는다. `/run-wave` 는 띄운 작업에 Orca 읽지 않음 표시를 달고 첫 작업 탭을 앞으로 띄우며 보는 곳을 알려 준다. `/wave-status` 가 로그의 최근 줄을 보여준다
- [dev-pipeline] 0.2.0 — `/work-task` 는 블로커를 스스로 해소 처리하지 않는다 (고치고 재리뷰해 0 이 되거나, 오탐 의심이면 사람 확인 필요로 넘긴다). 리뷰어는 리뷰 뒤에 쓰는 `docs/tasks/results/` 가 없는 것을 문제 삼지 않는다
- [dev-pipeline] 0.2.0 — 훅 입력을 UTF-8 로 읽는다 (Windows 에서 한글 경로가 cp949 로 읽혀 쓰기 제한 판정이 깨질 수 있었다)
- [dev-pipeline] 0.2.0 — 코드 구조 원칙. 템플릿 `CLAUDE.md` 에 "코드 구조 원칙"(공통화 · 분리 · 과분리 금지 · 인수인계 기준 · 기존 스타일 · 확장성 · 점검)과 "공용 코드 위치" 를 넣고, 계획(재사용할 기존 코드) · 계획 리뷰 · implementer · 코드 리뷰(기존 공통 코드 중복은 블로커) · 결과 기록이 이 기준을 쓴다
- [dev-pipeline] 0.2.0 — 계획 리뷰 블로커를 사람이 `plan-review.md` 의 "사람 판단" 표에 기각과 이유로 넘길 수 있다
- [dev-pipeline] 0.2.0 — 리뷰 관문 두 번. 새 커맨드 `/review-plan` 과 새 에이전트 `plan-reviewer` 가 구현 전에 계획이 목적에 맞는지, 체크리스트대로 하면 구현이 끝나는지 검사하고 `plan-review.md` 에 판정과 문서 지문을 남긴다. `/run-wave` 는 통과하고 그 뒤 문서가 바뀌지 않았을 때만 작업을 띄운다. 코드 리뷰(`reviewer`, Codex)는 체크리스트 항목별 대조, 변경이 다른 기능에 주는 영향, 에러 시나리오를 추가로 본다
- [dev-pipeline] 0.2.0 — Orca 자동 병렬 실행. 새 커맨드 `/run-wave` 가 다음 웨이브의 작업마다 Orca worktree 와 Claude 를 동시에 띄운다. 각 worktree 는 새 커맨드 `/work-task` 로 구현 → 테스트 → 리뷰 → 블로커 수정까지 하고 Orca 카드 상태로 결과를 알린다. 새 커맨드 `/wave-status` 는 작업별 진행과 다음 웨이브를 보여준다. 커밋·머지는 사람이 한다
- [dev-pipeline] 0.2.0 — 템플릿 `CLAUDE.md` 에 "파이프라인 설정" 섹션 (리뷰어 · 동시 작업 수 · 리뷰 수정 횟수 · 기준 브랜치). 브랜치명은 `t<번호>-<슬러그>` (Orca 가 worktree 이름의 슬래시를 하이픈으로 바꾼다)
- [dev-pipeline] 0.2.0 — `/review-diff` 에서 리뷰어를 `claude` / `codex` / `both` 중에 고른다. 인자가 없으면 프로젝트 CLAUDE.md "리뷰" 섹션 값(기본 `both`)을 쓴다. Codex 는 `codex exec -s read-only` 로 실행하며, Codex 를 쓸 수 없으면 `both` 는 Claude 리뷰만 한다
- [dev-pipeline] 0.2.0 — 템플릿 `AGENTS.md` 에 "Review guidelines" 섹션 추가. Claude 리뷰, Codex 로컬 리뷰, GitHub PR 의 `@codex review` 가 같은 기준을 쓴다. 템플릿 `CLAUDE.md` 에 "리뷰" 섹션 추가

### 추가

- [repo] 마켓플레이스 `claude-toolkit` 구성: `marketplace.json`, README, ADDING, LICENSE(MIT), `.gitignore`, `scripts/validate.py`
- [dev-pipeline] 0.1.0 첫 릴리스
  - 스킬: `init-pipeline`, `plan-tasks`, `review-diff` (사용자 실행), `pipeline-workflow` (자동 적용 규칙)
  - 에이전트: `planner`, `db-designer`, `api-designer`, `implementer`, `reviewer`
  - 훅: 에이전트별 파일 쓰기 위치 강제 (`hooks/guard_paths.py`)
  - 템플릿: `CLAUDE.md`, `AGENTS.md`, `requirements.md`, `schema.sql` / `schema.md`, `api-spec.md`
