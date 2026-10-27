#!/usr/bin/env python3
"""claude-toolkit 마켓플레이스·플러그인 검증 스크립트.

사용법 (레포 루트에서):
    python scripts/validate.py            # 기본 검사 + claude CLI 가 있으면 공식 검증까지
    python scripts/validate.py --strict   # 경고도 실패로 처리 (CI 용)
    python scripts/validate.py --no-claude

검사 항목:
    1. marketplace.json · 각 plugin.json · hooks.json · .mcp.json 의 JSON 유효성과 필수 필드
    2. marketplace.json 에 등록된 경로가 실제로 있는지, plugins/ 에 있는데 등록 안 된 플러그인이 있는지
    3. 각 플러그인의 README.md 유무, 루트 README 플러그인 표에 올라가 있는지
    4. 커밋 대상(추적 중 + 무시되지 않은 새 파일)에 .env · 키 파일 같은 민감 파일이나 비밀값처럼 보이는 문자열이 있는지
    5. (선택) `claude plugin validate` 공식 검증

종료 코드: 0 통과, 1 오류 있음 (--strict 면 경고도 1).
Python 3.8+ 표준 라이브러리만 쓴다.
"""

import argparse
import fnmatch
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARKETPLACE_PATH = os.path.join(ROOT, ".claude-plugin", "marketplace.json")
PLUGINS_DIR = os.path.join(ROOT, "plugins")
SELF_PATH = os.path.relpath(os.path.abspath(__file__), ROOT).replace(os.sep, "/")

# 이름 규칙: 마켓플레이스·플러그인 공통 (공식 문서의 plugin id 규칙, 여기서는 kebab-case 로 더 좁힘)
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")

# 커밋하면 안 되는 파일 이름 패턴
SENSITIVE_FILE_PATTERNS = [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "*.jks",
    "*.keystore",
    "id_rsa*",
    "id_ed25519*",
    "id_ecdsa*",
    "credentials*.json",
    "service-account*.json",
    "secrets.*",
    "*.secret",
    ".npmrc",
    ".pypirc",
    ".netrc",
]
# 위 패턴에 걸려도 예시용이라 허용하는 이름
SENSITIVE_FILE_ALLOW = [".env.example", ".env.sample", ".env.template", "*.pub"]

