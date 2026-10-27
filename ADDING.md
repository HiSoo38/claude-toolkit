# 새 플러그인 추가하기

이 레포에 플러그인을 하나 더하는 절차입니다. 형식은 Claude Code 공식 문서 기준입니다:
[플러그인 매니페스트](https://code.claude.com/docs/en/plugins/manifest-reference.md) ·
[구성 요소](https://code.claude.com/docs/en/plugins/components.md) ·
[마켓플레이스](https://code.claude.com/docs/en/plugins/marketplace-reference.md) ·
[스킬](https://code.claude.com/docs/en/skills) · [서브에이전트](https://code.claude.com/docs/en/sub-agents) ·
[훅](https://code.claude.com/docs/en/hooks) · [MCP](https://code.claude.com/docs/en/mcp)

아래 예시는 `my-plugin` 이라는 이름을 씁니다. 실제 이름으로 바꾸세요.

## 1. 폴더와 plugin.json 만들기

```bash
mkdir -p plugins/my-plugin/.claude-plugin
```

`plugins/my-plugin/.claude-plugin/plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "0.1.0",
  "description": "한 줄 설명",
  "author": { "name": "HiSoo38", "url": "https://github.com/HiSoo38" },
  "repository": "https://github.com/HiSoo38/claude-toolkit",
  "license": "MIT"
}
```

- `name` 은 kebab-case. 모든 구성 요소가 이 이름으로 묶입니다 (`/my-plugin:hello`, `my-plugin:reviewer`).
- `claude-`, `anthropic-` 으로 시작하는 이름은 예약돼 있어 검증에서 실패합니다.
- `.claude-plugin/` 안에는 `plugin.json` 만 둡니다. 나머지 파일은 전부 플러그인 루트에 둡니다.
- `plugins/my-plugin/README.md` 도 함께 만듭니다 (필수). 무엇을 하는지, 설치·사용법, 필요한 환경변수를 적습니다.

## 2. 종류별 파일 위치와 최소 예시

기본 위치에 두면 `plugin.json` 에 경로를 적을 필요가 없습니다.

| 종류 | 위치 | 이름 |
| --- | --- | --- |
| 스킬 | `skills/<이름>/SKILL.md` | `/my-plugin:<이름>` |
| 커맨드 (구형식) | `commands/<이름>.md` | `/my-plugin:<이름>` |
| 에이전트 | `agents/<이름>.md` | `my-plugin:<이름>` |
| 훅 | `hooks/hooks.json` | — |
| MCP 서버 | `.mcp.json` (+ `server/`) | `plugin:my-plugin:<서버>` |
| 실행 파일 | `bin/` | Bash 도구의 PATH 에 추가됨 |

### 스킬 (사용자 실행 커맨드도 스킬로)

공식 문서는 새 플러그인에 `commands/` 대신 `skills/` 를 권장합니다. 스킬은 이름으로 실행되는 커맨드 역할을 그대로 하면서, 보조 파일(카탈로그, 예시)을 같은 폴더에 둘 수 있습니다.

`skills/hello/SKILL.md`:

```markdown
---
description: 인사한다. 사용자가 인사를 요청할 때 사용한다.
argument-hint: "[이름]"
---

$ARGUMENTS 에게 짧게 인사한다.
```

- 사용자만 실행하게 하려면(커맨드처럼) `disable-model-invocation: true`
- 사용자 메뉴에서 숨기고 Claude 만 쓰게 하려면 `user-invocable: false`
- 플러그인 안 파일은 `${CLAUDE_PLUGIN_ROOT}/...` 로 가리킵니다 (설치 위치가 사람마다 다름)

### 커맨드 (기존 파일 옮길 때만)

`commands/about.md`:

```markdown
---
description: 이 저장소를 세 문장으로 요약
---

이 저장소가 무엇을 하는지 세 문장으로 요약한다.
```

### 에이전트

`agents/reviewer.md`:

```markdown
---
name: reviewer
description: 변경된 코드를 리뷰한다. 코드 수정 후 리뷰가 필요할 때 사용한다.
tools: Read, Glob, Grep
---

너는 리뷰어다. 바뀐 파일을 읽고 문제를 보고한다. 파일은 수정하지 않는다.
```

- `tools` 는 허용 목록입니다. 여기 없는 도구는 실제로 쓸 수 없습니다 (`disallowedTools` 는 거부 목록).
- 플러그인 에이전트에서는 `hooks`, `mcpServers`, `permissionMode` 가 **무시됩니다.** 훅은 `hooks/hooks.json`, MCP 는 `.mcp.json` 에 둡니다.
- 경로 단위 제한(예: `docs/` 만 쓰기)은 frontmatter 로 안 됩니다. `PreToolUse` 훅에서 입력의 `agent_type` 을 보고 막습니다 — `plugins/dev-pipeline/hooks/` 가 예시입니다.

### 훅

`hooks/hooks.json` (최상위 `"hooks"` 키로 감싸야 합니다):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/format.sh\"" }
        ]
      }
    ]
  }
}
```

- 플러그인 훅은 플러그인이 켜져 있는 동안 항상 동작합니다. `matcher` 로 범위를 좁힙니다.
- 셸 형식(`command` 만)이면 `${CLAUDE_PLUGIN_ROOT}` 를 큰따옴표로 감쌉니다. `args` 를 쓰는 exec 형식이면 따옴표가 필요 없습니다.
- 막으려면 exit 2 + stderr, 또는 exit 0 + `permissionDecision: "deny"` JSON.
- 훅 플러그인 형태: `plugins/<이름>/hooks/hooks.json` + `plugins/<이름>/hooks/<스크립트>`.

## 3. MCP 서버 플러그인

형태:

```text
plugins/my-mcp/
├── .claude-plugin/plugin.json
├── .mcp.json
├── README.md            필요한 환경변수 목록, 실행 방법
└── server/
    ├── server.py        서버 코드
    └── requirements.txt 의존성 (Node 면 package.json + lock 파일)
