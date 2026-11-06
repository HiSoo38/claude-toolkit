# han-pipeline

개발 요청 하나를 끝까지 같은 순서로 진행하는 Claude Code 플러그인입니다.
새 프로젝트 초기 세팅에도, 진행 중인 프로젝트의 기능 추가 · 수정에도 씁니다.

```
현황 파악 → 구조 설계(코드 분리) → 계획서 · 체크리스트 → 테스트 먼저 구현 → 검사 관문
→ 화면 자동 테스트 → (git 모드) PR · 리뷰(Codex + Claude) · 수정 · 확인 리뷰 · 통합 브랜치 머지 → 보고
```

## 특징

| | 내용 |
| --- | --- |
| 입력 문서 우선 | 사용자가 가져온 요구사항 · DB 설계 · API 명세를 그대로 기준으로 쓴다. 다시 쓰지 않는다 |
| 코드 분리 기본 | 구현 전에 `explorer`(haiku)가 재사용할 코드를 찾고, 계획서의 "구조 설계" 칸이 차야 구현을 시작한다. 파일이 한도를 넘어 커지면 검사가 실패한다 |
| 검사 관문 | `han.mjs check` 가 타입 검사 · 린트 · 관련 테스트 · 파일 길이 · 민감 정보를 하나씩 돌린다. 훅이 검사를 통과하지 않은 커밋 · PR 생성을 막는다 |
| 테스트 자동화 | 로직은 단위 테스트를 먼저 쓰고, 화면은 `tester`(sonnet)가 켜진 dev 서버에 Playwright 로 확인한다. 자동으로 못 한 항목만 사람에게 넘긴다 |
| 모델 나눔 | 계획 · 구현 · 판단은 메인 세션 모델, 탐색은 haiku, 화면 테스트는 sonnet, 리뷰는 opus + Codex |
| 사람만 하는 일 | 배포 브랜치 머지 · push, force push, DB 적용 · 직접 쿼리, 운영 배포 · 비밀값 변경은 훅이 막고 명령만 보여 준다 |
| PC 자원 | 시작할 때 그 PC 의 RAM · 코어를 재서 사용자 몫(전체 RAM 의 25%, 최소 3GB)을 먼저 남기고 나머지만 쓴다. 무거운 일은 PC 전체에서 한 번에 하나(여러 세션 · 작업 폴더가 줄을 선다), 낮은 우선순위로 |
| 여러 기능 동시에 | 한 번에 여러 기능을 맡기면(git 모드) 기능마다 git worktree 작업 폴더 · 브랜치 · 하위 에이전트를 따로 두고 동시에 진행한다. 같은 파일 · 테이블을 고치는 기능은 차례로 묶고, 통합 브랜치 머지는 메인 세션이 하나씩 한다 |
| 학습 규칙 | 리뷰에서 같은 종류 지적이 두 번 나오면 그 프로젝트 규칙으로 올릴지 묻는다 (승인할 때만 추가) |

## 설치

```
/plugin marketplace add HiSoo38/claude-toolkit
/plugin install han-pipeline@claude-toolkit
```

필요한 것: Node.js 18 이상, git. git 모드는 `gh`(로그인), 교차 리뷰는 Codex CLI(없으면 Claude 리뷰어로 대신).

## 사용

평소처럼 말하면 됩니다: "할 일 달력 만들어줘", "이 요구사항대로 개발해줘 docs/req.md", "기능 작업 올려줘", "이어서 해줘".

- 요청에 "올려줘 · PR · 머지까지" 가 있으면 **git 모드**(브랜치 → PR → 리뷰 → 통합 브랜치 머지), 없으면 **로컬 모드**(git 은 건드리지 않고 구현 · 테스트 · 검사 후 커밋 나눔안을 보여 줌).
- 처음 쓰는 저장소에서는 `<저장소>/.claude/han-pipeline.md` 설정 파일을 만들며 화면 테스트 범위를 한 번 묻습니다.

## 구성

```
skills/han-pipeline/   SKILL.md (흐름) · git-flow.md · parallel.md (여러 기능 동시에) · testing.md · setup.md · review-prompt.md · templates/
agents/                explorer (haiku) · tester (sonnet) · reviewer (opus)
hooks/hooks.json       git · gh · DB · 배포 명령에만 걸리는 PreToolUse 훅
scripts/               han.mjs (start · check · run · status · stop · worktree · stamp) · parallel.mjs (작업 폴더 · 마이그레이션 시각) · guard.mjs (훅) · lib.mjs
```

실행 상태와 검사 결과는 `.git/han-pipeline/` 에 두므로 저장소 파일이 늘지 않습니다.
