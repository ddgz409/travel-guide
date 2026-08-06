"""Replay transcript edits (lines 1-546) onto mobile files."""
import json
import os
import re
import subprocess

TRANSCRIPT = r"C:\Users\wyf20\.cursor\projects\c-Users-wyf20-Desktop-app\agent-transcripts\96377b5a-b527-4ba5-bcf1-55f2da7cc945\96377b5a-b527-4ba5-bcf1-55f2da7cc945.jsonl"
ROOT = r"c:/Users/wyf20/Desktop/app"
MAX_LINE = 546

KEY_FILES = [
    "mobile/src/screens/TripDetail/TripDetailScreen.tsx",
    "mobile/src/screens/TripDetail/TripGeneratingView.tsx",
    "mobile/src/screens/TripDetail/styles.ts",
    "mobile/src/screens/TripDetail/ItemListRow.tsx",
    "mobile/src/screens/Chat/ChatScreen.tsx",
    "mobile/src/screens/Chat/styles.ts",
    "mobile/src/screens/Chat/smartPlanStyles.ts",
    "mobile/src/components/HeroRouteMap/index.tsx",
    "mobile/src/components/HeroRouteMap/styles.ts",
    "mobile/src/components/TripDetailSheet/index.tsx",
    "mobile/src/navigation/types.ts",
    "mobile/App.tsx",
    # 探索页地图置顶 + 打卡地图
    "mobile/src/screens/Explore/ExploreScreen.tsx",
    "mobile/src/screens/Explore/styles.ts",
    "mobile/src/screens/Trips/TripsScreen.tsx",
    "mobile/src/screens/Trips/styles.ts",
    "mobile/src/screens/Trips/CheckInMapCard.tsx",
    "mobile/src/screens/CheckInMap/CheckInMapFullScreen.tsx",
    "mobile/src/screens/CityDetail/CityDetailScreen.tsx",
    "mobile/src/screens/CityDetail/styles.ts",
    "mobile/src/screens/CityDetail/PoiDetailSheet.tsx",
    "mobile/src/screens/CityDetail/helpers.ts",
    "mobile/src/screens/CityDetail/DraggableBottomSheet.tsx",
    "mobile/src/utils/checkInStore.ts",
    "mobile/src/utils/checkInMapHtml.ts",
]


def git_head(rel: str) -> str:
    r = subprocess.run(
        ["git", "show", f"HEAD:{rel}"],
        cwd=ROOT,
        capture_output=True,
    )
    return r.stdout.decode("utf-8") if r.returncode == 0 else ""


def replay(rel: str) -> tuple[int, int]:
    full = os.path.join(ROOT, rel.replace("/", os.sep))
    content = git_head(rel)
    if not content and os.path.isfile(full):
        content = open(full, encoding="utf-8").read()
    ok = fail = 0
    suffix = rel.split("/")[-1]
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
            path = inp.get("path", "").replace("\\", "/")
            if suffix not in path or rel.split("mobile/")[-1] not in path.replace(
                "c:/users/wyf20/desktop/app/mobile/", ""
            ):
                if f"mobile/{rel.split('mobile/')[-1]}" not in path.lower():
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
    # Fix known corrupted import merge from patch ordering
    content = content.replace(
        'import { TripDetailSheet } from "../../components/TripDetailSheet";import React',
        "import React",
    )
    if rel.endswith("TripDetailScreen.tsx"):
        content = re.sub(
            r"^import \{ HeroRouteMap \}[^\n]+\nimport \{ TripDetailSheet \}[^\n]+\n",
            "",
            content,
            count=1,
            flags=re.MULTILINE,
        )
        if content.count("import { HeroRouteMap }") > 1:
            lines = content.splitlines()
            seen_hero = False
            kept = []
            for ln in lines:
                if "import { HeroRouteMap }" in ln:
                    if seen_hero:
                        continue
                    seen_hero = True
                kept.append(ln)
            content = "\n".join(kept)
        if "import { TripDetailSheet }" not in content:
            content = content.replace(
                'import { HeroRouteMap } from "../../components/HeroRouteMap";',
                'import { HeroRouteMap } from "../../components/HeroRouteMap";\n'
                'import { TripDetailSheet } from "../../components/TripDetailSheet";',
                1,
            )
    if rel == "mobile/App.tsx" and "GestureHandlerRootView" not in content:
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
    os.makedirs(os.path.dirname(full), exist_ok=True)
    open(full, "w", encoding="utf-8").write(content)
    return ok, fail


def main():
    for rel in KEY_FILES:
        ok, fail = replay(rel)
        print(f"{rel}: ok={ok} fail={fail}")


if __name__ == "__main__":
    main()
