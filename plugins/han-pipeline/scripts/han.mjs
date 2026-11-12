#!/usr/bin/env node
// han-pipeline 실행 도구.
//   node han.mjs start [--resume]  실행 표시를 켜고 이 프로젝트에 적용되는 설정을 보여 준다 (guard 훅이 이 표시를 보고 관문을 연다)
//   node han.mjs check   바뀐 파일 기준 검사를 하나씩 순서대로 돌리고 결과를 .git/han-pipeline/check.json 에 남긴다
//   node han.mjs run "<명령>"  무거운 명령(Codex · Playwright 등)을 메모리 확인 · 낮은 우선순위로 실행한다 (명령 전체를 따옴표 하나로)
//   node han.mjs status  실행 표시와 마지막 검사 결과가 지금 파일과 맞는지 보여 준다
//   node han.mjs stop    실행 표시를 끈다
//   node han.mjs worktree add <이름> [--fix] [--base <브랜치>] | list | remove <이름>   여러 기능을 동시에 할 때 기능마다 작업 폴더
//   node han.mjs stamp   DB 마이그레이션 파일 이름에 쓸 시각 (여러 워크트리가 동시에 받아도 1분 이상 간격)
// 모두 저장소 안 아무 폴더에서나 실행한다. check · run 의 무거운 일은 PC 전체에서 한 번에 하나만 돈다.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { constants, setPriority } from "node:os";
import { join } from "node:path";
import {
  changedFiles,
  pathMarks,
  scopeByPath,
  ensureDir,
  freeMB,
  git,
  measureBudget,
  readSettings,
  repoRoot,
  settingsPath,
  sleep,
  stateDir,
  treeFingerprint,
  withHeavyLock,
} from "./lib.mjs";
import { migrationStamp, worktreeCommand } from "./parallel.mjs";

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte)$/;
const SKIP_SECRET_SCAN = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|\.env\.example)$/;
const SECRET_PATTERN =
  /sb_secret_|sb_publishable_|sbp_|gh[pousr]_[A-Za-z0-9]|eyJhbGci|sk-[A-Za-z0-9]{10}|AKIA[0-9A-Z]{16}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|01[016789]-?[0-9]{3,4}-?[0-9]{4}/;
// 줄 세우지 않는 명령: 원격에서 계산하는 Codex (run 이 PC 전체 잠금 없이 바로 돌린다)
const LIGHT_REMOTE = /^\s*codex\s/;
const EMAIL_ALLOWED = /noreply|no-reply|example\.(com|org)|@anthropic\.com/;
// 무거운 검사 전에 필요한 남은 메모리(MB). check() 가 자원 예산으로 다시 정한다.
let minFreeMB = 1024;
// 검사 명령에 넘길 환경변수 (node 힙 한도 포함). check() 가 정한다.
let checkEnv = process.env;
let memoryWaitGaveUp = false;

const cwd = process.cwd();
const root = repoRoot(cwd);
if (!root) {
  console.error("git 저장소 안에서 실행하세요.");
  process.exit(2);
}
const dir = stateDir(root);
const cmd = process.argv[2];

if (cmd === "start") start();
else if (cmd === "check") check();
else if (cmd === "run") run(process.argv.slice(3));
else if (cmd === "status") status();
else if (cmd === "stop") stop();
else if (cmd === "worktree") worktreeCommand(root, process.argv.slice(3));
else if (cmd === "stamp") migrationStamp(root);
else {
  console.error('사용법: node han.mjs start | check | run "<명령>" | status | stop | worktree add|list|remove | stamp');
  process.exit(2);
}

// 이 프로세스와 여기서 띄우는 자식 프로세스를 낮은 우선순위로 돌린다.
// 사용자가 다른 프로그램을 쓰면 CPU 를 그쪽에 먼저 내준다 (Windows 는 자식이 우선순위를 물려받는다).
function lowerPriority() {
  try {
    setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    // 권한이 없으면 그대로 진행한다
  }
}

// 검사 명령 · Codex · Playwright 처럼 무거운 명령을 메모리 확인과 낮은 우선순위로 실행한다.
//   node han.mjs run "codex exec ..."
function run(args) {
  const command = (args[0] === "--" ? args.slice(1) : args).join(" ");
  if (!command) {
    console.error('사용법: node han.mjs run "<명령>"');
    process.exit(2);
  }
  const budget = measureBudget(readSettings(root)["자원 등급"]);
  minFreeMB = budget.minFreeMB;
  lowerPriority();
  const exec = () => spawnSync(command, { cwd, shell: true, stdio: "inherit", env: heapEnv(budget.heapMB) });
  // Codex 는 계산을 원격에서 해 이 PC 메모리를 거의 쓰지 않는다. 다른 세션의 검사 뒤에 줄 서지 않고 바로 돈다.
  if (LIGHT_REMOTE.test(command)) process.exit(exec().status ?? 1);
  const r = withHeavyLock(command.slice(0, 60), () => {
    waitForMemory("명령");
    return exec();
  });
  process.exit(r.status ?? 1);
}

