---
name: pipeline-workflow
description: dev-pipeline 의 진행 규칙 (계약 문서 우선, 작업 하나 = worktree 하나 = 에이전트 하나, 구현·리뷰 분리, 완료 조건). 이 프로젝트에서 기능 구현을 시작하거나 작업을 나누거나 계약 문서(docs/requirements, 스키마, api-spec)를 바꾸려 할 때, 또는 병렬 에이전트 개발 순서를 물을 때 사용한다.
---

# dev-pipeline 진행 규칙

여러 에이전트가 동시에 일해도 요구사항·DB·코드가 어긋나지 않게 하는 규칙이다. 기준 문서는 프로젝트 `CLAUDE.md` ("기술 스택", "계약 문서" 섹션)와 `docs/` 계약 문서다. CLAUDE.md 에 "기술 스택" 섹션이 없거나 비어 있으면 먼저 `/dev-pipeline:init-pipeline` 실행을 안내한다.

## 흐름

```text
/init-pipeline → planner(requirements) → db-designer(schema) → api-designer(api-spec)
  → 사람 승인(계약 확정) → /plan-tasks → [Orca] 작업별 worktree + implementer 병렬
  → /review-diff (reviewer) → 사람 검수 → 머지
```

## 규칙

1. **계약 먼저.** requirements → schema → api-spec 이 확정(상태 "확정", 미정 사항 0)되기 전에는 기능 구현을 시작하지 않는다. 프로젝트 세팅(빌드 설정, 디렉터리 골격)과 공통 모듈은 병렬로 해도 된다.
2. **작업 하나 = worktree 하나 = 에이전트 하나.** 동시에 2~3개를 권장한다. 그보다 많으면 사람이 검수하기 어렵다.
3. **파일 범위가 겹치면 분할을 다시 한다.** 같은 파일을 두 작업이 건드리면 머지 충돌과 계약 불일치가 생긴다. 공유 파일은 별도 공통 작업으로 떼어 먼저 끝낸다.
4. **구현과 리뷰는 다른 에이전트가 한다.** implementer 가 쓴 코드는 reviewer(읽기 전용)가 `/dev-pipeline:review-diff` 로 본다.
5. **계약 변경은 사람 승인 후에만.** 구현 중 계약 문제를 발견하면 implementer 는 멈추고 보고한다. 사람이 승인하면 해당 문서 담당 에이전트(planner / db-designer / api-designer)가 고치고, 영향받는 작업을 다시 확인한다.
6. **완료 조건**: 빌드 성공 + 테스트 통과 + 리뷰 블로커 0. 셋 중 하나라도 아니면 완료가 아니다.
7. **worktree 생성과 에이전트 실행은 Orca 에서 사용자가 한다.** 이 플러그인은 문서, 작업 분할, 리뷰까지만 맡는다.

## 역할과 권한

| 에이전트 | 입력 | 출력 | 쓸 수 있는 곳 |
| --- | --- | --- | --- |
| `dev-pipeline:planner` | 사용자 요구 | `docs/requirements.md` | `docs/` 만 |
| `dev-pipeline:db-designer` | requirements | `docs/` 스키마 파일 | `docs/` 만 |
| `dev-pipeline:api-designer` | requirements + 스키마 | `docs/api-spec.md` | `docs/` 만 |
| `dev-pipeline:implementer` | 할당 작업 + 계약 문서 | 코드 + 테스트 | 할당 범위 (docs/ 제외) |
| `dev-pipeline:reviewer` | diff + 계약 문서 | 블로커/권장/사소함 | 없음 (읽기 전용) |

쓰기 위치 제한은 에이전트 도구 목록과 플러그인 훅(`hooks/guard_paths.py`)이 강제한다.

## 이 규칙을 적용할 때

- 사용자가 계약 확정 전에 기능 구현을 요청하면 → 규칙 1을 알리고, 계약 단계부터 할지 세팅·공통 모듈만 먼저 할지 묻는다.
- 한 에이전트에게 여러 기능을 한꺼번에 시키려 하면 → `/dev-pipeline:plan-tasks` 로 나누기를 제안한다.
- 구현 중 계약 문서를 고치려 하면 → 규칙 5대로 멈추고 변경 제안만 정리한다.
