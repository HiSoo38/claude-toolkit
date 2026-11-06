# git 모드 흐름

SKILL.md 의 git 모드에서 쓰는 브랜치 · 커밋 · PR · 리뷰 · 머지 절차. 프로젝트 `CLAUDE.md` 에 같은 주제의 규칙이 있으면 그것을 따른다.
값(통합 브랜치 · 배포 브랜치 · 계획서 위치)은 `han.mjs start` 가 보여 준 설정을 쓴다. `han.mjs` 는 SKILL.md 첫머리의 스크립트 경로다. 명령은 Git Bash 에서 실행한다.

## 0. 사전 확인

```bash
gh auth status
codex --version                                   # 실패하면 4 단계 "Codex 를 못 쓸 때" 대로 Claude 로 대신한다
gh repo view --json owner -q .owner.login         # 저장소 소유자
gh api user -q .login                             # 지금 로그인 계정
git remote -v; git log -1 --oneline               # 원격 · 커밋이 있는지
```

- **커밋이나 원격이 없는 새 저장소**: git 모드를 시작하지 않는다. 그 작업은 로컬 모드로 끝내고, 보고에 첫 커밋 · `develop` 만들기 · 원격 연결 명령을 적어 준다 (원격 저장소 생성은 사람이 한다). 사람이 올린 뒤의 작업부터 git 모드로 한다.
- **통합 브랜치 머지를 맡지 않는 경우**: 설정의 `통합 브랜치 머지` 가 `사람`, 소유자가 로그인 계정과 다름(조직 · 남의 저장소), 또는 통합 브랜치가 배포 브랜치와 같음. 이때는 7 단계(확인 리뷰)와 그 수정까지 하고, 8 단계 요약 코멘트를 단 뒤 멈춘다.

## 1. 브랜치

```bash
git switch <통합> && git pull && git switch -c feature/<작업-이름>
```

버그 수정이면 `fix/<내용>`. 이름은 kebab-case 영어. 계획서 · 체크리스트를 첫 커밋으로: `docs(plan): <작업> 계획서 · 체크리스트`.

## 2. 성격별 커밋

- `feat` / `fix` / `style` / `refactor` / `chore` / `docs` / `test` 로 나눈다. 한 파일이 두 작업에 걸치면 부분 스테이징으로 가른다.
- **각 커밋이 그 자체로 검사를 통과하는 순서**로 놓는다. 테스트는 그 테스트가 확인하는 코드와 같은 커밋에 넣는다. DB 마이그레이션 파일은 그 기능 커밋에 같이 넣는다 (적용은 사람이 한다).
- 메시지: `type(scope): 한 줄 요약` + 본문에 왜 그렇게 했는지와 근거 수치. 프로젝트 · 사용자 규칙이 있으면 그 형식.
- 메시지는 파일로 써서 `git commit -F <파일>` 로 넘긴다 (PowerShell 은 큰따옴표가 든 인자를 쪼갠다). BOM 없는 UTF-8.
- 커밋 직전 훅이 `check` 결과를 확인한다. 막히면 `han.mjs check` 부터.

## 3. 최신 통합 브랜치 반영 · PR

```bash
git fetch origin && git merge origin/<통합>      # 충돌을 풀었으면 check 를 다시 돌린다
git push -u origin feature/<작업-이름>
gh pr create --base <통합> --title "<type>: <요약>" --body-file <저장소 밖 임시 파일>
```

- 이미 push 한 이력을 바꾸지 않도록 rebase 대신 merge.
- PR 본문: 계획서 · 체크리스트 경로, 테스트 결과(단위 · 화면 자동), 직접 확인할 체크리스트, 사람이 할 일(DB 적용 등). **아직 머지하지 않는다.**
- PR 검사(CI · GitHub Actions)가 있으면 **리뷰 전에 결과를 확인**한다 (`gh pr checks <번호>`). 실패면 먼저 고치고 push 한다. 실패를 모른 채 리뷰 · 머지 단계로 넘어가지 않는다. 머지 직전에도 마지막 push 의 검사가 통과했는지 다시 본다.

## 4. 전수 리뷰 (1번)

PR 전체(`git diff origin/<통합>...HEAD`)를 한 번에 본다. 지시문은 [review-prompt.md](review-prompt.md) "전수 리뷰" — 설정 파일의 학습 규칙을 지시문에 붙인다.

