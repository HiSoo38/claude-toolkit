---
name: review-diff
description: 현재 브랜치와 기준 브랜치(기본 main)의 변경을 리뷰어에게 넘겨 리뷰를 받는다. 리뷰어는 Claude(dev-pipeline:reviewer 에이전트), Codex(Codex CLI), 둘 다 중에서 고른다. 결과는 블로커/권장/사소함으로 정리된다. 사용자가 직접 실행하거나 /dev-pipeline:work-task 가 구현 뒤에 실행한다.
argument-hint: "[claude|codex|both] [--uncommitted] [--allow-draft] [기준 브랜치]"
allowed-tools: Bash(printf *) Bash(mkdir *) Bash(git rev-parse *) Bash(git branch *) Bash(git status *) Bash(git merge-base *) Bash(git diff *) Bash(git log *) Bash(codex --version*) Bash(codex login status*) Bash(codex exec *) Read Glob Grep
---

# /review-diff — 별도 에이전트 리뷰

인자: `$ARGUMENTS`

## 0단계 — 리뷰어와 기준 브랜치 정하기

**리뷰어**는 아래 순서로 정한다.

1. 인자에 `claude`, `codex`, `both` 중 하나가 있으면 그것.
2. 아니면 프로젝트 `CLAUDE.md` 의 "파이프라인 설정" 섹션 `리뷰어` 값.
3. 둘 다 없으면 `both`.

**작업 중 변경**: 인자에 `--uncommitted` 가 있으면 커밋 안 된 변경을 묻지 않고 리뷰에 포함한다.

**기준 브랜치**: 인자에서 리뷰어 단어와 `--uncommitted`, `--allow-draft` 를 뺀 나머지. 비어 있으면 "파이프라인 설정" 의 `기준 브랜치`, 그것도 없으면 `main`, `main` 이 없으면 `master`, 그것도 없으면 사용자에게 묻는다.

**작업 카드**: 호출한 쪽(예: `/work-task`)이 작업 카드를 알려 주면 그것을, 아니면 브랜치명 `t<번호>-...` 로 `docs/tasks/T<번호>.md` 를 찾는다. 카드가 있으면 경로를 Claude·Codex 리뷰 모두에 넘긴다 — 리뷰어는 체크리스트 항목·카드 완료 조건과 코드를 대조(계획 일치)하고, 담당 파일 범위로 범위 밖 변경을 본다.

**초안 진행 승인**: 인자에 `--allow-draft` 가 있으면 "계약 문서가 초안인 상태로 진행하는 것은 사람이 승인했다. 계약 미확정 자체는 블로커로 보지 말고, 초안에 적힌 내용(미정 사항은 기본안)과의 일치 여부를 본다" 를 Claude·Codex 리뷰 모두에 넘긴다.

리뷰어에 `codex` 가 들어가면(`codex` 또는 `both`) Codex CLI 를 확인한다.

- `codex --version` 이 실패하면 설치되지 않은 것이다.
- `codex login status` 가 로그인 상태가 아니면 로그인이 필요하다.

확인에 실패했을 때:

- `both` 이면: "Codex 를 쓸 수 없어 Claude 리뷰만 합니다" 라고 이유(미설치 / 미로그인)와 함께 알리고 Claude 만 진행한다.
- `codex` 이면: 멈추고 해결 방법을 알린다 (설치: `npm install -g @openai/codex`, 로그인: `codex login`). Claude 리뷰로 대신할지 묻는다.

## 1단계 — 변경 확인

아래 git 명령은 읽기 전용이다. 상태를 바꾸는 git 명령은 실행하지 않는다.

1. `git rev-parse --abbrev-ref HEAD` 로 현재 브랜치를 확인한다. 기준 브랜치와 같으면 알리고 멈춘다.
2. `git status --short` 로 커밋 안 된 변경이 있는지 본다. 있고 `--uncommitted` 가 없으면 "커밋된 변경만 리뷰합니다. 작업 중 변경도 포함할까요?" 를 묻는다 (비대화형이면 포함한다).
3. `git log --oneline <기준>..HEAD` 로 커밋 목록을, `git diff --stat <기준>...HEAD` 로 바뀐 파일 목록을 얻는다. 비어 있으면(작업 중 변경도 포함하지 않으면) 알리고 멈춘다.
4. 이 브랜치의 작업 범위·완료 조건을 알 수 있으면 찾아 둔다 (브랜치명의 `t<번호>` 로 `/plan-tasks` 결과나 이슈).

## 2단계 — 리뷰 실행