// node 로 도는 검사(tsc · eslint · vitest)가 메모리를 끝없이 늘리지 않게 힙 한도를 건다.
function heapEnv(heapMB) {
  const prev = process.env.NODE_OPTIONS || "";
  if (/max-old-space-size/.test(prev)) return process.env;
  return { ...process.env, NODE_OPTIONS: `${prev} --max-old-space-size=${heapMB}`.trim() };
}

// 설정과 자원 예산을 실행 표시 파일에 같이 저장한다. guard 훅은 git 을 부르지 않고 이 파일만 읽는다.
function start() {
  ensureDir(dir);
  const s = readSettings(root);
  const budget = measureBudget(s["자원 등급"]);
  // "시작 전부터 바뀌어 있던 파일" (남의 작업일 수 있어 검사에서 빼고 건드리지 않는다).
  // 이어하기(--resume)는 처음 시작할 때 기록한 목록을 다시 쓴다. 지금 목록을 쓰면 끊기기 전 내 작업까지 남의 것으로 잡힌다.
  const savedPath = join(dir, "preexisting.json");
  const resume = process.argv.includes("--resume");
  let preexisting = resume ? readJsonFile(savedPath) : null;
  if (!Array.isArray(preexisting)) {
    preexisting = dirtyFiles();
    writeFileSync(savedPath, JSON.stringify(preexisting));
  }
  writeFileSync(join(dir, "active"), JSON.stringify({ at: Date.now(), root, settings: s, budget, preexisting }));
  const hasFile = existsSync(settingsPath(root));
  console.log(`han-pipeline 실행 표시를 켰습니다: ${root}`);
  console.log(`설정 파일: ${hasFile ? settingsPath(root) : "없음 — 아래는 자동 감지 · 기본값"}`);
  for (const [k, v] of Object.entries(s)) console.log(`- ${k}: ${v || "(없음)"}`);
  console.log("");
  printBudget(budget);
  if (preexisting.length) {
    console.log(`\n시작 전부터 바뀌어 있던 파일 ${preexisting.length}개 — 검사 대상에서 빼고, 건드리지 않는다:`);
    preexisting.slice(0, 20).forEach((f) => console.log(`- ${f}`));
  }
}