# 비밀값처럼 보이는 문자열 (이름과 정규식)
SECRET_CONTENT_PATTERNS = [
    ("개인 키 블록", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("Anthropic API 키", re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}")),
    ("OpenAI 형식 API 키", re.compile(r"\bsk-[A-Za-z0-9]{32,}\b")),
    ("GitHub 토큰", re.compile(r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b")),
    ("GitHub fine-grained 토큰", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{40,}\b")),
    ("AWS 액세스 키", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("Slack 토큰", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}\b")),
]
TEXT_SIZE_LIMIT = 1024 * 1024


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def error(self, where, message):
        self.errors.append((where, message))

    def warn(self, where, message):
        self.warnings.append((where, message))

    def print_summary(self):
        for where, message in self.errors:
            print("[오류] {0}: {1}".format(where, message))
        for where, message in self.warnings:
            print("[경고] {0}: {1}".format(where, message))
        print("")
        print("오류 {0}개, 경고 {1}개".format(len(self.errors), len(self.warnings)))


def rel(path):
    return os.path.relpath(path, ROOT).replace(os.sep, "/")


def load_json(path, report):
    """JSON 파일을 읽는다. 실패하면 오류를 남기고 None."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        report.error(rel(path), "파일이 없다")
    except ValueError as e:
        report.error(rel(path), "JSON 문법 오류: {0}".format(e))
    return None


def check_marketplace(report):
    """marketplace.json 을 검사하고 등록된 플러그인 {이름: 절대경로} 를 돌려준다."""
    data = load_json(MARKETPLACE_PATH, report)
    where = rel(MARKETPLACE_PATH)
    if not isinstance(data, dict):
        if data is not None:
            report.error(where, "최상위가 객체가 아니다")
        return {}

    name = data.get("name")
    if not name:
        report.error(where, "name 이 없다")
    elif not NAME_RE.match(name):
        report.error(where, "name '{0}' 이 kebab-case 가 아니다".format(name))
    owner = data.get("owner")
    if not isinstance(owner, dict) or not owner.get("name"):
        report.error(where, "owner.name 이 없다")
    if not data.get("description") and not (data.get("metadata") or {}).get("description"):
        report.warn(where, "description 이 없다")

    plugins = data.get("plugins")
    if not isinstance(plugins, list):
        report.error(where, "plugins 배열이 없다")
        return {}
    if not plugins:
        report.warn(where, "등록된 플러그인이 없다")

    registered = {}
    for i, entry in enumerate(plugins):
        ewhere = "{0} plugins[{1}]".format(where, i)
        if not isinstance(entry, dict):
            report.error(ewhere, "객체가 아니다")
            continue
        pname = entry.get("name")
        source = entry.get("source")
        if not pname:
            report.error(ewhere, "name 이 없다")
            continue
        ewhere = "{0} ({1})".format(ewhere, pname)
        if not NAME_RE.match(pname):
            report.error(ewhere, "name 이 kebab-case 가 아니다")
        if pname in registered:
            report.error(ewhere, "같은 이름의 플러그인이 이미 등록돼 있다")
            continue
        if not entry.get("description"):
            report.warn(ewhere, "description 이 없다 (/plugin 목록에 표시된다)")
        if not isinstance(source, str):
            # github · git-subdir 등 외부 소스는 존재 검사를 하지 않는다
            report.warn(ewhere, "외부 source 라 경로 검사를 건너뛴다")
            continue
        if not source.startswith("./"):
            report.error(ewhere, "source '{0}' 는 './' 로 시작해야 한다".format(source))
            continue
        if ".." in source.split("/"):
            report.error(ewhere, "source 에 '..' 를 쓸 수 없다")
            continue
        path = os.path.normpath(os.path.join(ROOT, source))
        if not os.path.isdir(path):
            report.error(ewhere, "source 경로가 없다: {0}".format(source))
            continue
        if entry.get("version"):
            report.warn(ewhere, "version 은 plugin.json 에만 둔다 (둘 다 있으면 plugin.json 이 이기고 혼동된다)")
        registered[pname] = path
    return registered


def check_unregistered(registered, report):
    if not os.path.isdir(PLUGINS_DIR):
        report.error("plugins/", "디렉터리가 없다")
        return
    registered_paths = {os.path.normcase(p) for p in registered.values()}
    for child in sorted(os.listdir(PLUGINS_DIR)):
        path = os.path.join(PLUGINS_DIR, child)
        if os.path.isdir(path) and not child.startswith(".") and os.path.normcase(path) not in registered_paths:
            report.error(rel(path), "plugins/ 에 있지만 marketplace.json 에 등록되지 않았다")


def check_plugin(name, path, root_readme, report):
    where = rel(path)
    manifest_path = os.path.join(path, ".claude-plugin", "plugin.json")
    manifest = load_json(manifest_path, report)
    if isinstance(manifest, dict):
        mwhere = rel(manifest_path)
        if manifest.get("name") != name:
            report.error(mwhere, "name '{0}' 이 marketplace 등록 이름 '{1}' 과 다르다".format(manifest.get("name"), name))
        if not manifest.get("version"):
            report.error(mwhere, "version 이 없다 (플러그인마다 자기 버전을 가진다)")
        if not manifest.get("description"):
            report.warn(mwhere, "description 이 없다")
    elif manifest is not None:
        report.error(rel(manifest_path), "최상위가 객체가 아니다")

    if not os.path.isfile(os.path.join(path, "README.md")):
        report.error(where, "README.md 가 없다")

    if root_readme is not None and name not in root_readme:
        report.warn("README.md", "플러그인 목록 표에 '{0}' 이 없다".format(name))

    hooks_path = os.path.join(path, "hooks", "hooks.json")
    if os.path.isfile(hooks_path):
        hooks = load_json(hooks_path, report)
        if isinstance(hooks, dict) and "hooks" not in hooks:
            report.error(rel(hooks_path), "최상위에 \"hooks\" 키가 있어야 한다")

    mcp_path = os.path.join(path, ".mcp.json")
    if os.path.isfile(mcp_path):
        check_mcp(mcp_path, report)


def check_mcp(path, report):
    """MCP 설정의 env · headers 에 비밀값이 직접 적혀 있지 않은지 본다."""
    data = load_json(path, report)
    if not isinstance(data, dict):
        return
    servers = data.get("mcpServers", data)
    where = rel(path)
    for sname, conf in (servers or {}).items():
        if not isinstance(conf, dict):
            continue
        for field in ("env", "headers"):
            for key, value in (conf.get(field) or {}).items():
                if isinstance(value, str) and value and "${" not in value:
                    if re.search(r"(TOKEN|SECRET|PASSWORD|PASSWD|KEY|AUTH)", key, re.I):
                        report.error(
                            "{0} {1}.{2}.{3}".format(where, sname, field, key),
                            "비밀값으로 보이는 값을 직접 적었다. '${환경변수}' 로 받는다",
                        )


def commit_candidates():
    """커밋 대상 파일 목록 (레포 기준 상대경로). git 이 없으면 .gitignore 없이 전부 훑는다."""
    try:
        out = subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
            cwd=ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=True,
        ).stdout
        return [p for p in out.decode("utf-8", "replace").split("\0") if p], True
    except (OSError, subprocess.CalledProcessError):
        files = []
        for dirpath, dirnames, filenames in os.walk(ROOT):
            dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", "__pycache__", ".venv")]
            files.extend(rel(os.path.join(dirpath, f)) for f in filenames)
        return files, False


def check_sensitive(report):
    files, from_git = commit_candidates()
    if not from_git:
        report.warn("(git)", "git 저장소가 아니라 .gitignore 를 반영하지 못했다. 전체 파일을 검사한다")
    for path in files:
        base = path.rsplit("/", 1)[-1]
        if any(fnmatch.fnmatch(base, p) for p in SENSITIVE_FILE_PATTERNS) and not any(
            fnmatch.fnmatch(base, p) for p in SENSITIVE_FILE_ALLOW
        ):
            report.warn(path, "민감 파일로 보인다. 커밋하지 말고 .gitignore 에 추가한다")
            continue
        if path == SELF_PATH:
            continue
        full = os.path.join(ROOT, path)
        try:
            if os.path.getsize(full) > TEXT_SIZE_LIMIT:
                continue
            with open(full, "rb") as f:
                raw = f.read()
        except OSError:
            continue
        if b"\0" in raw:
            continue
        text = raw.decode("utf-8", "replace")
        for label, pattern in SECRET_CONTENT_PATTERNS:
            if pattern.search(text):
                report.warn(path, "{0}처럼 보이는 문자열이 있다".format(label))


def run_claude_validate(report):
    claude = shutil.which("claude")
    if not claude:
        print("claude CLI 가 없어 공식 검증(claude plugin validate)은 건너뛴다.")
        return
    try:
        result = subprocess.run(
            [claude, "plugin", "validate", ROOT],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as e:
        report.warn("claude plugin validate", "실행 실패: {0}".format(e))
        return
    output = result.stdout.decode("utf-8", "replace")
    tail = [line for line in output.strip().splitlines() if line.strip()][-1:] or ["(출력 없음)"]
    print("claude plugin validate: {0}".format(tail[0].strip()))
    if result.returncode != 0:
        report.error("claude plugin validate", "실패 (exit {0})\n{1}".format(result.returncode, output))
    elif "warning" in output.lower():
        report.warn("claude plugin validate", "경고 있음\n{0}".format(output))


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass

    parser = argparse.ArgumentParser(description="claude-toolkit 마켓플레이스·플러그인 검증")
    parser.add_argument("--strict", action="store_true", help="경고도 실패로 처리")
    parser.add_argument("--no-claude", action="store_true", help="claude plugin validate 를 실행하지 않음")
    args = parser.parse_args()

    report = Report()
    registered = check_marketplace(report)
    check_unregistered(registered, report)

    root_readme = None
    try:
        with open(os.path.join(ROOT, "README.md"), encoding="utf-8") as f:
            root_readme = f.read()
    except OSError:
        report.error("README.md", "루트 README.md 가 없다")

    for name, path in sorted(registered.items()):
        check_plugin(name, path, root_readme, report)
    check_sensitive(report)
    if not args.no_claude:
        run_claude_validate(report)

    print("플러그인 {0}개 검사: {1}".format(len(registered), ", ".join(sorted(registered)) or "-"))
    report.print_summary()
    failed = bool(report.errors) or (args.strict and bool(report.warnings))
    print("결과: {0}".format("실패" if failed else "통과"))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
