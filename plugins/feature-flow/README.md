# feature-flow

기능 하나를 **계획 → 구현 → 리뷰 → 머지** 까지 매번 같은 순서로 진행하는 스킬입니다.
에이전트 하나가 처음부터 끝까지 맡습니다 (여러 기능을 동시에 돌리려면 `dev-pipeline` 을 씁니다).

## 흐름

```text
1  develop 에서 feature/<이름> 브랜치
2  계획서 · 체크리스트 (docs/plans/YYYY-MM-DD-<이름>/) → 첫 커밋
3  체크리스트대로 구현, 항목마다 [x]
4  성격별 커밋 (feat / fix / style / refactor / chore / docs), 커밋마다 검증 통과
5  최신 develop 반영 → push → develop 대상 PR
6  전수 리뷰 1번: Codex + Claude 를 동시에 따로, PR 전체를 한 번에
7  GitHub PR Review 로 게시 (판단 표 + 인라인 코멘트)
8  맞는 지적을 한 번에 수정
9  확인 리뷰 1번 (Codex): 고쳐졌는지 · 새로 깨진 것만
10 develop 머지 (merge commit)
11 develop → main PR 생성 · 갱신
12 멈추고 보고 — main 머지는 사람이
```

## 설치

```bash
claude plugin marketplace add HiSoo38/claude-toolkit
claude plugin install feature-flow@claude-toolkit
```

## 사용

```text
/feature-flow:ship-feature 할 일 달력 보기
```

또는 대화에서 "다음 기능 진행해줘", "기능 작업 올려줘" 라고 하면 스킬이 불립니다.
스킬을 부른 것 자체가 git · gh 작업 지시로 취급됩니다. `main` 머지는 하지 않습니다.

## 프로젝트별 설정

프로젝트 `CLAUDE.md` 에 아래 절을 두면 그 값을 씁니다. 없으면 기본값으로 동작합니다.

```markdown
## 작업 흐름 설정

- 통합 브랜치: develop
- 배포 브랜치: main
- 계획서 위치: docs/plans
- 검증: npx tsc --noEmit · npx eslint <바꾼 파일>
- develop 머지: 자동        # 자동 | 사람
```

| 항목 | 기본값 |
| --- | --- |
| 통합 브랜치 | 원격에 `develop` 이 있으면 `develop`, 없으면 기본 브랜치 |
| 배포 브랜치 | 저장소 기본 브랜치 |
| 검증 | `tsconfig.json` → `npx tsc --noEmit`, eslint 설정 → 바꾼 파일만 `npx eslint`. 전체 빌드는 쓰지 않음 |
| develop 머지 | 내 계정 저장소면 `자동`, 조직 · 남의 저장소면 `사람` (확인 리뷰까지 하고 멈춤) |

프로젝트 `CLAUDE.md` 에 같은 주제의 규칙이 따로 있으면 프로젝트 규칙이 이깁니다.

## 필요한 것

- [GitHub CLI](https://cli.github.com/) (`gh auth login` 완료)
- [Codex CLI](https://github.com/openai/codex) (권장. 없거나 사용 한도에 걸리면 그 자리를 Claude 리뷰어가 대신합니다)

환경변수 · 비밀값은 필요 없습니다.

## 파일

```text
skills/ship-feature/
├── SKILL.md            12단계 절차 · 민감 정보 검사 · 함정
├── review-prompt.md    전수 · 확인 리뷰 지시문
└── templates/
    ├── plan.md         계획서 형식
    └── checklist.md    체크리스트 형식
```
