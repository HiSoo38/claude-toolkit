// 커밋 관문의 「빠른 테스트: 자동」 — 바꾼 파일에 딸린 테스트만 골라, 그 파일이 속한 패키지(앱) 폴더에서 돌린다.
// 관련 테스트까지 넓게 도는 vitest related · jest --findRelatedTests 는 공용 부품 하나만 고쳐도 그걸 쓰는 화면
// 테스트 수십 개를 돌려 메모리가 바닥났다. 넓은 테스트는 PR 직전 `check --full` 에서만 돈다.
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";

const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
const TEST_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];

/**
 * 바꾼 코드 파일에 딸린 테스트 파일(저장소 루트 기준). 바뀐 파일이 테스트면 그것, 아니면 같은 폴더 ·
 * `__tests__` 폴더의 같은 이름 테스트(`a.ts` → `a.test.ts(x)` · `a.spec.ts(x)`). 있는 파일만.
 */
export function testsFor(root, codeFiles) {
  const out = new Set();
  for (const f of codeFiles) {
    if (TEST_FILE.test(f)) {
      if (existsSync(join(root, f))) out.add(f);
      continue;
    }
    const dir = dirname(f);
    const name = basename(f, extname(f));
    for (const kind of ["test", "spec"]) {
      for (const ext of TEST_EXTS) {
        for (const d of [dir, `${dir}/__tests__`]) {
          const cand = `${d}/${name}.${kind}${ext}`.replace(/^\.\//, "");
          if (existsSync(join(root, cand))) out.add(cand);
        }
      }
    }
  }
  return [...out];
}

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

/** 파일에서 위로 올라가며 vitest · jest 를 쓰는 가장 가까운 package.json 폴더(저장소 루트 기준, 루트는 ""). */
function runnerFor(root, file) {
  let dir = dirname(file);
  for (;;) {
    const pkg = readJson(join(root, dir === "." ? "" : dir, "package.json"));
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const rel = dir === "." ? "" : dir;
      if (deps.vitest) return { dir: rel, runner: "vitest" };
      if (deps.jest) return { dir: rel, runner: "jest" };
    }
    if (dir === "." || dir === "" || dir === dirname(dir)) return null;
    dir = dirname(dir);
  }
}

/**
 * 돌릴 명령 목록 — 패키지(앱) 폴더마다 하나. 워커 하나, 테스트가 없으면 통과.
 * @returns {{cwd: string, command: string, files: string[]}[]} cwd 는 저장소 루트 기준
 */
export function quickTestPlan(root, codeFiles) {
  const groups = new Map();
  for (const t of testsFor(root, codeFiles)) {
    const r = runnerFor(root, t);
    if (!r) continue;
    const key = `${r.dir}|${r.runner}`;
    if (!groups.has(key)) groups.set(key, { ...r, files: [] });
    groups.get(key).files.push(t);
  }
  return [...groups.values()].map((g) => {
    const rel = g.files.map((f) => `"${relative(join(root, g.dir), join(root, f)).replace(/\\/g, "/")}"`).join(" ");
    const command =
      g.runner === "vitest"
        ? `npx vitest run ${rel} --maxWorkers=1 --minWorkers=1 --passWithNoTests`
        : `npx jest ${rel} --runInBand --passWithNoTests`;
    return { cwd: g.dir, command, files: g.files };
  });
}
