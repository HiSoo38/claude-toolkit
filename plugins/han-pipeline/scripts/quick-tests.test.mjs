// 「빠른 테스트: 자동」의 테스트 고르기 — 실행: node --test plugins/han-pipeline/scripts/quick-tests.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { quickTestPlan, testsFor } from "./quick-tests.mjs";

function repo() {
  const root = mkdtempSync(join(tmpdir(), "han-qt-"));
  const files = {
    "package.json": "{}",
    "apps/web/package.json": JSON.stringify({ devDependencies: { vitest: "2" } }),
    "apps/web/src/a.tsx": "",
    "apps/web/src/a.test.tsx": "",
    "apps/web/src/b.ts": "",
    "apps/web/src/__tests__/b.spec.ts": "",
    "apps/web/src/c.ts": "",
    "apps/admin/package.json": JSON.stringify({ devDependencies: { jest: "29" } }),
    "apps/admin/src/d.test.ts": "",
  };
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, ".."), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

test("바꾼 소스의 같은 이름 테스트와 바꾼 테스트 파일만 고른다 — 테스트 없는 소스는 건너뛴다", () => {
  const root = repo();
  const picked = testsFor(root, ["apps/web/src/a.tsx", "apps/web/src/b.ts", "apps/web/src/c.ts", "apps/admin/src/d.test.ts"]);
  assert.deepEqual(picked.sort(), [
    "apps/admin/src/d.test.ts",
    "apps/web/src/__tests__/b.spec.ts",
    "apps/web/src/a.test.tsx",
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("테스트 도구가 있는 가장 가까운 패키지 폴더에서, 그 폴더 기준 경로로 워커 하나로 돌린다", () => {
  const root = repo();
  const plan = quickTestPlan(root, ["apps/web/src/a.tsx", "apps/admin/src/d.test.ts"]);
  assert.deepEqual(
    plan.map((p) => [p.cwd, p.command]),
    [
      ["apps/web", 'npx vitest run "src/a.test.tsx" --maxWorkers=1 --minWorkers=1 --passWithNoTests'],
      ["apps/admin", 'npx jest "src/d.test.ts" --runInBand --passWithNoTests'],
    ],
  );
  assert.deepEqual(quickTestPlan(root, ["apps/web/src/c.ts"]), []);
  rmSync(root, { recursive: true, force: true });
});
