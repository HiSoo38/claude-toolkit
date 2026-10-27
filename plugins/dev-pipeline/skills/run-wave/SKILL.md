---
name: run-wave
description: docs/tasks/ 의 작업 카드에서 다음 웨이브(의존 작업이 모두 머지된 작업들)를 골라, 작업마다 Orca worktree 를 만들고 Claude 를 띄워 동시에 진행시킨다. 각 Claude 는 /dev-pipeline:work-task 로 구현 → 테스트 → 리뷰 → 블로커 수정까지 하고 Orca 카드 상태로 결과를 알린다.
argument-hint: "[웨이브 번호 | T번호 ...] [--yes] [--allow-draft]"
disable-model-invocation: true
allowed-tools: Bash(orca status*) Bash(orca repo list*) Bash(orca repo show*) Bash(orca worktree list *) Bash(orca worktree create *) Bash(orca worktree set *) Bash(orca terminal switch *) Bash(printf *) Bash(mkdir *) Bash(git rev-parse *) Bash(git status *) Bash(git branch *) Bash(git log *) Bash(git reflog *) Bash(git merge-base *) Bash(git hash-object *) Read Glob Grep
---

# /run-wave — 웨이브 동시 실행

인자: `$ARGUMENTS`

이 커맨드는 **기준 브랜치의 메인 체크아웃**(작업 worktree 가 아닌 원래 레포 폴더)에서 실행한다. 아래에서 `<루트>` 는 `git rev-parse --show-toplevel` 결과(슬래시 경로)다.

## 0단계 — 사전 확인

하나라도 실패하면 이유와 해결 방법을 알리고 멈춘다.

1. `orca status` 의 `runtimeReachable` 이 `true` 인지. 아니면 "Orca 앱을 실행하세요 (`orca open`)".
2. 프로젝트 `CLAUDE.md` 의 "기술 스택" 이 채워져 있는지. 아니면 `/dev-pipeline:init-pipeline` 안내.
3. "파이프라인 설정" 에서 기준 브랜치와 동시 작업 수를 읽는다. 없으면 `docs/tasks/plan.md` 머리말의 값을 쓰고, 거기도 없으면 기준 브랜치 `main`, 동시 작업 수 3.
4. `git rev-parse --abbrev-ref HEAD` 가 기준 브랜치인지.
5. `docs/tasks/plan.md` 와 `docs/tasks/checklist.md` 가 있는지. 없으면 `/dev-pipeline:plan-tasks` 안내.
6. `git status --short -- docs CLAUDE.md AGENTS.md` 가 비어 있는지. 커밋 안 된 변경이 있으면 멈추고 "worktree 는 커밋된 상태에서 만들어져서, 커밋 안 된 계약 문서·작업 카드는 각 작업에 보이지 않습니다. 먼저 커밋하세요" 라고 알린다. 이 커맨드는 커밋하지 않는다.
7. CLAUDE.md "계약 문서" 표의 세 문서가 확정인지: 상태가 "확정" 이고 "미정 사항" 에 체크 안 된 항목이 없어야 한다. 아니면 어느 문서가 왜 미확정인지 알린다.
   - 인자에 `--allow-draft` 가 있거나 `docs/tasks/plan-review.md` 에 "초안 진행 승인: 예" 가 적혀 있으면 경고만 하고 계속한다. 이 승인은 3단계에서 각 작업에 전달된다.
   - 없으면: 대화형이면 "계약이 확정되지 않았습니다. 초안대로 진행할까요?" 를 묻고 (진행 = `--allow-draft` 와 같음), 비대화형이면 멈춘다. 확정 전에 기능 구현을 하면 리뷰어가 이를 블로커로 잡아 작업이 중단되기 때문이다.
