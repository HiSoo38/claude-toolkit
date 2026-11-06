// 여러 기능을 동시에 진행할 때 쓰는 명령 (han.mjs worktree · stamp).
//   worktree add <이름> [--fix] [--base <브랜치>]  저장소 밖 <저장소>.worktrees/<이름> 에 기능 브랜치 작업 폴더를 만든다
//   worktree list                                   만든 작업 폴더와 브랜치 · 바뀐 파일 수
//   worktree remove <이름>                           작업 폴더를 지운다 (바뀐 파일이 있으면 지우지 않는다)
//   stamp                                           DB 마이그레이션 파일 이름에 쓸 시각
// 작업 폴더는 원래 폴더의 node_modules 를 연결해 쓴다 (패키지를 다시 설치하지 않는다).

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { acquireLock, commonGitDir, ensureDir, git, mainRoot, readSettings, withHeavyLock } from "./lib.mjs";

const NAME = /^[a-z0-9][a-z0-9-]*$/;

export function worktreeCommand(root, args) {
  const main = mainRoot(root);
  const [sub, ...rest] = args;
  if (sub === "add") return add(main, rest);
  if (sub === "list") return list(main);
  if (sub === "remove") return remove(main, rest);
  fail("사용법: node han.mjs worktree add <이름> [--fix] [--base <브랜치>] | list | remove <이름>");
}

// 작업 폴더는 저장소 밖 옆 폴더에 둔다. 저장소 안에 두면 타입 검사 · 린트가 다른 기능의 파일까지 읽는다.
function worktreesDir(main) {
  return join(dirname(main), `${basename(main)}.worktrees`);
}

function add(main, args) {
  const name = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--base");
  if (!name || !NAME.test(name)) fail("이름은 kebab-case 영어로 (예: tasks-calendar).");
  const settings = readSettings(main);
  const baseArg = args.indexOf("--base");
  const base = baseArg >= 0 ? args[baseArg + 1] : settings["통합 브랜치"];
  const branch = `${args.includes("--fix") ? "fix" : "feature"}/${name}`;
  const path = join(worktreesDir(main), name);
  if (existsSync(path)) fail(`이미 있습니다: ${path} — 이어서 하려면 그 폴더에서 계속하세요.`);

  // 최신 통합 브랜치에서 딴다. 원격이 없으면 로컬 브랜치에서.
  git(["fetch", "origin", base], main);
  const from = git(["rev-parse", "--verify", "--quiet", `origin/${base}`], main).ok ? `origin/${base}` : base;
  const created = git(["worktree", "add", "-b", branch, path, from], main);
  if (!created.ok) fail(`작업 폴더를 만들지 못했습니다: ${created.err}`);

  const linked = linkNodeModules(main, path);
  console.log(`작업 폴더: ${path.replace(/\\/g, "/")}`);
  console.log(`브랜치: ${branch} (${from} 에서)`);
  console.log(`node_modules: ${linked}`);

  const prepare = settings["워크트리 준비"];
  if (prepare) {
    const r = withHeavyLock(`워크트리 준비 (${name})`, () => {
      console.log(`> 준비: ${prepare}`);
      return spawnSync(prepare, { cwd: path, shell: true, encoding: "utf8" });
    });
    if (r.status !== 0) console.log(`⚠️ 준비 명령 실패 — 그 폴더에서 다시 실행하세요:\n${`${r.stdout || ""}${r.stderr || ""}`.trim().slice(-800)}`);
  }
}

// 원래 폴더의 node_modules 를 링크(Windows 는 junction)로 연결한다.
function linkNodeModules(main, path) {
  const target = join(main, "node_modules");
  const link = join(path, "node_modules");
  if (!existsSync(target)) return "원래 폴더에 없음 — 연결하지 않음";
  if (existsSync(link)) return "이미 있음";
  symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
  return `원래 폴더 것을 연결함 (이 폴더에서 패키지를 설치하지 않는다)`;
}

function list(main) {
  const dir = worktreesDir(main).replace(/\\/g, "/").toLowerCase();
  const r = git(["worktree", "list", "--porcelain"], main);
  const rows = [];
  for (const block of r.out.split(/\n\n+/)) {
    const path = block.match(/^worktree (.+)$/m)?.[1];
    if (!path || !path.replace(/\\/g, "/").toLowerCase().startsWith(dir)) continue;
    const branch = block.match(/^branch refs\/heads\/(.+)$/m)?.[1] ?? "(브랜치 없음)";
    const dirty = git(["status", "--porcelain"], path).out.split("\n").filter(Boolean).length;
    rows.push(`- ${basename(path)} · ${branch} · 바뀐 파일 ${dirty}개 · ${path}`);
  }
  console.log(rows.length ? rows.join("\n") : "만든 작업 폴더가 없습니다.");
}

function remove(main, args) {
  const name = args.find((a) => !a.startsWith("--"));
  if (!name || !NAME.test(name)) fail("사용법: node han.mjs worktree remove <이름>");
  const path = join(worktreesDir(main), name);
  if (!existsSync(path)) fail(`없습니다: ${path}`);
  const dirty = git(["status", "--porcelain"], path).out.split("\n").filter(Boolean);
  if (dirty.length) fail(`바뀐 파일이 ${dirty.length}개 있어 지우지 않습니다 (커밋 · push 했는지 확인):\n${dirty.slice(0, 10).join("\n")}`);
  const branch = git(["branch", "--show-current"], path).out;

  // 연결한 node_modules 를 먼저 끊는다. 그대로 지우면 링크를 따라가 원래 폴더의 node_modules 까지 지울 수 있다.
  const link = join(path, "node_modules");
  if (existsSync(link) && lstatSync(link).isSymbolicLink()) unlinkSync(link);

  const removed = git(["worktree", "remove", path], main);
  if (!removed.ok) fail(`작업 폴더를 지우지 못했습니다: ${removed.err}`);
  console.log(`작업 폴더를 지웠습니다: ${path.replace(/\\/g, "/")}`);
  // 머지된 브랜치만 지운다 (-d). 아직 머지 전이면 브랜치는 남는다.
  if (branch) {
    const del = git(["branch", "-d", branch], main);
    console.log(del.ok ? `로컬 브랜치를 지웠습니다: ${branch}` : `로컬 브랜치 ${branch} 는 남겨 둠 (아직 머지 전이거나 원격에만 반영됨)`);
  }
}

// DB 마이그레이션 파일 이름에 쓸 시각. 지금 시각을 쓰되, 앞에서 받은 시각보다 1분 이상 뒤가 되게 한다.
// 마지막으로 준 시각은 모든 워크트리가 같이 쓰는 .git 폴더에 두어, 동시에 받아도 겹치지 않는다.
export function migrationStamp(root) {
  const dir = join(commonGitDir(root), "han-pipeline");
  ensureDir(dir);
  const file = join(dir, "migration-stamp");
  const release = acquireLock(join(dir, "stamp.lock"), "마이그레이션 시각", 200);
  try {
    let last = 0;
    try {
      last = Number(readFileSync(file, "utf8")) || 0;
    } catch {
      // 처음이면 0
    }
    const minute = Math.max(Math.floor(Date.now() / 60000), last + 1);
    writeFileSync(file, String(minute));
    const d = new Date(minute * 60000);
    const pad = (n) => String(n).padStart(2, "0");
    const day = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const hm = `${pad(d.getHours())}${pad(d.getMinutes())}`;
    console.log(`${day}${hm}00`);
    console.log(`(Flyway 형식: V${day}_${hm})`);
  } finally {
    release();
  }
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