- **Codex** 와 **`han-pipeline:reviewer`** 를 따로 돌린다. 자원 예산의 "리뷰어" 가 `동시에` 면 Codex 를 백그라운드로 띄우고 그동안 reviewer 를 부른다. `하나씩 차례로` 면 Codex 가 끝난 뒤 reviewer 를 부른다.
- Codex 실행 (읽기 전용 · 추론 강도 high · 입력은 파일로):

  ```bash
  han.mjs run "codex exec -s read-only --ephemeral -c model_reasoning_effort=high -o <임시 폴더>/codex-review-pr<번호>-r1.md - < <임시 폴더>/review-prompt.txt"
  ```

  - 지시문을 인자로 넘기지 않는다. Windows 는 지시문 안 큰따옴표에서 인자를 잘라 Codex 가 첫 줄만 받는다.
  - `- < 파일` 로 넘겨야 입력이 닫힌다. 안 그러면 "Reading additional input from stdin" 에서 멈춘다.
  - `codex review --base` 는 지시문과 함께 못 쓴다. `codex exec` 를 쓴다.
  - 결과 파일과 지시문은 **저장소 밖**(세션 임시 폴더)에만 둔다.
- 두 결과를 합치고 중복을 뺀 뒤, **지적마다 코드를 직접 열어** 맞음 / 틀림 / 일부 맞음을 판단한다.

### Codex 를 못 쓸 때 (설치 안 됨 · 사용 한도 · 오류)

리뷰를 건너뛰지 않는다. Codex 자리를 `han-pipeline:reviewer` 하나로 대신해 두 리뷰어를 채운다. 대신하는 쪽은 원래 reviewer 와 따로 부르고 지시문에 한 줄을 더한다: "다른 리뷰어가 이미 본다고 가정하고, 경계값 · 실패 경로 · 보안 · 기존 동작 회귀를 특히 깊게 본다." 리뷰 기록의 리뷰어 칸에 `Claude + Claude(Codex 대신: <이유>)` 처럼 사실대로 적는다.

## 5. PR 리뷰로 게시 (회차당 1건)

일반 코멘트가 아니라 PR Review. 같은 계정이면 Approve · Request changes 를 못 하므로 `event: COMMENT`.

- 본문 첫 줄: `🤖 리뷰 <회차>차 (<실제로 돌린 리뷰어>) · 범위 <통합>...<HEAD 짧은 해시> (커밋 n개 · 파일 n개 전체)`
- 본문에 판단 표 `| 출처 | 지적 | 판단 | 처리 |`, 원문은 `<details>` 로 접는다. 파일:줄이 있는 지적은 인라인 코멘트로 (diff 에 없는 줄은 본문 표에만).

```bash
gh api repos/<owner>/<repo>/pulls/<번호>/reviews --input <임시 폴더>/review-pr<번호>-r<회차>.json
```

```json
{"commit_id": "<HEAD 전체 해시>", "event": "COMMENT", "body": "<판단 표>",
 "comments": [{"path": "src/a.ts", "line": 44, "side": "RIGHT", "body": "<지적 · 판단>"}]}
```

`side` 는 추가 · 그대로인 줄 `RIGHT`, 지운 줄 `LEFT`. 올리기 전에 아래 "민감 정보 검사".

## 6. 한 번에 고친다

- 맞는 "꼭 고칠 것" · "고치면 좋은 것" 은 모두 고친다. "사소함" 은 판단해서 고치고, 안 고치면 이유를 표에 적는다. 틀린 지적은 이유를 표에 적는다.
- 지적을 고치는 데 필요한 만큼만 바꾼다. 고친 뒤 `check`, 성격별 커밋(본문에 고친 지적), push.
- 맞는 지적을 설정 파일 `## 리뷰 지적 기록` 에 남긴다 (SKILL.md "학습 규칙").

## 7. 확인 리뷰 (1번)

Codex 로(못 쓰면 reviewer 하나로) 범위를 **"4 의 지적이 제대로 고쳐졌는지 · 고치면서 새로 깨진 것이 있는지"** 로 좁혀 본다. 지시문은 [review-prompt.md](review-prompt.md) "확인 리뷰". 5 와 같은 형식(2차)으로 게시한다.