8. **계획 리뷰 관문**: `docs/tasks/plan-review.md` 가 있고, 판정이 "통과 (블로커 0)" 이거나 남은 블로커가 모두 "사람 판단" 표에 기각으로 적혀 있고, "검사한 문서" 표의 파일마다 지금의 `git hash-object <파일>` 이 표의 지문과 같고, 표에 없는 카드(`docs/tasks/T*.md`)가 없어야 한다.
   - 파일이 없으면: "구현 전에 계획 리뷰가 필요합니다. `/dev-pipeline:review-plan` 을 실행하세요".
   - 기각되지 않은 블로커가 있으면: 그 블로커를 보여주고 "고친 뒤 `/dev-pipeline:review-plan`, 또는 넘길 거면 `plan-review.md` 의 '사람 판단' 표에 기각과 이유를 적으세요". 기각된 블로커가 있으면 띄울 때 목록과 이유를 함께 보여준다.
   - 지문이 다르거나 새 카드가 있으면: 바뀐 파일 목록을 보여주고 "리뷰 뒤 계획이 바뀌었습니다. `/dev-pipeline:review-plan` 을 다시 실행하세요".
   - 어느 경우든 멈춘다. `--yes` 로 건너뛸 수 없다.
9. `orca repo list --json` 에 `<루트>` 가 등록돼 있는지 (경로는 슬래시·대소문자 무시하고 비교). 없으면 "Orca 에 이 레포를 추가하세요 (`orca repo add --path <루트>`)" 라고 알리고, 사용자가 원하면 그 명령을 대신 실행해도 되는지 묻는다.

## 1단계 — 띄울 작업 고르기

1. `docs/tasks/plan.md` 의 "작업과 웨이브" 표를 읽고, 작업마다 카드(`docs/tasks/T<번호>.md`)의 웨이브·의존·브랜치를 읽는다.
2. 작업마다 상태를 판정한다.
   - **머지됨**: 아래 "머지 판정" 이 참이다.
   - **진행 중**: `orca worktree list --repo path:<루트> --json` 에 그 브랜치(`refs/heads/<브랜치>`)의 worktree 가 있다. 그 worktree 의 `workspaceStatus` 와 `comment` 를 함께 기록한다.
   - **대기**: 둘 다 아니다.
   **머지 판정** — `git branch --merged` 만 보면 안 된다. 커밋이 하나도 없는 작업 브랜치는 끝이 기준 브랜치의 옛 커밋과 같아서 "머지됨" 으로 잘못 나온다.
   1. 브랜치가 있으면: 생성 커밋 `C` = `git reflog show --format=%H <브랜치>` 의 마지막 줄, 끝 커밋 `H` = `git rev-parse <브랜치>`.
      - `H` = `C` 이면 커밋이 없다 → 머지 아님.
      - `H` ≠ `C` 이고 `git merge-base --is-ancestor <브랜치> <기준>` 이 성공하면 → 머지됨.
      - reflog 가 없으면(`C` 를 못 구함) `git log --oneline <기준>..<브랜치>` 가 비어 있고 그 브랜치의 worktree 가 없거나 깨끗할 때만 머지됨으로 본다.
   2. 브랜치가 없거나 위에서 머지 아님인데 `git log --oneline <기준> --grep "T<번호>"` 에 그 작업 커밋이 보이면(GitHub squash 머지 등) "머지된 것으로 보임" 으로 표시하고, 다음 웨이브를 띄우기 전에 사용자에게 맞는지 묻는다 (비대화형이면 머지 아님으로 본다).
3. 띄울 작업:
   - 인자에 `T번호` 가 있으면 그 작업들 (의존 작업이 머지되지 않았으면 경고하고 계속할지 묻는다).
   - 인자에 웨이브 번호가 있으면 그 웨이브의 대기 작업.
   - 인자가 없으면 **대기 작업이 남은 가장 낮은 웨이브**에서, 의존 작업이 모두 머지된 대기 작업.
4. 동시 작업 수 = 설정값 − 진행 중인 작업 수. 띄울 작업이 더 많으면 작업 번호 순으로 그만큼만 띄우고 나머지는 "다음에 띄움" 으로 둔다.
5. 띄울 작업이 없으면 이유를 알리고 멈춘다 (예: "웨이브 2 의 T2·T3 이 진행 중입니다", "T1 이 아직 머지되지 않아 웨이브 2 를 띄울 수 없습니다", "모든 작업이 머지됐습니다").

