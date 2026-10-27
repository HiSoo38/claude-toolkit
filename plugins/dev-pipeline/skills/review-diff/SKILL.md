---
name: review-diff
description: 현재 브랜치와 기준 브랜치(기본 main)의 diff 를 dev-pipeline:reviewer 에이전트에 넘겨 리뷰를 받는다. 결과는 블로커/권장/사소함으로 정리된다.
argument-hint: "[기준 브랜치 (기본 main)]"
disable-model-invocation: true
allowed-tools: Bash(git rev-parse *) Bash(git branch *) Bash(git status *) Bash(git merge-base *) Bash(git diff *) Bash(git log *) Read Glob Grep
---

# /review-diff — 별도 에이전트 리뷰

기준 브랜치: `$ARGUMENTS` 가 비어 있으면 `main`. `main` 이 없으면 `master`, 그것도 없으면 사용자에게 묻는다.

## 1단계 — diff 수집

아래 git 명령은 읽기 전용이다. 상태를 바꾸는 git 명령은 실행하지 않는다.

1. `git rev-parse --abbrev-ref HEAD` 로 현재 브랜치를 확인한다. 현재 브랜치가 기준 브랜치와 같으면 알리고 멈춘다.
2. `git status --short` 로 커밋 안 된 변경이 있는지 본다. 있으면 "커밋된 변경만 리뷰합니다. 작업 중 변경도 포함할까요?" 를 묻는다 (포함하면 아래 diff 에 `git diff HEAD` 결과도 덧붙인다).
3. `git diff --stat <기준>...HEAD` 로 바뀐 파일 목록을, `git diff <기준>...HEAD` 로 전체 diff 를 얻는다. `git log --oneline <기준>..HEAD` 로 커밋 목록도 얻는다.
4. diff 가 비어 있으면 알리고 멈춘다.

## 2단계 — reviewer 에게 넘기기

Agent 도구로 `dev-pipeline:reviewer` 서브에이전트를 호출한다. 프롬프트에 다음을 넣는다:

- 현재 브랜치, 기준 브랜치, 커밋 목록
- 바뀐 파일 목록 (`--stat`)
- 전체 diff
- 이 브랜치의 작업 범위·완료 조건을 알면 함께 (브랜치명의 `t<번호>` 로 `/plan-tasks` 결과나 이슈를 찾을 수 있으면)

diff 가 매우 크면(대략 3,000줄 이상) 디렉터리·모듈 단위로 나눠 reviewer 를 여러 번 호출하고, 매 호출에 전체 파일 목록은 함께 준다.

## 3단계 — 결과 정리

reviewer 결과를 그대로 전달하되, 여러 번 호출했으면 하나로 합친다:

```markdown
## 리뷰 결과: <브랜치> → <기준>
판정: 통과 (블로커 0) | 수정 필요 (블로커 n)

### 블로커
### 권장
### 사소함
```

이 커맨드는 코드를 고치지 않는다. 블로커 수정은 implementer 에이전트가 같은 worktree 에서 한다.
