// 작업 폴더 준비(node_modules 연결 · 무시 파일 복사 · 지우기 전 연결 끊기) — 실행: node --test plugins/han-pipeline/scripts/worktree.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyIgnoredFiles, linkNodeModules, nodeModulesDirs, unlinkAll } from "./parallel.mjs";

function monorepo() {
  const root = mkdtempSync(join(tmpdir(), "han-wt-"));
  const main = join(root, "main");
  const wt = join(root, "wt");
  for (const p of ["", "apps/web", "apps/admin", "packages/ui"]) {
    mkdirSync(join(main, p, "node_modules", "x"), { recursive: true });
    writeFileSync(join(main, p, "package.json"), "{}");
    mkdirSync(join(wt, p), { recursive: true });
  }
  mkdirSync(join(main, "apps/api/src/test/resources"), { recursive: true });
  writeFileSync(join(main, "apps/api/src/test/resources/application.properties"), "a=1");
  mkdirSync(join(wt, "apps/api/src/test/resources"), { recursive: true });
  return { root, main, wt };
}

test("루트와 앱 · 패키지의 node_modules 를 모두 찾는다", () => {
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

test("설정의 무시 파일을 복사하고, 없는 파일 · 이미 있는 파일은 건너뛴다", () => {
  const { root, main, wt } = monorepo();
  const list = "apps/api/src/test/resources/application.properties, apps/api/없는파일.properties";
  assert.deepEqual(copyIgnoredFiles(main, wt, list), ["apps/api/src/test/resources/application.properties"]);
  assert.equal(readFileSync(join(wt, "apps/api/src/test/resources/application.properties"), "utf8"), "a=1");
  assert.deepEqual(copyIgnoredFiles(main, wt, list), []);
  rmSync(root, { recursive: true, force: true });
});
