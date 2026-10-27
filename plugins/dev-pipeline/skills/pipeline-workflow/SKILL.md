---
name: pipeline-workflow
description: dev-pipeline 의 진행 규칙 (계약 문서 우선, 작업 하나 = worktree 하나 = 에이전트 하나, 구현·리뷰 분리, 완료 조건). 이 프로젝트에서 기능 구현을 시작하거나 작업을 나누거나 계약 문서(docs/requirements, 스키마, api-spec)를 바꾸려 할 때, 또는 병렬 에이전트 개발 순서를 물을 때 사용한다.
---

# dev-pipeline 진행 규칙

여러 에이전트가 동시에 일해도 요구사항·DB·코드가 어긋나지 않게 하는 규칙이다. 기준 문서는 프로젝트 `CLAUDE.md` ("기술 스택", "계약 문서" 섹션)와 `docs/` 계약 문서다. CLAUDE.md 에 "기술 스택" 섹션이 없거나 비어 있으면 먼저 `/dev-pipeline:init-pipeline` 실행을 안내한다.

## 흐름

```text
/init-pipeline → planner(requirements) → db-designer(schema) → api-designer(api-spec)
  → 사람 승인(계약 확정) → /plan-tasks (docs/tasks/ 작업 카드) → /review-plan (계획 리뷰 관문) → 커밋
  → /run-wave: 웨이브의 작업마다 Orca worktree + Claude 를 동시에 띄움
       각 worktree: /work-task = implementer 구현·테스트 → /review-diff → 블로커 수정 → Orca 카드 in-review
  → /wave-status 로 확인 → 사람 검수 · 커밋 · 머지(또는 PR) → 다음 웨이브 /run-wave
```

## 규칙

1. **계약 먼저.** requirements → schema → api-spec 이 확정(상태 "확정", 미정 사항 0)되기 전에는 기능 구현을 시작하지 않는다. 프로젝트 세팅(빌드 설정, 디렉터리 골격)과 공통 모듈은 병렬로 해도 된다.
2. **작업 하나 = worktree 하나 = 에이전트 하나.** 동시에 2~3개를 권장한다. 그보다 많으면 사람이 검수하기 어렵다.
3. **파일 범위가 겹치면 분할을 다시 한다.** 같은 파일을 두 작업이 건드리면 머지 충돌과 계약 불일치가 생긴다. 공유 파일은 별도 공통 작업으로 떼어 먼저 끝낸다.
4. **구현과 리뷰는 다른 에이전트가 한다.** implementer 가 쓴 코드는 `/dev-pipeline:review-diff` 로 읽기 전용 리뷰어가 본다. 리뷰어는 Claude(reviewer 에이전트), Codex, 둘 다 중에서 고르며 기본값은 CLAUDE.md "파이프라인 설정" 섹션에 있다. GitHub PR 에서는 `@codex review` 로 같은 기준(AGENTS.md "Review guidelines")의 리뷰를 받을 수 있다.
5. **계약 변경은 사람 승인 후에만.** 구현 중 계약 문제를 발견하면 implementer 는 멈추고 보고한다. 사람이 승인하면 해당 문서 담당 에이전트(planner / db-designer / api-designer)가 고치고, 영향받는 작업을 다시 확인한다.
6. **완료 조건**: 빌드 성공 + 테스트 통과 + 리뷰 블로커 0. 셋 중 하나라도 아니면 완료가 아니다.
7. **띄우기 · 커밋은 자동, push 는 묻고, 머지는 사람.** `/run-wave` 가 Orca CLI 로 worktree 와 Claude 를 띄우고, 각 worktree 는 `/work-task` 로 리뷰 통과까지 간 뒤 **사용자의 커밋 규칙대로** 작업 브랜치에 커밋한다 (설정 `작업 브랜치 커밋`). push 는 항상 사용자에게 묻는다. 머지 · PR 은 사람이 검수한 뒤 한다. 다음 웨이브는 앞 웨이브가 머지된 뒤에 띄운다.
8. **리뷰 관문은 두 번.** 구현 전에 `/review-plan` 이 계획(계약 문서 + 작업 카드)이 목적에 맞게 짜였는지 보고, 통과해야 `/run-wave` 가 작업을 띄운다 (통과 뒤 문서가 바뀌면 다시 리뷰). 구현 후에는 `/review-diff` 가 작업 카드대로 됐는지, 이 변경이 다른 기능에 주는 영향, 에러 시나리오까지 보고, 블로커 0 이어야 사람에게 올라간다.

## 역할과 권한

| 에이전트 | 입력 | 출력 | 쓸 수 있는 곳 |
| --- | --- | --- | --- |
| `dev-pipeline:planner` | 사용자 요구 | `docs/requirements.md` | `docs/` 만 |
| `dev-pipeline:db-designer` | requirements | `docs/` 스키마 파일 | `docs/` 만 |
| `dev-pipeline:api-designer` | requirements + 스키마 | `docs/api-spec.md` | `docs/` 만 |
| `dev-pipeline:implementer` | 할당 작업 + 계약 문서 | 코드 + 테스트 | 할당 범위 (docs/ 제외) |
| `dev-pipeline:plan-reviewer` 또는 Codex | 계약 문서 + 작업 카드 | 계획 리뷰 (블로커/권장/사소함 + 추적표) | 없음 (읽기 전용) |
| `dev-pipeline:reviewer` 또는 Codex | 변경 + 작업 카드 + 계약 문서 | 코드 리뷰 (계획 대조 · 영향 분석 · 에러 시나리오 포함) | 없음 (읽기 전용) |

쓰기 위치 제한은 에이전트 도구 목록과 플러그인 훅(`hooks/guard_paths.py`)이 강제한다.

## 이 규칙을 적용할 때

- 사용자가 계약 확정 전에 기능 구현을 요청하면 → 규칙 1을 알리고, 계약 단계부터 할지 세팅·공통 모듈만 먼저 할지 묻는다.
- 한 에이전트에게 여러 기능을 한꺼번에 시키려 하면 → `/dev-pipeline:plan-tasks` 로 나눈 뒤 `/dev-pipeline:run-wave` 로 동시에 띄우기를 제안한다.
- 구현 중 계약 문서를 고치려 하면 → 규칙 5대로 멈추고 변경 제안만 정리한다.
