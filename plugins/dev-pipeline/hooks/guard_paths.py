#!/usr/bin/env python3
"""dev-pipeline 에이전트의 파일 쓰기 위치를 강제하는 PreToolUse 훅.

Claude Code 가 Write / Edit / NotebookEdit 호출 직전에 stdin 으로 넘기는 JSON 을 읽고,
호출한 서브에이전트(agent_type)에 따라 허용 여부를 정한다.

- planner, db-designer, api-designer : 프로젝트의 docs/ 아래만 쓸 수 있다
- implementer                        : docs/ 아래는 쓸 수 없다 (계약 문서 보호)
- reviewer, plan-reviewer            : 아무 데도 쓸 수 없다
- 그 밖의 에이전트·메인 세션          : 관여하지 않는다

막을 때는 permissionDecision "deny" JSON 을 출력하고 exit 0 으로 끝낸다.
입력을 해석할 수 없으면 관여하지 않고 통과시킨다 (다른 플러그인·세션을 막지 않기 위해).
"""

import json
import os
import sys

PLUGIN_NAME = "dev-pipeline"
DOCS_ONLY_AGENTS = {"planner", "db-designer", "api-designer"}
NO_DOCS_AGENTS = {"implementer"}
READ_ONLY_AGENTS = {"reviewer", "plan-reviewer"}
DOCS_DIR = "docs"


def agent_role(agent_type):
    """'dev-pipeline:planner' 또는 'planner' 를 'planner' 로 바꾼다. 다른 플러그인 에이전트면 None."""
    if not agent_type:
        return None
    parts = agent_type.split(":")
    if len(parts) > 1 and parts[0] != PLUGIN_NAME:
        return None
    return parts[-1]


def normalize(path):
    return os.path.normcase(os.path.realpath(path))


def is_inside(path, directory):
    path, directory = normalize(path), normalize(directory)
    try:
        return os.path.commonpath([path, directory]) == directory
    except ValueError:
        # Windows 에서 드라이브가 다르면 commonpath 가 실패한다
        return False


def deny(reason):
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            },
            # 한글 사유를 \uXXXX 로 내보내 콘솔 인코딩(cp949 등)과 무관하게 전달한다
            ensure_ascii=True,
        )
    )
    sys.exit(0)


def main():
    try:
        # Claude Code 는 훅 입력을 UTF-8 로 보낸다. Windows 의 기본 stdin 인코딩(cp949 등)으로 읽으면 한글 경로가 깨진다
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except (ValueError, OSError):
        return

    role = agent_role(payload.get("agent_type"))
    if role not in DOCS_ONLY_AGENTS | NO_DOCS_AGENTS | READ_ONLY_AGENTS:
        return

    if role in READ_ONLY_AGENTS:
        deny("dev-pipeline:{0} 는 읽기 전용이다. 파일을 수정하지 말고 리뷰 결과만 보고하라.".format(role))

    tool_input = payload.get("tool_input") or {}
    target = tool_input.get("file_path") or tool_input.get("notebook_path")
    if not target:
        return

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or os.getcwd()
    if not os.path.isabs(target):
        target = os.path.join(payload.get("cwd") or project_dir, target)
    docs_dir = os.path.join(project_dir, DOCS_DIR)
    in_docs = is_inside(target, docs_dir)

    if role in DOCS_ONLY_AGENTS and not in_docs:
        deny(
            "dev-pipeline:{0} 는 {1}/ 아래 문서만 쓸 수 있다. 막힌 경로: {2}".format(role, DOCS_DIR, target)
        )
    if role in NO_DOCS_AGENTS and in_docs:
        deny(
            "dev-pipeline:implementer 는 {0}/ 계약 문서를 바꿀 수 없다. "
            "계약 변경이 필요하면 멈추고 변경 제안을 보고하라. 막힌 경로: {1}".format(DOCS_DIR, target)
        )


if __name__ == "__main__":
    main()
