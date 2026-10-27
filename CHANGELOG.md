# CHANGELOG

레포 전체 변경 이력. 형식과 작성 규칙은 [ADDING.md](./ADDING.md#7-버전-올리기와-changelog) 참고.
날짜 내림차순. 항목 앞의 `[플러그인]` 은 영향받는 플러그인, `[repo]` 는 레포 공통.

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
