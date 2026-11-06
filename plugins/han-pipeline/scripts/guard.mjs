#!/usr/bin/env node
// Claude Code PreToolUse 훅 (Bash · PowerShell). han-pipeline 실행 표시가 켜진 저장소에서만 동작한다.
// hooks.json 의 `if` 필터로 git · gh · DB · 배포 명령일 때만 이 프로세스가 뜬다 (평소 명령에는 실행되지 않는다).
//  1) 사람만 하는 명령을 막는다: 배포 브랜치 머지 · push, force push, DB 적용 · 직접 쿼리, 운영 배포 · 비밀값 변경
//  2) 커밋 · PR 생성 전에 `han.mjs check` 가 통과했고 그 뒤 파일이 안 바뀌었는지 확인한다
// 실행 표시가 없거나 저장소 밖이면 아무것도 하지 않는다. 사용자가 터미널에서 직접 치는 명령(`!` 포함)에는 걸리지 않는다.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { branchFromHead, commandDir, findGitDirFast, readActive, treeFingerprint } from "./lib.mjs";

// 안내 문구에 넣을 검사 명령. 플러그인이 설치된 위치는 사용자마다 달라서 이 파일 위치에서 구한다.
const SCRIPT = `node "${join(dirname(fileURLToPath(import.meta.url)), "han.mjs").replace(/\\/g, "/")}"`;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", () => {
  try {
    main(JSON.parse(input || "{}"));
  } catch {
    process.exit(0); // 훅 자체 오류로 작업을 막지 않는다
  }
});

// 평소(실행 표시 없음)에는 파일 몇 개만 보고 끝난다. git 은 커밋 · PR 생성 · PR 머지 명령일 때만 부른다.
function main(event) {
  const command = event?.tool_input?.command;
  if (typeof command !== "string" || !command.trim()) return;
  // `cd <워크트리> && git commit` 처럼 다른 폴더에서 도는 명령은 그 폴더의 저장소 · 실행 표시를 본다.
  const found = findGitDirFast(commandDir(command, event.cwd || process.cwd()));
  if (!found) return;
  const active = readActive(found.gitDir);
  if (!active?.settings) return;

  const { root, gitDir } = found;
  const reason =
    humanOnlyReason(command, root, gitDir, active.settings) ||
    checkGateReason(command, root, join(gitDir, "han-pipeline"));
  if (reason) deny(reason);
}

// 사람만 하는 명령이면 그 이유를 돌려준다.
function humanOnlyReason(command, root, gitDir, settings) {
  const deploy = escapeRegex(settings["배포 브랜치"]);
  const onDeploy = branchFromHead(gitDir) === settings["배포 브랜치"];

  const rules = [
    [/\bgit\s+push\b[^;&|\n]*(\s--force\b|\s-f\b|--force-with-lease)/, "force push"],
    [new RegExp(`\\bgit\\s+push\\b[^;&|\\n]*[\\s:]${deploy}(\\s|$)`), `배포 브랜치(${settings["배포 브랜치"]}) push`],
    [new RegExp(`\\bgit\\s+(switch|checkout)\\s+${deploy}\\b[\\s\\S]*\\bgit\\s+merge\\b`), `배포 브랜치(${settings["배포 브랜치"]}) 머지`],
    [/\bsupabase\s+(db\s+(push|reset|query|execute)|migration\s+(up|repair|squash)|secrets\s+(set|unset))\b/, "DB 적용 · 직접 쿼리 · 비밀값 변경"],
    [/\b(psql|mysql|sqlcmd|mongosh)\b/, "DB 직접 접속"],
    [/\bflyway\b[^;&|\n]*\b(migrate|clean|repair|undo)\b/, "DB 마이그레이션 적용"],
    [/\bprisma\s+(migrate\s+(deploy|reset|dev)|db\s+(push|execute))\b/, "DB 적용"],
    [/\bdrizzle-kit\s+(push|migrate)\b/, "DB 적용"],
    [/\bvercel\b[^;&|\n]*(--prod\b|\benv\s+(add|rm|pull)\b|\bpromote\b)/, "운영 배포 · 환경변수 변경"],
  ];
  for (const [re, label] of rules) if (re.test(command)) return label;

  if (onDeploy && /\bgit\s+(merge|push)\b/.test(command)) return `배포 브랜치(${settings["배포 브랜치"]})에서 머지 · push`;

  if (/\bgh\s+pr\s+merge\b/.test(command)) {
    const base = prBase(command, root);
    if (!base) return "머지할 PR 의 대상 브랜치를 확인하지 못함";
    if (base === settings["배포 브랜치"]) return `배포 브랜치(${base}) 대상 PR 머지`;
  }
  return null;
}

function prBase(command, root) {
  const num = command.match(/\bgh\s+pr\s+merge\s+(\d+)/)?.[1];
  const args = ["pr", "view", ...(num ? [num] : []), "--json", "baseRefName", "-q", ".baseRefName"];
  const r = spawnSync("gh", args, { cwd: root, encoding: "utf8", timeout: 8000 });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

// 커밋 · PR 생성이면 마지막 검사가 통과했고 지금 파일과 같은지 본다.
function checkGateReason(command, root, dir) {
  if (!/\bgit\s+commit\b|\bgh\s+pr\s+create\b/.test(command)) return null;
  let result;
  try {
    result = JSON.parse(readFileSync(join(dir, "check.json"), "utf8"));
  } catch {
    return `GATE:검사 결과가 없습니다. 먼저 \`${SCRIPT} check\` 를 실행하세요.`;
  }
  if (!result.ok) return `GATE:마지막 검사가 실패했습니다. 고친 뒤 \`${SCRIPT} check\` 를 다시 실행하세요.`;
  if (result.fingerprint !== treeFingerprint(root)) {
    return `GATE:검사 뒤에 파일이 바뀌었습니다. \`${SCRIPT} check\` 를 다시 실행하세요.`;
  }
  return null;
}

function deny(reason) {
  const message = reason.startsWith("GATE:")
    ? `[han-pipeline 검사 관문] ${reason.slice(5)}`
    : `[han-pipeline] '${reason}' 은(는) 사람이 직접 하는 작업입니다. 실행하지 말고, 사용자에게 실행할 명령과 이유를 적어 보여 준 뒤 멈추세요.`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: message,
      },
    }),
  );
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
