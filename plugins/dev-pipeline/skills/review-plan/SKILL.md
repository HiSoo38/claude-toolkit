---
name: review-plan
description: 구현 전에 계획(계약 문서와 docs/tasks/ 의 계획서 · 구현 체크리스트 · 작업 카드)이 목적에 맞게 짜였는지, 체크리스트대로 하면 구현이 끝나는지 리뷰한다. 리뷰어는 Claude(plan-reviewer 에이전트), Codex, 둘 다 중에서 고른다. 결과와 검사한 문서의 지문을 docs/tasks/plan-review.md 에 남기며, /run-wave 는 이 리뷰가 통과하고 그 뒤 문서가 바뀌지 않았을 때만 작업을 띄운다. /plan-tasks 가 끝에 자동으로 실행하며, 계획을 고친 뒤 직접 다시 실행한다.
argument-hint: "[claude|codex|both] [--allow-draft]"
allowed-tools: Bash(printf *) Bash(mkdir *) Bash(codex --version*) Bash(codex login status*) Bash(codex exec *) Bash(git hash-object *) Bash(git rev-parse *) Read Glob Grep Write
---

# /review-plan — 구현 전 계획 리뷰

인자: `$ARGUMENTS`

## 0단계 — 준비

1. 리뷰어: 인자의 `claude` / `codex` / `both`, 없으면 CLAUDE.md "파이프라인 설정" 의 `리뷰어`, 없으면 `both`. Codex 확인과 쓸 수 없을 때의 처리는 `/dev-pipeline:review-diff` 0단계와 같다 (`codex --version`, `codex login status`; `both` 면 Claude 만으로 진행하고 알림).
2. 대상 파일: CLAUDE.md "계약 문서" 표의 세 문서, `docs/tasks/plan.md`(계획서), `docs/tasks/checklist.md`(구현 체크리스트), 모든 카드 `docs/tasks/T*.md`. 계약 문서가 없으면 멈추고 planner → db-designer → api-designer 순서를 안내한다. 계획서·체크리스트·카드가 없으면 계약 문서만 리뷰한다고 알린다.
3. 인자에 `--allow-draft` 가 있으면 "초안 진행 승인" 을 두 리뷰어에게 넘긴다. 없으면 계약 문서가 초안이거나 미정 사항이 남은 것은 블로커가 된다.

## 1단계 — 리뷰 실행

`both` 면 두 리뷰를 동시에 실행한다.

**Claude**: Agent 도구로 `dev-pipeline:plan-reviewer` 를 호출한다. 프롬프트에 대상 파일 목록과 (승인받았으면) "초안 진행 승인" 을 넣는다.

**Codex**: Bash 도구 timeout 600000 으로 실행한다.

```bash
codex exec -s read-only --ephemeral "<승인받았으면: 초안 진행 승인.> 계획 리뷰 지시문 ${CLAUDE_PLUGIN_ROOT}/skills/review-plan/codex-plan-review-prompt.md 파일을 읽고 그 지시대로 이 저장소의 계획을 리뷰하라." 2>/dev/null
```

실패 처리는 `/dev-pipeline:review-diff` 2단계와 같다.

**진행 로그**: Codex 를 실행하기 직전과 끝난 뒤에 진행 로그 `<공용 git 폴더>/dev-pipeline/progress.log` (`git rev-parse --path-format=absolute --git-common-dir`)에 한 줄씩 남긴다 — `printf '%s\n' "<YYYY-MM-DD HH:MM>  [<브랜치>]  codex 계획 리뷰 시작" >> <로그>` 와 `... codex 계획 리뷰 끝 — 블로커 <n>"`. Claude 에이전트의 시작·끝은 플러그인 훅이 자동으로 남긴다.

## 2단계 — 결과 합치기

`/dev-pipeline:review-diff` 3단계와 같은 규칙으로 합친다: 같은 문제는 `[둘 다]`, 한쪽만은 `[Claude]` / `[Codex]`, 등급이 다르면 높은 쪽. 추적표는 두 결과 중 더 자세한 쪽을 쓰고, 한쪽만 빈칸으로 본 칸은 "확인 필요" 로 표시한다.

## 3단계 — 기록

`docs/tasks/plan-review.md` 를 Write 한다 (있으면 덮어쓴다). `docs/tasks/` 가 없으면 만든다.

```markdown
# 계획 리뷰

- 판정: 통과 (블로커 0) | 수정 필요 (블로커 n)
- 리뷰어: Claude + Codex | Claude | Codex
- 초안 진행 승인: 예 | 아니오

## 검사한 문서

`/run-wave` 가 이 지문으로 리뷰 뒤 문서가 바뀌었는지 확인한다. 문서를 고치면 `/dev-pipeline:review-plan` 을 다시 실행한다.

| 파일 | 지문 (git hash-object) |
| --- | --- |
| docs/requirements.md | <해시> |

<합친 리뷰 결과 전문: 블로커 · 권장 · 사소함 · 추적표 · 리뷰어별 요약>

## 사람 판단

블로커를 고치지 않고 넘기려면 사람이 아래에 번호와 이유를 적는다. `/run-wave` 는 여기 적힌 블로커를 해결된 것으로 본다.

| 블로커 | 판단 | 이유 |
| --- | --- | --- |
```

블로커는 1번부터 번호를 붙인다. 다시 실행해 이 파일을 덮어쓸 때, 기존 "사람 판단" 표에 있던 행 중 **같은 문제가 이번에도 블로커로 나온 것**은 새 번호로 고쳐 옮기고, 이번에 안 나온 것은 지운다.

지문은 파일마다 `git hash-object <파일>` 로 구한다. `plan-review.md` 자신은 표에 넣지 않는다.

## 4단계 — 보고

- 판정과 블로커 목록. 블로커마다 고칠 곳(planner / db-designer / api-designer 에게 무엇을 고치라고 할지, 또는 `/plan-tasks` 다시 실행).
- 통과면: "`docs/` 를 커밋한 뒤 `/dev-pipeline:run-wave`".
- 수정 필요면: "고친 뒤 `/dev-pipeline:review-plan` 다시 실행. 고치지 않고 넘길 블로커는 `plan-review.md` 의 '사람 판단' 표에 번호 · '기각' · 이유를 적으면 됩니다. 그 전에는 `/run-wave` 가 작업을 띄우지 않습니다."

이 커맨드는 계약 문서와 카드를 고치지 않는다 (`plan-review.md` 만 쓴다).
