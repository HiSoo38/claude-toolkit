// han-pipeline 스크립트(han.mjs · guard.mjs)가 함께 쓰는 함수 모음.
// 프로젝트 설정 읽기, git 정보 조회, 작업 트리 지문 계산을 맡는다.

import { spawnSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { availableParallelism, cpus, freemem, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";

// 실행 중 표시가 이 시간보다 오래되면 끝난 실행으로 본다 (세션이 죽어 stop 을 못 한 경우).
export const ACTIVE_TTL_MS = 12 * 60 * 60 * 1000;

export function git(args, cwd, env) {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: env ? { ...process.env, ...env } : process.env,
  });
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

export function repoRoot(cwd) {
  const r = git(["rev-parse", "--show-toplevel"], cwd);
  return r.ok ? r.out : null;
}

// 워크트리마다 따로인 .git 폴더. 실행 표시와 검사 결과를 여기에 둔다 (저장소 파일이 아니라 커밋될 일이 없다).
export function stateDir(cwd) {
  const r = git(["rev-parse", "--path-format=absolute", "--git-dir"], cwd);
  if (!r.ok) return null;
  return join(r.out, "han-pipeline");
}

// 모든 워크트리가 같이 쓰는 .git 폴더 (마이그레이션 시각처럼 워크트리끼리 나눠 써야 하는 값을 둔다).
export function commonGitDir(cwd) {
  const r = git(["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd);
  return r.ok ? r.out : null;
}

// 원래 저장소 폴더 (워크트리 안에서 불러도 원래 폴더를 돌려준다).
export function mainRoot(cwd) {
  const common = commonGitDir(cwd);
  return common && /[\\/]\.git$/.test(common) ? dirname(common) : repoRoot(cwd);
}

export function currentBranch(cwd) {
  const r = git(["branch", "--show-current"], cwd);
  return r.ok ? r.out : "";
}

// <저장소>/.claude/han-pipeline.md 의 "## 설정" 아래 "- 키: 값" 줄을 읽는다.
// 파일이나 키가 없으면 DEFAULTS 와 자동 감지 값을 쓴다.
const DEFAULTS = {
  "통합 브랜치": "",
  "배포 브랜치": "",
  "통합 브랜치 머지": "자동",
  "계획서 위치": "docs/plans",
  "공용 디렉터리": "",
  "타입 검사": "",
  "린트": "",
  "테스트": "",
  "파일 길이 한도": "400",
  "파일 길이 예외": "",
  "화면 테스트": "조회만",
  "로그인 세션 파일": "",
  "dev 서버 주소": "http://localhost:3000",
  "자원 등급": "자동",
  "동시 기능 수": "3",
  "워크트리 준비": "",
};

export function settingsPath(root) {
  return join(root, ".claude", "han-pipeline.md");
}

export function readSettings(root) {
  const s = { ...DEFAULTS };
  const p = settingsPath(root);
  if (existsSync(p)) {
    const text = readFileSync(p, "utf8");
    const section = text.split(/^## /m).find((part) => part.startsWith("설정"));
    if (section) {
      for (const line of section.split(/\r?\n/)) {
        const m = line.match(/^-\s*([^:]+?)\s*:\s*(.*?)\s*(#.*)?$/);
        if (m && m[1] in s) s[m[1]] = m[2].replace(/^`|`$/g, "");
      }
    }
  }
  return fillDetected(root, s);
}

function fillDetected(root, s) {
  if (!s["통합 브랜치"]) {
    s["통합 브랜치"] = git(["rev-parse", "--verify", "--quiet", "origin/develop"], root).ok
      ? "develop"
      : defaultBranch(root);
  }
  if (!s["배포 브랜치"]) s["배포 브랜치"] = defaultBranch(root);

  const pkg = readJson(join(root, "package.json"));
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  if (!s["타입 검사"] && existsSync(join(root, "tsconfig.json"))) s["타입 검사"] = "npx tsc --noEmit";
  if (!s["린트"] && deps.eslint) s["린트"] = "npx eslint {files}";
  // 새 워크트리에는 Next.js 라우트 타입(.next/types)이 없어 타입 검사가 실패하므로 먼저 만든다.
  if (!s["워크트리 준비"] && deps.next) s["워크트리 준비"] = "npx next typegen";
  if (!s["테스트"]) {
    if (deps.vitest) s["테스트"] = "npx vitest related {files} --run --maxWorkers=1 --passWithNoTests";
    else if (deps.jest) s["테스트"] = "npx jest --findRelatedTests {files} --runInBand --passWithNoTests";
  }
  return s;
}

function defaultBranch(root) {
  const r = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], root);
  if (r.ok) return r.out.replace(/^origin\//, "");
  for (const b of ["main", "master"]) {
    if (git(["rev-parse", "--verify", "--quiet", b], root).ok) return b;
  }
  return "main";
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

// 설정 명령(타입 검사)을 경로 표시 `[경로,경로]` 로 나눠, 바뀐 코드가 있는 쪽의 명령만 남긴다
// (모노레포에서 웹만 고쳤는데 관리자 타입 검사까지 돌지 않게).
// - 명령의 맨 앞이나 `&&` 바로 뒤에 오는 `[...]` 가 표시다. 표시 하나는 다음 표시 앞까지를 모두 덮으므로
//   `[apps/web] cd apps/web && npx tsc` 처럼 `&&` 가 든 명령도 한 덩어리로 다룬다.
// - 첫 표시 앞에 표시 없는 명령이 있으면 그것은 늘 돈다. 남은 명령이 없으면 빈 문자열(= 건너뜀).
// - 명령 맨 앞의 `[ ... ]` 는 쉘 테스트(`[ -f x ]`)가 아니라 경로 표시로 읽는다.
// - 경로는 저장소 루트 기준이고 `\` · 앞의 `./` · 끝의 `/` 는 무시한다.
//   예: [apps/web,packages] npx tsc -p web.json && [apps/admin,packages] npx tsc -p admin.json
export function scopeByPath(template, codeFiles) {
  const kept = splitPathMarks(template).flatMap(({ paths, command }) => {
    if (!paths) return [command];
    const hit = codeFiles.some((f) => paths.some((p) => f === p || f.startsWith(p + "/")));
    return hit ? [command] : [];
  });
  return kept.join(" && ");
}

// 설정 명령에 적힌 경로 표시의 경로 전부 (정규화한 값). 없는 경로를 잡아내는 데 쓴다.
export function pathMarks(template) {
  return splitPathMarks(template).flatMap((part) => part.paths ?? []);
}

// 명령을 [{ paths: 표시의 경로 목록 또는 null(표시 없음), command }] 로 나눈다.
function splitPathMarks(template) {
  if (!template) return [];
  const marks = [...template.matchAll(/(^|&&)\s*\[([^\]]*)\]/g)];
  if (marks.length === 0) return [{ paths: null, command: template.trim() }];
  const parts = [];
  const lead = template.slice(0, marks[0].index).trim();
  if (lead) parts.push({ paths: null, command: lead });
  marks.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : template.length;
    const command = template.slice(start, end).trim();
    const paths = m[2]
      .split(",")
      .map((x) => x.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, ""))
      .filter(Boolean);
    if (command) parts.push({ paths, command });
  });
  return parts;
}

// 이번 작업에서 바뀐 파일 목록. 기능 브랜치면 통합 브랜치와 갈라진 지점부터, 아니면 HEAD 부터.
// 커밋된 변경 · 커밋 안 된 변경 · 새 파일을 모두 넣고, 지운 파일은 뺀다.
export function changedFiles(root, settings) {
  const integ = settings["통합 브랜치"];
  const branch = currentBranch(root);
  let base = "HEAD";
  if (branch && branch !== integ) {
    for (const ref of [`origin/${integ}`, integ]) {
      const mb = git(["merge-base", "HEAD", ref], root);
      if (mb.ok && mb.out) {
        base = mb.out;
        break;
      }
    }
  }
  const files = new Set();
  const diff = git(["diff", "--name-only", "--diff-filter=d", base], root);
  if (diff.ok) diff.out.split("\n").filter(Boolean).forEach((f) => files.add(f));
  const untracked = git(["ls-files", "--others", "--exclude-standard"], root);
  if (untracked.ok) untracked.out.split("\n").filter(Boolean).forEach((f) => files.add(f));
  return { base, files: [...files].filter((f) => existsSync(join(root, f))) };
}

// 작업 트리 전체(무시 파일 제외)의 git tree 해시. 파일 내용이 그대로면 커밋을 나눠도 같은 값이 나온다.
// 실제 인덱스를 건드리지 않도록 복사본 인덱스에 add 한다.
export function treeFingerprint(root) {
  const gitDir = git(["rev-parse", "--path-format=absolute", "--git-dir"], root).out;
  const tmp = join(tmpdir(), `han-pipeline-index-${process.pid}-${Date.now()}`);
  try {
    const realIndex = join(gitDir, "index");
    if (existsSync(realIndex)) copyFileSync(realIndex, tmp);
    const env = { GIT_INDEX_FILE: tmp };
    const add = git(["add", "-A", "."], root, env);
    if (!add.ok) return null;
    const tree = git(["write-tree"], root, env);
    return tree.ok ? tree.out : null;
  } finally {
    rmSync(tmp, { force: true });
  }
}

export function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

// git 을 부르지 않고 파일만 보고 저장소 루트와 .git 폴더를 찾는다.
// guard 훅은 모든 Bash 명령마다 실행되므로, git 프로세스를 띄우지 않아야 평소 명령이 느려지지 않는다.
export function findGitDirFast(cwd) {
  let dir = resolve(cwd);
  for (;;) {
    const dotGit = join(dir, ".git");
    if (existsSync(dotGit)) {
      if (statSync(dotGit).isDirectory()) return { root: dir, gitDir: dotGit };
      // 워크트리: .git 파일에 "gitdir: <경로>" 가 적혀 있다
      const m = readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)$/m);
      if (m) return { root: dir, gitDir: resolve(dir, m[1].trim()) };
      return null;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function branchFromHead(gitDir) {
  try {
    const m = readFileSync(join(gitDir, "HEAD"), "utf8").match(/^ref:\s*refs\/heads\/(.+)$/m);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

// 실행 표시 파일을 읽는다. 없거나 오래됐으면 null.
export function readActive(gitDir) {
  try {
    const active = JSON.parse(readFileSync(join(gitDir, "han-pipeline", "active"), "utf8"));
    return Date.now() - active.at < ACTIVE_TTL_MS ? active : null;
  } catch {
    return null;
  }
}

// 파이프라인이 쓸 수 있는 몫을 정한다. 기준은 "사용자가 다른 작업을 계속할 수 있을 만큼 남겨 두기" 다.
// 사용자 몫(reserveGB = 전체 RAM 의 25%, 최소 3GB)을 먼저 떼고, 남은 메모리에서 그 몫을 뺀 만큼(spareGB)만 쓴다.
// 설정의 "자원 등급" 이 자동이 아니면 그 값을 쓴다 (측정이 체감과 다를 때 사람이 고정).
export function measureBudget(override) {
  const GB = 1024 ** 3;
  const totalGB = totalmem() / GB;
  const freeGB = freemem() / GB;
  const cores = typeof availableParallelism === "function" ? availableParallelism() : cpus().length;
  const reserveGB = Math.max(3, totalGB * 0.25);
  const spareGB = freeGB - reserveGB;

  let level;
  if (override && override !== "자동") level = override;
  else if (spareGB < 1) level = "빠듯";
  else if (spareGB < 3 || cores <= 4) level = "보통";
  else level = "여유";

  // 무거운 일 하나(tsc · eslint · 테스트 · 브라우저 · Codex)가 대략 1GB 를 쓴다고 보고 동시에 하나만 띄운다.
  // Claude 서브에이전트는 이 세션 안에서 돌아 메모리를 거의 더 쓰지 않으므로 리뷰어 동시 실행은 Codex 기준으로 정한다.
  const table = {
    빠듯: { reviewersInParallel: false, browserTest: false, heapMB: 2048 },
    보통: { reviewersInParallel: true, browserTest: true, heapMB: 3072 },
    여유: { reviewersInParallel: true, browserTest: true, heapMB: 4096 },
  };
  return {
    level,
    totalGB: round1(totalGB),
    freeGB: round1(freeGB),
    reserveGB: round1(reserveGB),
    spareGB: round1(spareGB),
    cores,
    heavyAtOnce: 1,
    testWorkers: 1,
    // 무거운 일을 띄우기 전에 남아 있어야 하는 메모리: 사용자 몫 + 그 일이 쓸 1GB
    minFreeMB: Math.round((reserveGB + 1) * 1024),
    ...(table[level] || table["보통"]),
  };
}

export function freeMB() {
  return Math.round(freemem() / 1024 ** 2);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Git Bash 경로(/d/work)를 이 OS 의 경로(D:/work)로 바꾼다.
export function nativePath(p) {
  if (process.platform !== "win32") return p;
  const m = p.match(/^\/([a-zA-Z])(\/.*)?$/);
  return m ? `${m[1].toUpperCase()}:${m[2] || "/"}` : p;
}

// 명령이 실제로 도는 폴더. `cd <폴더> && …` 로 시작하거나 `git -C <폴더>` 가 있으면 그 폴더, 아니면 cwd.
// 병렬 작업의 하위 에이전트는 세션 폴더가 아니라 자기 워크트리에서 명령을 돌리므로, 훅이 그 워크트리를 봐야 한다.
export function commandDir(command, cwd) {
  const quoted = String.raw`(?:"([^"]+)"|'([^']+)'|([^\s;&|"']+))`;
  const m =
    command.match(new RegExp(String.raw`^\s*(?:cd|Set-Location)\s+${quoted}\s*(?:&&|;)`)) ||
    command.match(new RegExp(String.raw`\bgit\s+-C\s+${quoted}`));
  if (!m) return cwd;
  return resolve(cwd, nativePath(m[1] ?? m[2] ?? m[3]));
}

// 한 PC 에서 무거운 일(타입 검사 · 린트 · 테스트 · Codex · 브라우저)이 한 번에 하나만 돌도록 줄을 세운다.
// 여러 저장소 · 워크트리 · 세션이 같은 잠금 파일을 쓴다. 잠근 프로세스가 죽었거나 2시간이 지나면 풀린 것으로 본다.
const HEAVY_LOCK = join(tmpdir(), "han-pipeline-heavy.lock");
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;

export function withHeavyLock(label, fn) {
  const release = acquireLock(HEAVY_LOCK, label, 5000);
  try {
    return fn();
  } finally {
    release();
  }
}

// 잠금 파일을 만들 수 있을 때까지 기다린다. 돌려준 함수를 부르면 풀린다 (내가 잡은 잠금일 때만 지운다).
export function acquireLock(path, label, pollMs) {
  let announced = false;
  for (;;) {
    try {
      const fd = openSync(path, "wx");
      writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), label }));
      closeSync(fd);
      return () => {
        if (readJson(path)?.pid === process.pid) rmSync(path, { force: true });
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const holder = readJson(path);
      if (!holder || !processAlive(holder.pid) || Date.now() - holder.at > LOCK_STALE_MS) {
        // 지우기 직전에 다시 읽어, 그 사이 다른 프로세스가 새로 잡은 잠금은 지우지 않는다
        if (readJson(path)?.at === holder?.at) rmSync(path, { force: true });
        continue;
      }
      if (!announced) {
        console.log(`… ${label}: 다른 무거운 일(${holder.label}, pid ${holder.pid})이 끝나기를 기다림`);
        announced = true;
      }
      sleep(pollMs);
    }
  }
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

