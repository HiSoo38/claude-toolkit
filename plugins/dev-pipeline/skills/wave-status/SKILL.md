---
name: wave-status
description: docs/tasks/ 의 작업들이 지금 어디까지 왔는지 한 표로 보여준다. 작업마다 웨이브, 브랜치, Orca 카드 상태·코멘트(구현 중 / 리뷰 통과 / 중단 / 블로커 남음), 머지 여부를 모으고 사람이 할 일과 다음 웨이브를 띄울 수 있는지 알려 준다.
argument-hint: ""
allowed-tools: Bash(tail *) Bash(orca status*) Bash(orca worktree list *) Bash(git worktree list*) Bash(git rev-parse *) Bash(git branch *) Bash(git log *) Bash(git reflog *) Bash(git merge-base *) Bash(git -C * status *) Read Glob Grep
---

# /wave-status — 웨이브 진행 상황

기준 브랜치의 메인 체크아웃에서 실행한다. `<루트>` 는 `git rev-parse --show-toplevel` 결과다.

## 1단계 — 모으기

1. `docs/tasks/plan.md` 의 "작업과 웨이브" 표와 각 카드에서 작업 번호, 제목, 웨이브, 의존, 브랜치를 읽는다. 없으면 `/dev-pipeline:plan-tasks` 를 안내하고 멈춘다.
2. CLAUDE.md "파이프라인 설정" 에서 기준 브랜치(없으면 `main`)를 읽는다.
3. 작업마다 머지 여부를 `/dev-pipeline:run-wave` 1단계의 "머지 판정" 과 같은 방법으로 정한다. `git branch --merged` 만 보면 커밋이 없는 작업 브랜치가 머지됨으로 잘못 나온다: 생성 커밋(`git reflog show --format=%H <브랜치>` 마지막 줄)과 끝 커밋이 같으면 커밋 없음, 다르고 `git merge-base --is-ancestor <브랜치> <기준>` 이 성공하면 머지됨. 브랜치가 없는데 `git log <기준> --grep "T<번호>"` 에 흔적이 있으면 "머지된 것으로 보임".
4. `orca status` 가 되면 `orca worktree list --repo path:<루트> --json` 으로 worktree 목록을 얻고, 브랜치(`refs/heads/<브랜치>`)로 작업과 맞춘다. 각 worktree 의 `path`, `workspaceStatus`, `comment` 를 쓴다. Orca 가 안 되면 `git worktree list` 로 worktree 경로만 얻고, Orca 카드 상태 없이 정리한 뒤 그 사실을 알린다.
5. worktree 가 있는 작업은 `git -C <worktree 경로> status --short` 로 커밋 안 된 변경 파일 수를 센다.
6. 진행 로그 `<공용 git 폴더>/dev-pipeline/progress.log` (`git rev-parse --path-format=absolute --git-common-dir`) 가 있으면 `tail -n 30` 으로 최근 줄을 읽는다.

## 2단계 — 상태 판정

| 판정 | 조건 |
| --- | --- |
| 머지됨 | 브랜치가 기준 브랜치에 머지됨 |
| 검수 대기 | worktree 상태 `in-review` (리뷰 통과) |
| 사람 확인 필요 | 코멘트가 "중단" 또는 "블로커 … 남음" 으로 시작 |
| 진행 중 | worktree 상태 `in-progress` 이고 위에 해당하지 않음 |
| 대기 | worktree 도 없고 머지도 안 됨 |

## 3단계 — 출력

```markdown
## 작업 진행 상황 (기준: <기준>)

| 작업 | 제목 | 웨이브 | 상태 | Orca 코멘트 | 변경 파일 | 브랜치 |
| --- | --- | --- | --- | --- | --- | --- |

### 최근 진행 (진행 로그)
<작업마다 마지막 2~3줄, 시각 순. 로그가 없으면 생략>

실시간으로 보려면: `tail -f "<공용 git 폴더>/dev-pipeline/progress.log"` · Orca 앱 왼쪽 목록 → `<레포>` → 작업 이름

### 사람이 할 일
- 검수 대기: T2 — `<worktree 경로>` 에서 변경 확인 → 커밋 → 머지 또는 PR
- 사람 확인 필요: T3 — <코멘트>. 그 worktree 탭의 마지막 보고를 확인

### 다음 웨이브
- 웨이브 <n>: <작업들> — 의존 작업 <목록> 이 머지되면 `/dev-pipeline:run-wave` 로 시작할 수 있음
  (지금 바로 가능하면 "지금 `/dev-pipeline:run-wave` 를 실행하세요")
```

상태가 하나도 바뀌지 않는 경우(예: 모두 진행 중)는 그렇다고 한 줄로 알린다. 이 커맨드는 아무것도 바꾸지 않는다.
