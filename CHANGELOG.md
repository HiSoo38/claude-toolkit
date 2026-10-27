# CHANGELOG

레포 전체 변경 이력. 형식과 작성 규칙은 [ADDING.md](./ADDING.md#7-버전-올리기와-changelog) 참고.
날짜 내림차순. 항목 앞의 `[플러그인]` 은 영향받는 플러그인, `[repo]` 는 레포 공통.

## 2026-10-27

### 추가

- [repo] 마켓플레이스 `claude-toolkit` 구성: `marketplace.json`, README, ADDING, LICENSE(MIT), `.gitignore`, `scripts/validate.py`
- [dev-pipeline] 0.1.0 첫 릴리스
  - 스킬: `init-pipeline`, `plan-tasks`, `review-diff` (사용자 실행), `pipeline-workflow` (자동 적용 규칙)
  - 에이전트: `planner`, `db-designer`, `api-designer`, `implementer`, `reviewer`
  - 훅: 에이전트별 파일 쓰기 위치 강제 (`hooks/guard_paths.py`)
  - 템플릿: `CLAUDE.md`, `AGENTS.md`, `requirements.md`, `schema.sql` / `schema.md`, `api-spec.md`