## 2단계 — 확인

띄울 작업을 표로 보여준다 (작업 · 제목 · 브랜치 · 의존 상태). 인자에 `--yes` 가 있으면 바로 진행한다. 아니면 AskUserQuestion 으로 "이 작업들을 Orca 에서 동시에 시작할까요?" 를 묻는다 (시작 / 취소). 비대화형이고 `--yes` 가 없으면 표만 보여주고 멈춘다.

## 3단계 — 띄우기

작업마다 아래 명령을 실행한다 (작업 간 순서는 상관없다).

```bash
orca worktree create --repo "path:<루트>" --name <브랜치> --no-parent --base-branch <기준> --agent claude --prompt "/dev-pipeline:work-task T<번호>" --json
```

- 0단계에서 초안 진행을 승인받았으면 프롬프트를 `"/dev-pipeline:work-task T<번호> --allow-draft"` 로 한다.
- `--name` 이 곧 브랜치명이 된다 (카드의 브랜치 값을 그대로 쓴다).
- 각 Claude 는 시작하자마자 `/dev-pipeline:work-task T<번호>` 를 실행해 자기 worktree 에서 작업한다.
- 결과 JSON 에서 `ok`, `result.worktree.path`, `result.worktree.branch`, 에이전트 터미널 핸들(`launch.outcome.handle` 또는 결과 안의 `handle`)을 확인한다. 실패한 작업은 `error` 를 기록하고 나머지는 계속 띄운다. 같은 이름의 worktree 가 이미 있다는 오류면 "진행 중" 으로 본다.

## 3.5단계 — 보이게 하기

사람이 지금 무엇이 돌고 있는지 바로 볼 수 있어야 한다. `--agent` 로 띄운 worktree 는 화면 뒤에서 시작되므로:

1. 띄운 작업마다 `orca worktree set --worktree "path:<worktree 경로>" --unread --json` — Orca 왼쪽 목록에 읽지 않음 점이 붙는다.
2. 첫 작업의 에이전트 터미널을 앞으로: `orca terminal switch --terminal <handle> --json`.
3. 진행 로그에 웨이브 시작을 남긴다: `<공용 git 폴더>/dev-pipeline/progress.log` (`git rev-parse --path-format=absolute --git-common-dir`) 에 "<YYYY-MM-DD HH:MM>  [<기준 브랜치>]  웨이브 <n> 시작 — T2, T3" 한 줄 (`mkdir -p` 후 `printf ... >>`).

## 4단계 — 보고

| 작업 | 브랜치 | worktree 경로 | 결과 |
| --- | --- | --- | --- |

그리고 **어디서 보는지**를 맨 먼저 알린다:

- Orca 앱 왼쪽 목록 → `<레포 표시 이름>` → 작업 이름(브랜치명). 각 탭에서 그 작업의 Claude 가 지금 하는 일이 실시간으로 보인다. 첫 작업 탭은 이미 앞에 띄웠다.
- 모든 작업을 한 번에: `/dev-pipeline:wave-status`, 또는 터미널에서 `tail -f "<공용 git 폴더>/dev-pipeline/progress.log"` (경로를 실제 값으로 적어 준다).

- 각 작업은 Orca 카드에서 상태가 바뀐다: **in-progress**(구현·리뷰 중) → **in-review**(리뷰 통과, 사람 검수 대기) 또는 코멘트에 "중단"/"블로커 남음" + 읽지 않음 표시(사람 확인 필요).
- 진행 상황: `/dev-pipeline:wave-status`
- 리뷰를 통과한 작업은 그 worktree 에서 변경을 확인하고 커밋·머지(또는 PR)한다. 각 작업은 커밋하지 않고 변경을 worktree 에 남겨 둔다.
- 이번 웨이브가 모두 머지되면 다시 `/dev-pipeline:run-wave`.

## 하지 않는 것

- 커밋, 머지, push, PR 생성.
- 진행 중인 작업을 기다리거나 감시하지 않는다 (띄우고 끝낸다). 상태 확인은 `/wave-status`.
