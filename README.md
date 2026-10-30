# claude-toolkit

개인 Claude Code 플러그인 마켓플레이스(모노레포)입니다.
직접 만든 skill · agent · command · hook · MCP 서버를 플러그인 단위로 `plugins/` 아래에 모아 관리하고, 이 레포 하나를 마켓플레이스로 등록해 배포합니다.
플러그인은 각각 독립적으로 설치·업데이트·삭제할 수 있습니다.

## 설치

### 1. 마켓플레이스 추가

셸에서:

```bash
claude plugin marketplace add HiSoo38/claude-toolkit
```

Claude Code 세션 안에서:

```text
/plugin marketplace add HiSoo38/claude-toolkit
```

로컬에 클론한 사본을 쓰려면 경로를 넘깁니다 (수정이 바로 반영돼 개발할 때 편합니다):

```bash
claude plugin marketplace add ./claude-toolkit
```

### 2. 플러그인 설치

```bash
claude plugin install dev-pipeline@claude-toolkit                  # 사용자 범위 (기본)
claude plugin install dev-pipeline@claude-toolkit --scope project  # 이 프로젝트에만 (.claude/settings.json 에 기록)
```

세션 안에서는 `/plugin install dev-pipeline@claude-toolkit` 또는 `/plugin` 패널의 Discover 탭을 씁니다.
설치 후 실행 중인 세션에는 `/reload-plugins` 를 실행하면 반영됩니다.

### 3. 업데이트

```bash
claude plugin marketplace update claude-toolkit   # 마켓플레이스 목록 새로 받기
claude plugin update dev-pipeline@claude-toolkit  # 플러그인 업데이트
```

### 4. 끄기 · 삭제

```bash
claude plugin disable dev-pipeline@claude-toolkit    # 설치는 두고 끄기 (enable 로 다시 켬)
claude plugin uninstall dev-pipeline@claude-toolkit  # 플러그인 삭제
claude plugin marketplace remove claude-toolkit      # 마켓플레이스 제거 (그 안의 플러그인도 함께 삭제)
```

설치 상태 확인: `claude plugin list`, 구성 요소 확인: `claude plugin details dev-pipeline`

## 플러그인 목록

| 이름 | 설명 | 종류 | 버전 | 문서 |
| --- | --- | --- | --- | --- |
| `dev-pipeline` | 계약 문서 확정 → 작업 분할 → Orca 로 여러 기능 동시 구현 → 별도 에이전트 리뷰(Claude · Codex). 스택 자동 감지 | skill · agent · hook | 0.3.0 | [README](./plugins/dev-pipeline/README.md) |
| `feature-flow` | `/feature-flow:ship-feature "<기능>"` 하나로 브랜치 → 계획서 · 체크리스트 → 성격별 커밋 → PR → Codex + Claude 전수 리뷰 · GitHub PR 리뷰 게시 → 수정 · 확인 리뷰 → develop 머지 → develop→main PR. main 머지는 사람이 | skill | 0.1.1 | [README](./plugins/feature-flow/README.md) |

## 레포 구조

```text
.
├── .claude-plugin/marketplace.json   레포 안 모든 플러그인 등록
├── README.md                         이 문서
├── ADDING.md                         새 플러그인 추가 방법
├── CHANGELOG.md                      레포 전체 변경 이력
├── LICENSE                           MIT
├── scripts/validate.py               마켓플레이스·플러그인 검증
└── plugins/
    └── <플러그인>/                    플러그인 하나 = 폴더 하나
        ├── .claude-plugin/plugin.json
        └── README.md
```

## 새 플러그인 추가

[ADDING.md](./ADDING.md) 를 참고하세요. 추가·수정 후에는 항상 검증을 돌립니다:

```bash
python scripts/validate.py
```

## 공통 규칙

- 플러그인 하나 = `plugins/` 아래 폴더 하나. 각자 `plugin.json`, `README.md`, 버전을 가집니다.
- 새 플러그인은 `marketplace.json` 과 위 플러그인 목록 표를 함께 갱신합니다.
- 비밀값(API 키, 토큰, 비밀번호)은 커밋하지 않습니다. MCP 서버는 환경변수로 받고, README 에는 필요한 환경변수 이름만 적습니다.
- 실제 회사명, 회사 DB 구조, 사내 시스템 정보는 넣지 않습니다.

## 라이선스

[MIT](./LICENSE)