`both` 이면 Claude 와 Codex 를 **동시에** 실행한다 (Codex 명령을 백그라운드로 띄우고 Claude 에이전트를 호출한다).

### Claude 리뷰

`git diff <기준>...HEAD` 로 전체 diff 를 얻고 (작업 중 변경 포함이면 `git diff HEAD` 와, `git status --short` 의 `??` 새 파일 내용도 덧붙인다 — 새 파일은 diff 에 나오지 않는다), Agent 도구로 `dev-pipeline:reviewer` 서브에이전트를 호출한다. 프롬프트에 넣는 것:

- 현재 브랜치, 기준 브랜치, 커밋 목록
- 바뀐 파일 목록 (`--stat`)
- 전체 diff
- 작업 카드 경로 (찾았으면) — 계획 일치·영향 분석·에러 시나리오를 보라고 함께 지시한다
- 초안 진행 승인 (인자에 있으면)

diff 가 매우 크면(대략 3,000줄 이상) 디렉터리·모듈 단위로 나눠 reviewer 를 여러 번 호출하고, 매 호출에 전체 파일 목록은 함께 준다.

### Codex 리뷰

리뷰 지시문은 `${CLAUDE_PLUGIN_ROOT}/skills/review-diff/codex-review-prompt.md` 에 있다. Codex 가 그 파일을 직접 읽게 한 줄짜리 명령으로 실행한다. Bash 도구의 timeout 은 600000(10분)으로 준다.

```bash
codex exec -s read-only --ephemeral "기준 브랜치는 <기준> 이다. <작업 중 변경 포함이면: 작업 중 변경 포함.> <카드가 있으면: 작업 카드는 <카드 경로> 이다.> <승인받았으면: 초안 진행 승인.> 리뷰 지시문 ${CLAUDE_PLUGIN_ROOT}/skills/review-diff/codex-review-prompt.md 파일을 읽고 그 지시대로 이 저장소의 현재 브랜치를 리뷰하라." 2>/dev/null
```

**진행 로그**: Codex 를 실행하기 직전과 끝난 뒤에 진행 로그 `<공용 git 폴더>/dev-pipeline/progress.log` (`git rev-parse --path-format=absolute --git-common-dir`)에 한 줄씩 남긴다 — `printf '%s\n' "<YYYY-MM-DD HH:MM>  [<브랜치>]  codex 리뷰 시작" >> <로그>` 와 `... codex 리뷰 끝 — 블로커 <n>"`. Claude 에이전트의 시작·끝은 플러그인 훅이 자동으로 남긴다.

- `-s read-only`: Codex 는 파일을 읽기만 하고 수정할 수 없다.
- `--ephemeral`: Codex 세션 기록을 남기지 않는다.
- 표준 출력에는 최종 리뷰만 나오고 진행 로그는 표준 에러로 가므로 `2>/dev/null` 로 버린다.
- 실패하면(종료 코드 ≠ 0, 또는 출력이 비었거나 "## 리뷰 결과" 가 없으면) `codex login status` 로 원인을 확인해 알린다. `both` 이면 Claude 결과만으로 3단계를 진행하고 Codex 실패를 함께 알린다.

## 3단계 — 결과 정리

리뷰어가 하나면 그 결과를 그대로 전달한다 (Claude 를 여러 번 호출했으면 하나로 합친다).

`both` 이면 두 결과를 하나로 합친다.

- 같은 위치·같은 문제는 한 항목으로 합치고 `[둘 다]` 를 붙인다. 한쪽만 지적한 항목은 `[Claude]` 또는 `[Codex]` 를 붙인다.
- 같은 문제를 두 리뷰어가 다른 등급으로 분류했으면 높은 쪽(블로커 > 권장 > 사소함)에 두고 "(Codex: 권장)" 처럼 다른 쪽 판정을 적는다.
- 판정의 블로커 수는 합친 뒤의 블로커 항목 수다.
- 한쪽만 블로커로 본 항목은 맨 위에 두어 사람이 먼저 판단하게 한다.

```markdown
## 리뷰 결과: <브랜치> → <기준>
리뷰어: Claude + Codex | Claude | Codex
판정: 통과 (블로커 0) | 수정 필요 (블로커 n)

### 블로커
1. [둘 다] `경로:줄` — 문제. 근거. 고치는 방향.

### 권장
### 사소함

### 리뷰어별 요약
- Claude: 블로커 n · 권장 n · 사소함 n
- Codex: 블로커 n · 권장 n · 사소함 n
```

이 커맨드는 코드를 고치지 않는다. 블로커 수정은 implementer 에이전트가 같은 worktree 에서 한다.