- 맞는 "꼭 고칠 것" 은 고친다. 나머지는 몇 줄로 끝나는 것만 고치고, 그 밖은 PR 에 이유를 적고 넘긴다.
- **PR 하나당 전수 1번 + 확인 1번.** 3번째가 필요하면 멈추고 사람에게 묻는다.

## 8. 리뷰 요약 코멘트 (머지 직전 1건)

PR Review 는 커밋 사이에 끼고 고친 줄의 인라인 지적은 Outdated 로 접혀 잘 안 보인다. 확인 리뷰 수정까지 push 한 뒤(머지를 맡았으면 머지 직전) PR 맨 아래에 요약을 1건 단다 (`gh pr comment <번호> --body-file <임시 파일>`).

```markdown
## 🤖 리뷰 요약

| 회차 | 리뷰어 | 범위 | 지적 | 처리 |
|---|---|---|---|---|
| [1차 전수](<리뷰 링크>) | Codex + Claude | <통합>...<해시> | 꼭 n · 좋음 n · 사소 n | 맞음 n → 반영 / 안 고침 n |
| [2차 확인](<리뷰 링크>) | Codex | <해시>..<해시> | … | … |
```

리뷰 id: `gh api repos/<owner>/<repo>/pulls/<번호>/reviews --jq '.[] | [.id, .body[:20]]'`.

## 9. 통합 브랜치 머지

확인 리뷰에서 맞는 "꼭 고칠 것" 이 남지 않았고, 0 단계에서 머지를 맡았을 때만 (통합 브랜치가 배포 브랜치와 같으면 훅이 막는다 — 0 단계대로 멈춘다).

```bash
git fetch origin && git merge-base --is-ancestor origin/<통합> HEAD; echo $?
```

- `0`: 그대로 머지.
- `1`: 그 사이 통합 브랜치가 바뀌었다. `git merge origin/<통합>` 후 `check`. 충돌 없이 통과하면 머지 (들어온 변경은 자기 PR 에서 리뷰를 거쳤다). 충돌을 손으로 풀었으면 멈추고 묻는다.
- `2` 이상: git 오류. 멈추고 보고.

```bash
gh pr merge <번호> --merge --delete-branch     # 나눈 커밋을 그대로 남기려고 merge commit 방식
```

## 10. 통합 → 배포 PR

열린 `<통합>` → `<배포>` PR 이 없으면 만들고(`release: <통합> → <배포>`), 있으면 본문의 포함 작업 목록만 갱신한다. 통합 브랜치가 배포 브랜치와 같으면 건너뛴다. **배포 브랜치 머지는 사람이 한다.**

## 민감 정보 검사

PR 본문 · 리뷰 · 코멘트 · 커밋 메시지 · 계획서는 공개될 수 있다. 올리기 전에 그 파일을 검사하고, 걸리면 `<가림>` 으로 바꾼다.

```bash
grep -nE 'sb_secret_|sb_publishable_|sbp_|gh[pousr]_[A-Za-z0-9]|eyJhbGci|sk-[A-Za-z0-9]|AKIA[0-9A-Z]{16}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|01[016789]-?[0-9]{3,4}-?[0-9]{4}' <파일>
```

패턴에 안 걸리는 비밀번호 · 주소 · 고객 데이터는 직접 읽고 확인한다. 커밋 작성자 · Co-Authored-By 의 noreply 주소는 예외.

## 함정

| 증상 | 원인 · 대처 |
| --- | --- |
| Codex 가 10분 넘게 출력 없음 | stdin 대기. 지시문을 `- < 파일` 로 넘기지 않았다 |
| Codex 가 "usage limit" 으로 끝남 | 기다리지 말고 "Codex 를 못 쓸 때" 대로 대신한다 |
| Codex 가 "지적 사항을 보내 주세요" 같은 답만 함 | 지시문이 첫 줄에서 잘렸다. `- < 파일` 로 넘긴다 |
| 커밋 메시지가 여러 인자로 쪼개짐 | PowerShell 따옴표. `git commit -F <파일>` |
| 커밋 메시지 맨 앞에 깨진 문자 | BOM. BOM 없는 UTF-8 로 쓴다 |
| 인라인 코멘트 422 오류 | 그 줄이 diff 에 없다. 본문 표로 옮긴다 |
