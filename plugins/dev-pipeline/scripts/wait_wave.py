"""웨이브 작업들이 끝나거나 멈출 때까지 Orca 를 주기적으로 조회하고, 끝나면 작업별 상태를 출력한다.

/dev-pipeline:build 가 백그라운드로 실행한다. 이 스크립트가 끝나면 그 세션이 다시 깨어나
결과를 보고 머지 · 다음 웨이브 · 멈춘 작업 처리를 이어간다.

사용: python wait_wave.py --repo <레포 루트> --branches t2-a,t3-b [--interval 60] [--stall-min 15] [--timeout-min 240]

작업 상태 판정 (Orca worktree 카드 기준):
- done     : workspaceStatus 가 in-review (리뷰 통과)
- attention: 코멘트가 "중단" 또는 "블로커" 로 시작 (사람 확인 필요)
- stalled  : in-progress 인데 그 worktree 터미널 출력이 stall-min 분 넘게 없음
             (사용량 한도 · 질문 대기 · 비정상 종료 등으로 멈춘 것)
- missing  : 그 브랜치의 worktree 가 없음
- running  : 위에 해당하지 않음 — 이 상태가 하나라도 있으면 계속 기다린다
"""

import argparse
import json
import subprocess
import sys
import time


def orca_json(args):
    try:
        out = subprocess.run(["orca", *args, "--json"], capture_output=True, timeout=60)
    except (OSError, subprocess.TimeoutExpired):
        return None
    try:
        data = json.loads(out.stdout.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    return data.get("result") if data.get("ok") else None


def norm_branch(name):
    return (name or "").replace("refs/heads/", "")


def last_output_ms(worktree_path):
    result = orca_json(["terminal", "list", "--worktree", f"path:{worktree_path}"])
    if not result:
        return None
    times = [t.get("lastOutputAt") or 0 for t in result.get("terminals", [])]
    return max(times) if times else None


def classify(branch, rows, now_ms, stall_ms):
    row = next((r for r in rows if norm_branch(r.get("branch")) == branch), None)
    if row is None:
        return {"branch": branch, "state": "missing"}
    comment = row.get("comment") or ""
    info = {
        "branch": branch,
        "path": row.get("path"),
        "workspaceStatus": row.get("workspaceStatus"),
        "comment": comment,
    }
    if row.get("workspaceStatus") == "in-review":
        info["state"] = "done"
    elif comment.startswith("중단") or comment.startswith("블로커"):
        info["state"] = "attention"
    else:
        last = max(last_output_ms(row.get("path")) or 0, row.get("lastActivityAt") or 0)
        idle_min = max(0, now_ms - last) / 60000 if last else None
        info["idleMinutes"] = round(idle_min, 1) if idle_min is not None else None
        info["state"] = "stalled" if last and now_ms - last > stall_ms else "running"
    return info


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--repo", required=True)
    p.add_argument("--branches", required=True)
    p.add_argument("--interval", type=int, default=60)
    p.add_argument("--stall-min", type=int, default=15)
    p.add_argument("--timeout-min", type=int, default=240)
    a = p.parse_args()

    branches = [b.strip() for b in a.branches.split(",") if b.strip()]
    stall_ms = a.stall_min * 60000
    deadline = time.time() + a.timeout_min * 60
    states = []
    unreachable = 0

    while True:
        result = orca_json(["worktree", "list", "--repo", f"path:{a.repo}"])
        if result is None:
            states = [{"branch": b, "state": "orca-unreachable"} for b in branches]
            unreachable += 1
            # Orca 앱이 꺼진 경우: 3번 연속 실패하면 기다리지 않고 알린다
            if unreachable >= 3:
                break
        else:
            unreachable = 0
            now_ms = int(time.time() * 1000)
            rows = result.get("worktrees", [])
            states = [classify(b, rows, now_ms, stall_ms) for b in branches]
            if all(s["state"] != "running" for s in states):
                break
        if time.time() > deadline:
            for s in states:
                if s["state"] == "running":
                    s["state"] = "timeout"
            break
        time.sleep(a.interval)

    sys.stdout.buffer.write(
        json.dumps({"tasks": states}, ensure_ascii=False, indent=2).encode("utf-8") + b"\n"
    )


if __name__ == "__main__":
    main()
