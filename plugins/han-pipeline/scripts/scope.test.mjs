// 타입 검사 경로 표시([경로]) 나누기 — 실행: node --test plugins/han-pipeline/scripts/scope.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { pathMarks, scopeByPath } from "./lib.mjs";

const MONO = "[apps/web,packages] tsc web && [apps/admin,packages] tsc admin";

test("바뀐 앱의 명령만 남긴다", () => {
  assert.equal(scopeByPath(MONO, ["apps/web/a.ts"]), "tsc web");
  assert.equal(scopeByPath(MONO, ["apps/admin/b.tsx"]), "tsc admin");
  assert.equal(scopeByPath(MONO, ["packages/types/x.ts"]), "tsc web && tsc admin");
  assert.equal(scopeByPath(MONO, ["apps/web/a.ts", "apps/admin/b.tsx"]), "tsc web && tsc admin");
});

test("해당 경로가 없으면 빈 문자열, 접두어만 비슷한 폴더는 맞지 않는다", () => {
  assert.equal(scopeByPath(MONO, ["apps/api/x.ts"]), "");
  assert.equal(scopeByPath(MONO, ["apps/webx/a.ts"]), "");
});

test("표시가 없으면 명령 그대로, 빈 설정은 빈 문자열", () => {
  assert.equal(scopeByPath("npx tsc --noEmit", ["a.ts"]), "npx tsc --noEmit");
  assert.equal(scopeByPath("a && b", ["a.ts"]), "a && b");
  assert.equal(scopeByPath("", ["a.ts"]), "");
});

test("첫 표시 앞의 표시 없는 명령은 늘 돈다", () => {
  assert.equal(scopeByPath("prep && [x] b", ["y/z.ts"]), "prep");
  assert.equal(scopeByPath("prep && [x] b", ["x/z.ts"]), "prep && b");
});

test("표시 하나가 다음 표시 앞까지 덮는다 — cd · 따옴표 안 && 도 한 덩어리", () => {
  const cd = "[apps/web] cd apps/web && npx tsc && [apps/admin] cd apps/admin && npx tsc";
  assert.equal(scopeByPath(cd, ["apps/web/a.ts"]), "cd apps/web && npx tsc");
  const quoted = '[apps/web] bash -c "cd apps/web && npx tsc"';
  assert.equal(scopeByPath(quoted, ["apps/web/a.ts"]), 'bash -c "cd apps/web && npx tsc"');
  assert.equal(scopeByPath(quoted, ["apps/admin/a.ts"]), "");
});

test("경로 표기를 맞춘다 — \\ · 앞의 ./ · 끝의 /", () => {
  const t = "[.\\apps\\web\\, ./packages/] tsc web";
  assert.deepEqual(pathMarks(t), ["apps/web", "packages"]);
  assert.equal(scopeByPath(t, ["apps/web/a.ts"]), "tsc web");
});

test("pathMarks 는 표시의 경로만 모은다", () => {
  assert.deepEqual(pathMarks(MONO), ["apps/web", "packages", "apps/admin", "packages"]);
  assert.deepEqual(pathMarks("npx tsc"), []);
  assert.deepEqual(pathMarks(""), []);
});
