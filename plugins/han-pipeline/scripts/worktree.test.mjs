// 작업 폴더 준비(node_modules 연결 · 무시 파일 복사 · 지우기 전 연결 끊기) — 실행: node --test plugins/han-pipeline/scripts/worktree.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyIgnoredFiles, linkNodeModules, nodeModulesDirs, unlinkAll } from "./parallel.mjs";

const PROPS = "apps/api/src/test/resources/application.properties";

function monorepo() {
  const root = mkdtempSync(join(tmpdir(), "han-wt-"));
  const main = join(root, "main");
  const wt = join(root, "wt");
  for (const p of ["", "apps/web", "apps/admin", "packages/ui"]) {
    mkdirSync(join(main, p, "node_modules", "x"), { recursive: true });
    writeFileSync(join(main, p, "package.json"), "{}");
    mkdirSync(join(wt, p), { recursive: true });
  }
  // node_modules 안의 패키지에 또 node_modules 가 있어도 그 안으로 들어가지 않아야 한다.
  mkdirSync(join(main, "node_modules", "foo", "node_modules"), { recursive: true });
  writeFileSync(join(main, "node_modules", "foo", "package.json"), "{}");
  mkdirSync(join(main, "apps/api/src/test/resources"), { recursive: true });
  writeFileSync(join(main, PROPS), "a=1");
  writeFileSync(join(main, "apps/api/tracked.txt"), "t");
  writeFileSync(join(main, ".gitignore"), "node_modules/\n*.properties\n");
  spawnSync("git", ["init", "-q"], { cwd: main });
  mkdirSync(join(wt, "apps/api/src/test/resources"), { recursive: true });
  return { root, main, wt };
}

test("루트와 앱 · 패키지의 node_modules 를 찾고, node_modules 안으로는 들어가지 않는다", () => {
  const { root, main } = monorepo();
  assert.deepEqual(nodeModulesDirs(main).sort(), ["", "apps/admin", "apps/web", "packages/ui"]);
  rmSync(root, { recursive: true, force: true });
});

test("앱별 node_modules 까지 연결하고, 지우기 전에 연결만 끊어 원래 폴더 것은 남는다", () => {
  const { root, main, wt } = monorepo();
  const msg = linkNodeModules(main, wt);
  assert.match(msg, /apps\/web/);
  for (const p of ["", "apps/web", "apps/admin", "packages/ui"]) {
    assert.ok(lstatSync(join(wt, p, "node_modules")).isSymbolicLink(), `${p || "."} 연결`);
  }
  unlinkAll(wt);
  for (const p of ["", "apps/web", "apps/admin", "packages/ui"]) {
    assert.ok(!existsSync(join(wt, p, "node_modules")), `${p || "."} 연결 끊김`);
    assert.ok(existsSync(join(main, p, "node_modules", "x")), `${p || "."} 원래 것 그대로`);
  }
  rmSync(root, { recursive: true, force: true });
});

test("작업 폴더에 진짜 node_modules(캐시)가 이미 있으면 연결하지 않고, 끊을 때도 지우지 않는다", () => {
  const { root, main, wt } = monorepo();
  mkdirSync(join(wt, "apps/web/node_modules/.vite"), { recursive: true });
  linkNodeModules(main, wt);
  assert.ok(!lstatSync(join(wt, "apps/web/node_modules")).isSymbolicLink());
  unlinkAll(wt);
  assert.ok(existsSync(join(wt, "apps/web/node_modules/.vite")));
  rmSync(root, { recursive: true, force: true });
});

test("git 이 무시하는 파일만 복사하고, 없는 파일 · 이미 있는 파일 · 저장소 밖 경로는 건너뛴다", () => {
  const { root, main, wt } = monorepo();
  const list = `${PROPS}, apps/api/없는파일.properties, apps/api/tracked.txt, ../밖.properties`;
  assert.deepEqual(copyIgnoredFiles(main, wt, list), [PROPS]);
  assert.equal(readFileSync(join(wt, PROPS), "utf8"), "a=1");
  assert.ok(!existsSync(join(wt, "apps/api/tracked.txt")), "무시되지 않는 파일은 복사하지 않음");
  assert.deepEqual(copyIgnoredFiles(main, wt, list), []);
  rmSync(root, { recursive: true, force: true });
});