// 지금 커밋 안 된 변경 · 새 파일 목록.
// git() 은 출력 앞뒤 공백을 지워, 첫 줄 맨 앞의 상태 칸(" M")이 한 글자 줄고 첫 파일 이름이 잘린다.
// 그래서 여기서는 출력을 그대로 받는다. -z 는 경로를 따옴표 없이 NUL 로 나누고, 이름 바꾸기는 "XY 새이름\0옛이름" 이다.
function dirtyFiles() {
  const r = spawnSync("git", ["status", "--porcelain", "-z", "-uall"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) return [];
  const parts = (r.stdout || "").split("\0");
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    files.push(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") i++;
  }
  return files;
}

function readActive() {
  return readJsonFile(join(dir, "active"));
}

function readJsonFile(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function printBudget(b) {
  console.log(`자원 예산: ${b.level} (RAM ${b.totalGB}GB · 지금 남은 ${b.freeGB}GB · 코어 ${b.cores}개)`);
  console.log(`- 사용자 몫으로 남겨 둘 메모리: ${b.reserveGB}GB → 파이프라인이 쓸 수 있는 몫: ${Math.max(0, b.spareGB)}GB`);
  console.log(`- 무거운 일(tsc · eslint · 테스트 · 브라우저 · Codex): 한 번에 ${b.heavyAtOnce}개, 낮은 우선순위로 실행`);
  console.log(`- 리뷰어(Codex · Claude): ${b.reviewersInParallel ? "동시에" : "하나씩 차례로"}`);
  console.log(`- 테스트 워커: ${b.testWorkers}개 · 검사 프로세스 메모리 한도: ${b.heapMB}MB`);
  console.log(`- 화면 자동 테스트: ${b.browserTest ? "실행" : "건너뜀 (메모리 여유 없음 — 직접 확인 항목으로 넘김)"}`);
  console.log(`- 무거운 일을 띄우기 전 남은 메모리가 ${b.minFreeMB}MB 보다 적으면 최대 1분 기다린다`);
}

function stop() {
  rmSync(join(dir, "active"), { force: true });
  console.log("han-pipeline 실행 표시를 껐습니다.");
}

function status() {
  const activePath = join(dir, "active");
  console.log(`실행 표시: ${existsSync(activePath) ? "켜짐" : "꺼짐"}`);
  const result = readCheck();
  if (!result) return console.log("검사 결과: 없음");
  const fresh = result.fingerprint === treeFingerprint(root);
  console.log(`검사 결과: ${result.ok ? "통과" : "실패"} · ${fresh ? "지금 파일과 같음" : "그 뒤 파일이 바뀜 — 다시 검사 필요"}`);
}

function check() {
  const s = readSettings(root);
  const budget = measureBudget(s["자원 등급"]);
  minFreeMB = budget.minFreeMB;
  checkEnv = heapEnv(budget.heapMB);
  lowerPriority();
  const skip = new Set(readActive()?.preexisting ?? []);
  const changed = changedFiles(root, s);
  const base = changed.base;
  const files = changed.files.filter((f) => !skip.has(f));
  const code = files.filter((f) => CODE_EXT.test(f) && !f.endsWith(".d.ts"));
  const steps = [];

  console.log(`기준: ${base.slice(0, 8)} · 바뀐 파일 ${files.length}개 (코드 ${code.length}개)`);
  if (changed.files.length !== files.length) {
    console.log(`(시작 전부터 바뀌어 있던 파일 ${changed.files.length - files.length}개는 뺌)`);
  }

  steps.push(typeCheckStep(s["타입 검사"], code));
  steps.push(runCommand("린트", s["린트"], code.length > 0, code));
  steps.push(runCommand("테스트", s["테스트"], code.length > 0, code));
  const lengthExempt = new Set(s["파일 길이 예외"].split(",").map((f) => f.trim()).filter(Boolean));
  steps.push(checkLength(code.filter((f) => !lengthExempt.has(f)), base, Number(s["파일 길이 한도"]) || 0));
  steps.push(checkSecrets(files, base));

  const ok = steps.every((st) => st.status !== "fail");
  const result = { ok, fingerprint: treeFingerprint(root), at: new Date().toISOString(), base, steps };
  ensureDir(dir);
  writeFileSync(join(dir, "check.json"), JSON.stringify(result, null, 2));

  console.log("");
  for (const st of steps) console.log(`${mark(st.status)} ${st.name}${st.note ? ` — ${st.note}` : ""}`);
  for (const st of steps.filter((x) => x.status === "fail" && x.detail)) {
    console.log(`\n### ${st.name} 실패 내용\n${st.detail}`);
  }
  console.log(`\n결과: ${ok ? "통과" : "실패"} (.git/han-pipeline/check.json)`);
  process.exit(ok ? 0 : 1);
}

// 타입 검사 — 설정의 경로 표시([경로])대로 바뀐 앱의 명령만 돌린다. 표시의 경로가 저장소에 없으면
// (오타 · 옮긴 폴더) 조용히 건너뛰지 않고 실패로 알린다.
function typeCheckStep(template, code) {
  const name = "타입 검사";
  const missing = pathMarks(template).filter((p) => !existsSync(join(root, p)));
  if (missing.length > 0) {
    return { name, status: "fail", note: `설정 [경로] 표시에 없는 경로: ${missing.join(", ")}` };
  }
  const command = scopeByPath(template, code);
  if (template && code.length > 0 && !command) {
    return { name, status: "skip", note: "바뀐 경로에 해당하는 검사 없음 (설정의 [경로] 표시)" };
  }
  return runCommand(name, command, code.length > 0, []);
}

// 설정의 명령을 한 번 실행한다. {files} 는 바뀐 코드 파일 목록으로 바꾼다.
function runCommand(name, template, hasCode, targetFiles) {
  if (!template) return { name, status: "skip", note: "명령 없음 (설정의 '" + name + "' 칸)" };
  if (!hasCode) return { name, status: "skip", note: "바뀐 코드 파일 없음" };
  if (template.includes("{files}") && targetFiles.length === 0) {
    return { name, status: "skip", note: "대상 파일 없음" };
  }
  const command = template.replace("{files}", targetFiles.map((f) => `"${f}"`).join(" "));
  const r = withHeavyLock(`${name} (${root})`, () => {
    waitForMemory(name);
    console.log(`> ${name}: ${command}`);
    return spawnSync(command, {
      cwd: root,
      shell: true,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      env: checkEnv,
    });
  });
  const output = `${r.stdout || ""}${r.stderr || ""}`.trim();
  if (r.status === 0) return { name, status: "pass", note: command };
  return { name, status: "fail", note: command, detail: tail(output, 60) };
}

// 바뀐 코드 파일이 한도를 넘었고 이번 작업에서 더 길어졌으면 실패. 원래 길던 파일을 건드리기만 한 경우는 통과.
function checkLength(code, base, limit) {
  const name = "파일 길이";
  if (!limit) return { name, status: "skip", note: "한도 없음" };
  const over = [];
  for (const f of code) {
    const now = lineCount(readFileSync(join(root, f), "utf8"));
    if (now <= limit) continue;
    const prev = git(["show", `${base}:${f}`], root);
    const before = prev.ok ? lineCount(prev.out) : 0;
    if (now > before) over.push(`${f}: ${before} → ${now}줄 (한도 ${limit})`);
  }
  if (over.length === 0) return { name, status: "pass", note: `한도 ${limit}줄` };
  return {
    name,
    status: "fail",
    note: `${over.length}개 파일이 한도를 넘어 커짐`,
    detail: over.join("\n") + "\n→ 역할별로 나누거나, 나누지 않는 이유를 계획서 '구조 설계' 에 적고 사용자에게 알린다.",
  };
}

// 이번 작업에서 더한 줄에 키 · 토큰 · 이메일 · 전화번호가 있는지 본다.
function checkSecrets(files, base) {
  const name = "민감 정보";
  const hits = [];
  for (const f of files) {
    if (SKIP_SECRET_SCAN.test(f)) continue;
    const tracked = git(["cat-file", "-e", `${base}:${f}`], root).ok;
    let added;
    if (tracked) {
      added = git(["diff", "-U0", base, "--", f], root)
        .out.split("\n")
        .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
        .map((l) => l.slice(1));
    } else {
      const p = join(root, f);
      if (statSync(p).size > 1024 * 1024) continue;
      const text = readFileSync(p, "utf8");
      if (text.includes("\u0000")) continue;
      added = text.split(/\r?\n/);
    }
    for (const line of added) {
      const m = line.match(SECRET_PATTERN);
      if (m && !(m[0].includes("@") && EMAIL_ALLOWED.test(m[0]))) hits.push(`${f}: ${m[0].slice(0, 12)}…`);
    }
  }
  if (hits.length === 0) return { name, status: "pass" };
  return {
    name,
    status: "fail",
    note: `${hits.length}건`,
    detail: hits.slice(0, 30).join("\n") + "\n→ 실제 비밀값이면 지우고 환경변수로 옮긴다. 테스트용 가짜 값이면 example.com 같은 값으로 바꾼다.",
  };
}

// 무거운 일을 띄우기 전에 남은 메모리를 본다. 모자라면 10초씩 최대 6번 기다리고, 그래도 모자라면 알리고 진행한다.
// (검사를 건너뛰면 관문이 무의미해지므로 멈추지는 않는다. 대신 낮은 우선순위 · 힙 한도로 부담을 줄인다.)
function waitForMemory(name) {
  const need = minFreeMB;
  // 한 번 1분을 기다려도 모자랐으면 원래 메모리가 빠듯한 PC 다. 같은 실행 안에서는 다시 기다리지 않는다.
  if (memoryWaitGaveUp) return;
  for (let i = 0; i < 6 && freeMB() < need; i++) {
    console.log(`… ${name}: 남은 메모리 ${freeMB()}MB < ${need}MB — 10초 기다림 (${i + 1}/6)`);
    sleep(10_000);
  }
  if (freeMB() < need) {
    memoryWaitGaveUp = true;
    console.log(`⚠️ ${name}: 메모리가 여전히 부족합니다 (${freeMB()}MB). 낮은 우선순위로 진행합니다. 다른 프로그램을 닫으면 빨라집니다.`);
  }
}

function readCheck() {
  try {
    return JSON.parse(readFileSync(join(dir, "check.json"), "utf8"));
  } catch {
    return null;
  }
}

function lineCount(text) {
  return text.split(/\r?\n/).length;
}

function tail(text, n) {
  const lines = text.split(/\r?\n/);
  return lines.slice(-n).join("\n");
}

function mark(status) {
  return status === "pass" ? "✅" : status === "fail" ? "❌" : "⏭️";
}
