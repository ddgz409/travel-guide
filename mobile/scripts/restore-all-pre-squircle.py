"""Replay ALL transcript edits (lines 1-546) onto project files."""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys

TRANSCRIPT = r"C:\Users\wyf20\.cursor\projects\c-Users-wyf20-Desktop-app\agent-transcripts\96377b5a-b527-4ba5-bcf1-55f2da7cc945\96377b5a-b527-4ba5-bcf1-55f2da7cc945.jsonl"
ROOT = r"c:/Users/wyf20/Desktop/app"
MAX_LINE = 546

PREFIX = "c:/users/wyf20/desktop/app/"


def normalize_path(raw: str) -> str | None:
    p = raw.replace("\\", "/")
    low = p.lower()
    if PREFIX in low:
        rel = low.split(PREFIX, 1)[1]
    elif low.startswith("mobile/") or low.startswith("backend/") or low.startswith("packages/"):
        rel = low
    elif low.startswith("frontend/"):
        rel = low
    else:
        return None
    # skip scripts junk / agent paths
    if rel.startswith("agent-transcripts") or rel.endswith(".md"):
        return None
    return rel


def git_head(rel: str) -> str:
    r = subprocess.run(
        ["git", "show", f"HEAD:{rel}"],
        cwd=ROOT,
        capture_output=True,
    )
    return r.stdout.decode("utf-8") if r.returncode == 0 else ""


def discover_files() -> list[str]:
    found: set[str] = set()
    for i, line in enumerate(open(TRANSCRIPT, encoding="utf-8"), 1):
        if i > MAX_LINE:
            break
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        for part in obj.get("message", {}).get("content", []):
            if part.get("type") != "tool_use":
                continue
            inp = part.get("input", {})
            rel = normalize_path(inp.get("path", ""))
            if not rel:
                continue
            if not (
                rel.startswith("mobile/")
                or rel.startswith("backend/")
                or rel.startswith("packages/")
                or rel.startswith("frontend/")
            ):
                continue
            if part["name"] in ("Write", "StrReplace"):
                found.add(rel)
    return sorted(found)


def replay(rel: str) -> tuple[int, int]:
    full = os.path.join(ROOT, rel.replace("/", os.sep))
    content = git_head(rel)
    if not content and os.path.isfile(full):
        content = open(full, encoding="utf-8").read()
    ok = fail = 0
    basename = rel.split("/")[-1].lower()
    for i, line in enumerate(open(TRANSCRIPT, encoding="utf-8"), 1):
        if i > MAX_LINE:
            break
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        for part in obj.get("message", {}).get("content", []):
            if part.get("type") != "tool_use":
                continue
            inp = part.get("input", {})
            path = normalize_path(inp.get("path", ""))
            if path != rel:
                # case-insensitive match on windows paths
                if not path or path.split("/")[-1].lower() != basename:
                    continue
                tail = "/".join(rel.split("/")[:-1]).lower()
                if tail not in (path or "").lower():
                    continue
            if part["name"] == "Write":
                content = inp.get("contents", "")
                ok += 1
            elif part["name"] == "StrReplace":
                old = inp.get("old_string", "")
                new = inp.get("new_string", "")
                if old in content:
                    content = content.replace(old, new, 1)
                    ok += 1
                else:
                    fail += 1
    content = post_process(rel, content)
    os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
    open(full, "w", encoding="utf-8").write(content)
    return ok, fail


def post_process(rel: str, content: str) -> str:
    if rel.endswith("TripDetailScreen.tsx"):
        content = re.sub(
            r"import \{ HeroRouteMap \}[^\n]+\nimport \{ TripDetailSheet \}[^\n]+\nimport React",
            "import React",
            content,
            count=1,
        )
        if content.count("import { HeroRouteMap }") == 0:
            content = content.replace(
                'import { useAuth } from "../../auth/AuthContext";',
                'import { useAuth } from "../../auth/AuthContext";\n'
                'import { HeroRouteMap } from "../../components/HeroRouteMap";\n'
                'import { TripDetailSheet } from "../../components/TripDetailSheet";',
                1,
            )
        elif content.count("import { HeroRouteMap }") > 1:
            lines = content.splitlines()
            seen = False
            out = []
            for ln in lines:
                if "import { HeroRouteMap }" in ln or "import { TripDetailSheet }" in ln:
                    if seen:
                        continue
                    if "TripDetailSheet" in ln:
                        continue
                if "import { HeroRouteMap }" in ln:
                    seen = True
                out.append(ln)
            content = "\n".join(out)
            if 'import { TripDetailSheet }' not in content:
                content = content.replace(
                    'import { HeroRouteMap } from "../../components/HeroRouteMap";',
                    'import { HeroRouteMap } from "../../components/HeroRouteMap";\n'
                    'import { TripDetailSheet } from "../../components/TripDetailSheet";',
                    1,
                )
    if rel == "mobile/App.tsx":
        if "GestureHandlerRootView" not in content:
            content = content.replace(
                'import { ActivityIndicator, Pressable, Text, View } from "react-native";',
                'import { ActivityIndicator, Pressable, Text, View } from "react-native";\n'
                'import { GestureHandlerRootView } from "react-native-gesture-handler";',
                1,
            )
            content = content.replace(
                "export default function App() {\n  return (\n    <SafeAreaProvider>",
                "export default function App() {\n  return (\n    <GestureHandlerRootView style={{ flex: 1 }}>\n      <SafeAreaProvider>",
                1,
            )
            content = content.replace(
                "    </SafeAreaProvider>\n  );\n}",
                "    </SafeAreaProvider>\n    </GestureHandlerRootView>\n  );\n}",
                1,
            )
    return content


def main() -> int:
    files = discover_files()
    print(f"Replaying {len(files)} files from transcript (lines 1-{MAX_LINE})")
    bad: list[tuple[str, int, int]] = []
    for rel in files:
        ok, fail = replay(rel)
        flag = " !" if fail > 0 else ""
        print(f"  {rel}: ok={ok} fail={fail}{flag}")
        if fail > 0:
            bad.append((rel, ok, fail))
    if bad:
        print(f"\n{len(bad)} files had failed patches")
    return 0


if __name__ == "__main__":
    sys.exit(main())
