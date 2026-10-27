#!/usr/bin/env python3
"""dev-pipeline 에이전트가 시작하고 끝날 때마다 공용 진행 로그에 한 줄씩 남기는 훅.

- PreToolUse(Agent): dev-pipeline 에이전트를 부르기 직전 → "<에이전트> 시작 — <작업 설명>"
- SubagentStop: dev-pipeline 에이전트가 끝났을 때 → "<에이전트> 끝 (<걸린 분>) — <마지막 응답 첫 줄>"

로그 위치는 `<git 공용 폴더>/dev-pipeline/progress.log` 이다. 모든 worktree 가 같은 git 공용 폴더를 쓰므로
병렬 작업의 기록이 한 파일에 모이고, git 이 추적하지 않아 커밋되지 않는다.
사람은 `tail -f` 나 `/dev-pipeline:wave-status` 로 본다.

어떤 경우에도 작업을 막지 않는다: 출력 없이 exit 0 으로 끝낸다.
"""

import json
import os
import subprocess
import sys
import time

PLUGIN_PREFIX = "dev-pipeline:"
SUMMARY_LIMIT = 100
STARTS_FILE = "agent-starts.json"


def git(cwd, *args):
    try:
        out = subprocess.run(
            ["git", "-C", cwd] + list(args),
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.decode("utf-8", "replace").strip()


def one_line(text):
    for line in (text or "").splitlines():
        line = line.strip().lstrip("#*- ").strip()
        if line:
            return line[:SUMMARY_LIMIT] + ("…" if len(line) > SUMMARY_LIMIT else "")
    return ""


def load_starts(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_starts(path, starts):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(starts, f, ensure_ascii=False)
    except OSError:
        pass


def main():
    try:
        # Claude Code 는 훅 입력을 UTF-8 로 보낸다. Windows 의 기본 stdin 인코딩(cp949 등)으로 읽으면 한글이 깨진다
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except (ValueError, OSError):
        return

    event = payload.get("hook_event_name")
    if event == "PreToolUse":
        tool_input = payload.get("tool_input") or {}
        agent_type = tool_input.get("subagent_type") or ""
        detail = one_line(tool_input.get("description") or tool_input.get("prompt"))
    elif event == "SubagentStop":
        agent_type = payload.get("agent_type") or ""
        detail = one_line(payload.get("last_assistant_message"))
    else:
        return
    if not agent_type.startswith(PLUGIN_PREFIX):
        return

    cwd = payload.get("cwd") or os.getcwd()
    common = git(cwd, "rev-parse", "--path-format=absolute", "--git-common-dir")
    if not common:
        return
    log_dir = os.path.join(common, "dev-pipeline")
    try:
        os.makedirs(log_dir, exist_ok=True)
    except OSError:
        return

    branch = git(cwd, "rev-parse", "--abbrev-ref", "HEAD") or "?"
    agent = agent_type[len(PLUGIN_PREFIX):]
    starts_path = os.path.join(log_dir, STARTS_FILE)
    key = "{0}|{1}".format(branch, agent)

    if event == "PreToolUse":
        starts = load_starts(starts_path)
        starts[key] = time.time()
        save_starts(starts_path, starts)
        message = "{0} 시작{1}".format(agent, " — " + detail if detail else "")
    else:
        starts = load_starts(starts_path)
        began = starts.pop(key, None)
        save_starts(starts_path, starts)
        took = " ({0}분)".format(max(1, round((time.time() - began) / 60))) if began else ""
        message = "{0} 끝{1}{2}".format(agent, took, " — " + detail if detail else "")

    line = "{0}  [{1}]  {2}\n".format(time.strftime("%Y-%m-%d %H:%M"), branch, message)
    try:
        with open(os.path.join(log_dir, "progress.log"), "a", encoding="utf-8") as f:
            f.write(line)
    except OSError:
        pass


if __name__ == "__main__":
    main()
