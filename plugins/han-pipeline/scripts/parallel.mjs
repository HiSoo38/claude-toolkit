// 여러 기능을 동시에 진행할 때 쓰는 명령 (han.mjs worktree · stamp).
//   worktree add <이름> [--fix] [--base <브랜치>] [--branch <브랜치 이름>] [--launch --prompt-file <파일>]
//                                                   저장소 밖 <저장소>.worktrees/<이름> 에 기능 브랜치 작업 폴더를 만든다.
//                                                   --launch: Orca 가 켜져 있으면 그 작업공간에 Claude 를 띄운다
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
  fail(
    "사용법: node han.mjs worktree add <이름> [--fix] [--base <브랜치>] [--branch <브랜치 이름>] [--launch --prompt-file <파일>] | list | remove <이름>",
  );
}

// 작업 폴더는 저장소 밖 옆 폴더에 둔다. 저장소 안에 두면 타입 검사 · 린트가 다른 기능의 파일까지 읽는다.
function worktreesDir(main) {
  return join(dirname(main), `${basename(main)}.worktrees`);
}

// 값을 받는 옵션 — 그 다음 칸은 작업 이름이 아니다.
const VALUE_FLAGS = new Set(["--base", "--branch", "--prompt-file"]);

function flagValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function add(main, args) {
  const name = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.has(args[i - 1]));
  if (!name || !NAME.test(name)) fail("이름은 kebab-case 영어로 (예: tasks-calendar).");
  const settings = readSettings(main);
  const base = flagValue(args, "--base") ?? settings["통합 브랜치"];
  // 브랜치 이름 규칙이 프로젝트마다 달라(feat/… · feature/…) 직접 줄 수 있게 한다. 없으면 feature/<이름> · fix/<이름>.
  const branch = flagValue(args, "--branch") ?? `${args.includes("--fix") ? "fix" : "feature"}/${name}`;
  const promptFile = flagValue(args, "--prompt-file");
  if (args.includes("--launch") && (!promptFile || !existsSync(promptFile))) {
    fail("--launch 에는 --prompt-file <지시문 파일> 이 필요합니다 (작업 폴더를 만들기 전에 확인).");
  }
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

  if (args.includes("--launch")) launchInOrca(path, readFileSync(promptFile, "utf8").trim());
}

// Orca 명령줄 도구 위치 — 환경변수 ORCA_BIN, PATH, 기본 설치 위치 순.
// Windows 의 `where orca` 는 orca.cmd 를 orca.exe 보다 먼저 돌려준다. spawnSync 는 .cmd · .bat 을 셸 없이
// 실행하지 못하므로(EINVAL) Windows 에서는 ORCA_BIN 도 PATH 결과도 .exe 만 쓴다.
function findOrca() {
  const win = process.platform === "win32";
  const runnable = (p) => Boolean(p) && existsSync(p) && (!win || p.toLowerCase().endsWith(".exe"));
  if (runnable(process.env.ORCA_BIN)) return process.env.ORCA_BIN;
  const which = spawnSync(win ? "where" : "which", ["orca"], { encoding: "utf8" });
  const lines = which.status === 0 ? which.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  const found = lines.find(runnable);
  if (found) return found;
  // LOCALAPPDATA 가 없으면 기본 위치를 만들지 않는다 — 빈 값이면 현재 폴더 기준 상대경로가 된다.
  const candidates = win
    ? process.env.LOCALAPPDATA
      ? [join(process.env.LOCALAPPDATA, "Programs", "orca", "resources", "bin", "orca.exe")]
      : []
    : ["/Applications/Orca.app/Contents/Resources/bin/orca"];
  return candidates.find((c) => existsSync(c));
}

// Orca(작업공간마다 에이전트를 띄워 보여 주는 데스크톱 앱)가 켜져 있으면 이 작업 폴더의 작업공간에 Claude 를 띄운다.
// 사용자가 진행을 화면에서 보고 중간에 답할 수 있다. 결과는 `launch:` 한 줄로 남긴다 —
//   launch: orca …      띄웠다. 지휘 세션은 그 세션이 끝나며 보내는 메시지를 기다린다.
//   launch: fallback …  못 띄웠다(Orca 없음 · 꺼짐 · 실행 불가 · 거절). 지휘 세션이 자기 안의 하위 에이전트로 대신한다.
//   launch: unknown …   띄웠는지 모른다(응답 유실 · 시간 초과 · 강제 종료). Orca 화면에서 그 작업공간을 사람이 확인한다.
// 실행 응답을 못 받았어도 다시 띄우지 않는다 — 같은 작업공간에 Claude 가 둘 생긴다(Orca 안내: 새로 띄워 재시도하지 말 것).
function launchInOrca(path, prompt) {
  const orca = findOrca();
  if (!orca) return console.log("launch: fallback (Orca 를 찾지 못함)");

  const status = spawnSync(orca, ["status", "--json"], { encoding: "utf8", timeout: 20000 });
  // 실행 자체를 못 했으면(EINVAL · ENOENT 등) '꺼짐' 과 섞지 않고 원인 코드를 남긴다
  if (status.error && status.error.code !== "ETIMEDOUT") {
    return console.log(`launch: fallback (Orca 실행 불가: ${status.error.code} — ${orca})`);
  }
  let reachable = false;
  try {
    reachable = JSON.parse(status.stdout).result?.runtime?.reachable === true;
  } catch {
    // 응답이 JSON 이 아니면 꺼진 것으로 본다
  }
  if (!reachable) return console.log("launch: fallback (Orca 가 꺼져 있거나 응답이 없음)");

  const worktree = `path:${path.replace(/\\/g, "/")}`;
  const r = spawnSync(orca, ["agent", "launch", "--agent", "claude", "--worktree", worktree, "--prompt", prompt, "--focus"], {
    encoding: "utf8",
    timeout: 120000,
  });
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  if (r.status !== 0) {
    const retry = out.match(/--retry-launch\s+(\S+)/)?.[1];
    if (retry) {
      return console.log(
        `launch: unknown (응답을 못 받음 — Orca 화면에서 그 작업공간을 확인. 같은 폴더에서 다시 하려면 --retry-launch ${retry})`,
      );
    }
    // 시간 초과 · 신호로 끊긴 경우는 Orca 가 요청을 이미 받았을 수 있다 — fallback 으로 하위 에이전트를 또 띄우면
    // 같은 작업 폴더에 Claude 가 둘 생기므로 unknown 으로 낸다.
    if (r.error?.code === "ETIMEDOUT" || r.signal) {
      return console.log(
        `launch: unknown (${r.error?.code === "ETIMEDOUT" ? "응답 시간 초과" : `강제 종료 ${r.signal}`} — Orca 화면에서 그 작업공간을 확인. 다시 띄우지 않는다)`,
      );
    }
    // 여기부터는 실행이 시작되지 않았거나(EINVAL · ENOENT · ENAMETOOLONG 등) Orca 가 거절한 경우라 다시 띄워도 겹치지 않는다
    const cause = r.error ? `${r.error.code} ` : "";
    return console.log(`launch: fallback (Orca 실행 실패: ${cause}${out.slice(-300)})`);
  }
  console.log(`launch: orca (${worktree})`);
  console.log(out);
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
