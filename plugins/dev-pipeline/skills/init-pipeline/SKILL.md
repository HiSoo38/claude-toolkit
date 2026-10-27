---
name: init-pipeline
description: 프로젝트의 기술 스택을 감지(또는 사용자에게 선택받아)하고 dev-pipeline 템플릿(CLAUDE.md, AGENTS.md, docs/ 계약 문서)을 프로젝트에 설치한다. 파이프라인을 처음 쓰는 프로젝트, 또는 CLAUDE.md 에 "기술 스택" 섹션이 없을 때 실행한다.
argument-hint: "[프로젝트 경로 (생략 시 현재 디렉터리)]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Write Edit
---

# /init-pipeline — 스택 감지와 템플릿 설치

대상 디렉터리: `$ARGUMENTS` 가 비어 있으면 현재 작업 디렉터리. 아래에서 "프로젝트" 는 이 디렉터리를 말한다.

참고 파일 (이 플러그인 안):

- 감지 규칙·선택지: `${CLAUDE_PLUGIN_ROOT}/skills/init-pipeline/stack-catalog.md`
- 템플릿: `${CLAUDE_PLUGIN_ROOT}/templates/`

특정 언어·프레임워크·DB 를 미리 가정하지 않는다. 판단은 항상 stack-catalog.md 와 프로젝트의 실제 파일로 한다.

## 0단계 — 플러그인 파일 먼저 읽기

**가장 먼저** stack-catalog.md 와 `templates/` 의 파일 6개(`CLAUDE.md`, `AGENTS.md`, `requirements.md`, `schema.sql`, `schema.md`, `api-spec.md`)를 모두 Read 로 읽어 둔다. 이 스킬의 읽기 허용(`allowed-tools`)은 스킬을 실행한 턴에만 유효해서, 사용자 확인을 받은 뒤의 턴에서는 플러그인 폴더를 읽을 때 권한 확인이 뜨기 때문이다. 이후 단계에서 템플릿 내용은 여기서 읽은 것을 그대로 쓴다.

## 1단계 — 스택 감지

1. 카탈로그 1절의 근거 파일을 프로젝트에서 Glob 으로 찾는다 (루트와 2단계 하위까지, `node_modules`·`build`·`dist`·`.git`·`target`·`.venv` 제외).
2. 찾은 파일을 Read 로 읽고, 카탈로그 2절로 언어·프레임워크·빌드 도구·DB·테스트 도구를 판단한다.
   - `.env` 처럼 비밀값이 들어갈 수 있는 파일은 읽지 않는다. `.env.example` 등 예시 파일만 읽는다.
   - 근거가 서로 충돌하면(예: 두 종류의 DB 드라이버) 둘 다 적고 사용자에게 고르게 한다.
3. 빌드·테스트 명령: 프로젝트에 정의된 스크립트를 우선하고, 없으면 카탈로그 4절 후보를 쓴다.
4. 패키지 구조: 소스 루트를 Glob 으로 훑어 주요 디렉터리 3~8개와 역할을 추정한다.

결과를 이 표로 보여준다:

| 항목 | 감지 값 | 근거 파일 (어떤 줄/키) |
| --- | --- | --- |
| 언어 | | |
| 프레임워크 | | |
| 빌드 도구 | | |
| DB | | |
| 테스트 도구 | | |
| 스키마 파일 형식 | (카탈로그 3절로 결정) | |

그리고 **AskUserQuestion** 으로 "이 감지 결과가 맞나요?" 를 묻는다 (선택지: 맞음 / 일부 수정 / 처음부터 직접 선택). 고칠 항목이 있으면 2단계 방식으로 그 항목만 다시 묻는다.

## 2단계 — 감지 실패 또는 빈 프로젝트

근거 파일이 하나도 없거나 언어조차 판단할 수 없으면, 카탈로그 5절의 후보로 **AskUserQuestion** 을 써서 아래를 차례로 묻는다. 각 질문은 선택지 최대 4개이며, 목록에 없는 값은 사용자가 "기타" 로 직접 입력한다.

1. 언어
2. 프레임워크 (1번 답에 맞는 후보)
3. DB (없음 포함)
4. 빌드 도구 (1번 답에 맞는 후보)

질문 2~4는 언어가 정해진 뒤 한 번의 AskUserQuestion 호출(질문 여러 개)로 묻는다. 테스트 도구는 카탈로그의 언어별 첫 후보로 기본값을 잡고 확인 표에서 함께 보여준다.

AskUserQuestion 을 쓸 수 없는 환경(비대화형 실행 등)이면, 위 질문과 선택지를 번호 목록으로 출력하고 **파일을 쓰지 말고 멈춘다.** 사용자가 답하면 이어서 진행한다.

## 3단계 — 템플릿 복사

| 템플릿 | 복사 위치 |
| --- | --- |
| `templates/CLAUDE.md` | 프로젝트 루트 `CLAUDE.md` |
| `templates/AGENTS.md` | 프로젝트 루트 `AGENTS.md` |
| `templates/requirements.md` | `docs/requirements.md` |
| `templates/schema.sql` 또는 `templates/schema.md` (카탈로그 3절) | `docs/schema.sql` 또는 `docs/schema.md` |
| `templates/api-spec.md` | `docs/api-spec.md` |

- 템플릿은 Read 로 읽어 Write 로 쓴다.
- **대상 파일이 이미 있으면 덮어쓰지 않는다.** 먼저 기존 파일을 읽고, 파일마다 AskUserQuestion 으로 묻는다: 건너뛰기 / 빠진 섹션만 추가 / 덮어쓰기. "빠진 섹션만 추가" 는 기존 내용을 그대로 두고 템플릿에만 있는 `##` 섹션을 Edit 으로 끝에 붙인다.
- 기존 CLAUDE.md 에 "기술 스택" 섹션이 이미 있고 값이 채워져 있으면, 그 값과 감지 결과가 다른 항목만 표로 보여주고 어느 쪽을 쓸지 묻는다.

## 4단계 — CLAUDE.md 채우기

프로젝트 CLAUDE.md 에 확정 값을 Edit 으로 기록한다.

- "기술 스택" 표: 각 칸에 값과 근거 파일. 사용자가 직접 고른 값은 근거에 "사용자 선택".
- "빌드·테스트 명령" 표: 감지한 명령. 확실하지 않은 칸은 `<!-- TODO -->` 를 그대로 둔다.
- "패키지 구조": 감지한 디렉터리. 빈 프로젝트면 선택한 프레임워크의 관례 구조를 `<!-- TODO: 관례 구조, 실제 생성 후 확인 -->` 표시와 함께 적는다.
- "계약 문서" 표의 스키마 경로: 3단계에서 정한 파일 경로. DB 가 없으면 "해당 없음".
- 모르는 칸은 추측해서 채우지 말고 `<!-- TODO -->` 로 남긴다.

## 5단계 — 결과 보고

- 만든 파일 / 건너뛴 파일 / 섹션만 추가한 파일 목록
- 남은 `<!-- TODO -->` 위치
- 다음 단계 안내: "planner 에이전트에게 요구사항을 설명해 `docs/requirements.md` 를 채우세요" → db-designer → api-designer → `/dev-pipeline:plan-tasks`

## 하지 않는 것

- 소스 코드, 빌드 파일, 의존성 파일을 만들거나 고치지 않는다 (프레임워크 프로젝트 생성은 사용자 몫).
- git 명령(add, commit 등)을 실행하지 않는다.