```

`.mcp.json`:

```json
{
  "mcpServers": {
    "example-api": {
      "command": "python",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server/server.py"],
      "env": {
        "EXAMPLE_API_TOKEN": "${EXAMPLE_API_TOKEN}",
        "EXAMPLE_API_URL": "${EXAMPLE_API_URL:-https://api.example.com}"
      }
    }
  }
}
```

### 환경변수와 비밀값

- **비밀값은 절대 파일에 적지 않습니다.** `.mcp.json` 에는 `${변수}` 참조만 둡니다. `${변수:-기본값}` 으로 기본값을 줄 수 있습니다 (비밀값에는 기본값을 주지 않습니다).
- 사용자는 Claude Code 를 띄우기 전에 셸 환경에 변수를 설정합니다. 변수가 없으면 서버는 `${변수}` 문자 그대로 받고 `/mcp`, `claude mcp list` 에 경고가 뜹니다 — 서버 코드에서 값이 비었거나 `${` 로 시작하면 분명한 에러로 끝내세요.
- 대안: `plugin.json` 의 `userConfig` 에 `"sensitive": true` 옵션을 선언하면 설치 때 입력받아 OS 보안 저장소에 보관하고, `.mcp.json` 에서 `${user_config.<키>}` 로 씁니다. 환경변수 설정이 번거로운 경우에 씁니다.
- README 에는 변수 **이름, 용도, 필수 여부, 발급처**만 적습니다. 값의 예시는 `xxxx` 처럼 가짜로.
- 의존성 설치물(`node_modules`, 가상환경)은 커밋하지 않습니다. 업데이트에도 남아야 하는 설치물은 `${CLAUDE_PLUGIN_DATA}` 에 둡니다 (`.gitignore` 에 이미 제외 규칙이 있습니다).
- 서버 로그는 stdout 이 아니라 stderr 로 씁니다 (stdio MCP 는 stdout 이 프로토콜 채널).

## 4. 등록과 목록 갱신

1. `.claude-plugin/marketplace.json` 의 `plugins` 배열에 항목을 추가합니다:

   ```json
   {
     "name": "my-plugin",
     "source": "./plugins/my-plugin",
     "description": "한 줄 설명",
     "category": "development"
   }
   ```

   - `name` 은 `plugin.json` 의 `name` 과 같게.
   - `version` 은 여기 쓰지 않고 `plugin.json` 에만 둡니다 (둘 다 있으면 `plugin.json` 이 이기고 검증 경고가 납니다).
2. 루트 `README.md` 의 **플러그인 목록** 표에 행을 추가합니다 (이름 · 설명 · 종류 · 버전 · README 링크).

## 5. 검증

```bash
python scripts/validate.py          # 기본
python scripts/validate.py --strict # 경고도 실패로
```

`validate.py` 는 JSON 유효성, 등록 경로 존재, 미등록 플러그인, README 유무, 민감 파일·비밀값 문자열을 검사하고, `claude` CLI 가 있으면 공식 검증(`claude plugin validate .`)까지 돌립니다. 플러그인 하나만 공식 검증하려면:

```bash
claude plugin validate ./plugins/my-plugin
```

## 6. 로컬 설치 테스트

push 전에 내 컴퓨터에서 설치해 봅니다.

```bash
# 한 세션만 바로 띄워 보기 (설치 없이)
claude --plugin-dir ./plugins/my-plugin

# 마켓플레이스째 설치해 보기
claude plugin marketplace add .            # 레포 루트에서
claude plugin install my-plugin@claude-toolkit
claude plugin details my-plugin           # 스킬·에이전트·훅 목록 확인
```

로컬 경로로 추가한 마켓플레이스는 파일을 그 자리에서 읽으므로, 수정 후 세션에서 `/reload-plugins` 만 하면 됩니다.
확인이 끝났으면 GitHub 마켓플레이스와 이름이 겹치지 않게 `claude plugin marketplace remove claude-toolkit` 으로 지우고 GitHub 쪽을 다시 추가합니다.

## 7. 버전 올리기와 CHANGELOG

### 버전 (플러그인별, semver)

`plugin.json` 의 `version` 이 곧 배포 버전입니다. 이 값을 올리지 않으면 사용자에게 업데이트가 가지 않습니다.

| 변경 | 올릴 자리 | 예 |
| --- | --- | --- |
| 이름 변경·삭제, 동작이 크게 바뀌어 기존 사용법이 깨짐 | MAJOR | 1.4.2 → 2.0.0 |
| 스킬·에이전트·훅 추가, 하위 호환되는 기능 추가 | MINOR | 1.4.2 → 1.5.0 |
| 버그 수정, 프롬프트 문구 다듬기, 문서 | PATCH | 1.4.2 → 1.4.3 |

`0.x` 동안은 MINOR 를 깨지는 변경에도 씁니다. 버전을 올리면 루트 README 표의 버전도 같이 고칩니다.

### CHANGELOG.md (레포 하나에 하나)

- 날짜(`## YYYY-MM-DD`) 내림차순, 그 아래 `### 추가` / `### 변경` / `### 수정` / `### 삭제`.
- 항목 앞에 영향받는 플러그인을 `[my-plugin]`, 레포 공통이면 `[repo]` 로 표시.
- 버전을 올린 경우 `[my-plugin] 0.2.0 — ...` 처럼 새 버전을 적습니다.
- 사용자가 알아야 할 변화(사용법, 이름, 필요한 환경변수)를 적고, 내부 리팩터링은 한 줄로 묶습니다.

예:

```markdown
## 2026-11-03

### 추가
- [my-plugin] 0.2.0 — `/my-plugin:export` 스킬 추가

### 수정
- [dev-pipeline] 0.1.1 — plan-tasks 가 빈 docs/ 에서 멈추지 않던 문제
```

## 체크리스트

- [ ] `plugins/<이름>/.claude-plugin/plugin.json` (name · version · description)
- [ ] `plugins/<이름>/README.md`
- [ ] `marketplace.json` 등록
- [ ] 루트 README 플러그인 표
- [ ] CHANGELOG 항목
- [ ] 비밀값 없음 (환경변수 이름만 README 에)
- [ ] `python scripts/validate.py` 통과
- [ ] 로컬 설치 후 `claude plugin details <이름>` 로 구성 요소 확인
