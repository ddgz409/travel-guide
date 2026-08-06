"""One-shot restore to pre-squircle state (transcript lines 1-546)."""
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

# Tracked files that squircle-only bulk scripts touched — restore from HEAD after feature replay
SQUIRCLE_REVERT = [
    "mobile/src/theme/index.ts",
    "mobile/src/screens/Login/styles.ts",
    "mobile/src/screens/Register/styles.ts",
    "mobile/src/screens/Settings/styles.ts",
    "mobile/src/screens/Share/styles.ts",
    "mobile/src/screens/PortalSelect/styles.ts",
    "mobile/src/screens/TravelSearch/styles.ts",
    "mobile/src/screens/ModelManage/styles.ts",
    "mobile/src/screens/MapFull/styles.ts",
    "mobile/src/screens/Home/HomeScreen.tsx",
    "mobile/src/screens/Generate/styles.ts",
    "mobile/src/components/PlusMenu.tsx",
    "mobile/src/components/ModelPicker.tsx",
]

EXPLORE_GESTURE_OLD = """                <WebView
                  ref={webRef}
                  originWhitelist={["*"]}
                  source={{ html: mapHtml, baseUrl: "https://webapi.amap.com" }}
                  style={StyleSheet.absoluteFill}
                  javaScriptEnabled
                  domStorageEnabled
                  scrollEnabled={false}
                  setSupportMultipleWindows={false}
                  androidLayerType="hardware"
                  onMessage={(e) => {
                    try {
                      const msg = JSON.parse(e.nativeEvent.data);
                      if (msg?.type === "ready") mapReadyRef.current = true;
                    } catch {
                      /* ignore */
                    }
                  }}
                  onLoadEnd={() => {
                    setMapLoaded(true);
                    setTimeout(() => {
                      mapReadyRef.current = true;
                    }, 800);
                  }}
                />"""

EXPLORE_GESTURE_NEW = """                <NativeViewGestureHandler
                  ref={mapGestureRef}
                  disallowInterruption
                >
                  <View style={StyleSheet.absoluteFill} collapsable={false}>
                    <WebView
                      ref={webRef}
                      originWhitelist={["*"]}
                      source={{ html: mapHtml, baseUrl: "https://webapi.amap.com" }}
                      style={StyleSheet.absoluteFill}
                      javaScriptEnabled
                      domStorageEnabled
                      scrollEnabled={false}
                      setSupportMultipleWindows={false}
                      androidLayerType="hardware"
                      onMessage={(e) => {
                        try {
                          const msg = JSON.parse(e.nativeEvent.data);
                          if (msg?.type === "ready") mapReadyRef.current = true;
                          if (msg?.type === "mapGesture") {
                            setPageScrollEnabled(!msg.payload?.active);
                          }
                        } catch {
                          /* ignore */
                        }
                      }}
                      onLoadEnd={() => {
                        setMapLoaded(true);
                        setTimeout(() => {
                          mapReadyRef.current = true;
                        }, 800);
                      }}
                    />
                  </View>
                </NativeViewGestureHandler>"""


def norm_path(raw: str) -> str | None:
    p = raw.replace("\\", "/")
    low = p.lower()
    if PREFIX in low:
        return low.split(PREFIX, 1)[1]
    if low.startswith(("mobile/", "backend/", "packages/", "frontend/")):
        return low
    return None


def git_head(rel: str) -> str:
    r = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=ROOT, capture_output=True)
    return r.stdout.decode("utf-8") if r.returncode == 0 else ""


def git_checkout(rel: str) -> None:
    subprocess.run(["git", "checkout", "HEAD", "--", rel], cwd=ROOT, capture_output=True)


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
            rel = norm_path(part.get("input", {}).get("path", ""))
            if rel and part.get("name") in ("Write", "StrReplace"):
                if rel.startswith(("mobile/", "backend/", "packages/", "frontend/")):
                    found.add(rel)
    return sorted(found)


def replay(rel: str) -> tuple[int, int]:
    full = os.path.join(ROOT, rel.replace("/", os.sep))
    content = git_head(rel)
    if not content and os.path.isfile(full):
        content = open(full, encoding="utf-8").read()
    ok = fail = 0
    basename = os.path.basename(rel).lower()
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
            path = norm_path(part.get("input", {}).get("path", ""))
            if not path:
                continue
            if path != rel and os.path.basename(path).lower() != basename:
                continue
            if path != rel and rel.split("/")[-2:] != path.split("/")[-2:]:
                continue
            inp = part.get("input", {})
            if part["name"] == "Write":
                content = inp.get("contents", "")
                ok += 1
            elif part["name"] == "StrReplace":
                old = inp.get("old_string", "")
                new = inp.get("new_string", "")
                if old and old in content:
                    content = content.replace(old, new, 1)
                    ok += 1
                elif old:
                    fail += 1
    content = post_process(rel, content)
    os.makedirs(os.path.dirname(full) or ROOT, exist_ok=True)
    open(full, "w", encoding="utf-8", newline="\n").write(content)
    return ok, fail


def post_process(rel: str, content: str) -> str:
    if rel.endswith("tripdetailscreen.tsx"):
        content = re.sub(
            r"^import \{ HeroRouteMap \}[^\n]+\nimport \{ TripDetailSheet \}[^\n]+\n",
            "",
            content,
            count=1,
            flags=re.MULTILINE,
        )
        if content.count("import { HeroRouteMap }") > 1:
            seen = False
            kept = []
            for ln in content.splitlines():
                if "import { HeroRouteMap }" in ln:
                    if seen:
                        continue
                    seen = True
                kept.append(ln)
            content = "\n".join(kept)
        if "import { TripDetailSheet }" not in content:
            content = content.replace(
                'import { useAuth } from "../../auth/AuthContext";',
                'import { useAuth } from "../../auth/AuthContext";\n'
                'import { HeroRouteMap } from "../../components/HeroRouteMap";\n'
                'import { TripDetailSheet } from "../../components/TripDetailSheet";',
                1,
            )
    if rel == "mobile/app.tsx" and "GestureHandlerRootView" not in content:
        content = content.replace(
            'import { ActivityIndicator, Pressable, Text, View } from "react-native";',
            'import { ActivityIndicator, Pressable, Text, View } from "react-native";\n'
            'import { GestureHandlerRootView } from "react-native-gesture-handler";',
            1,
        )
        content = content.replace(
            "export default function App() {\n  return (\n    <SafeAreaProvider>",
            "export default function App() {\n  return (\n    "
            '<GestureHandlerRootView style={{ flex: 1 }}>\n      <SafeAreaProvider>',
            1,
        )
        content = content.replace(
            "    </SafeAreaProvider>\n  );\n}",
            "    </SafeAreaProvider>\n    </GestureHandlerRootView>\n  );\n}",
            1,
        )
    if rel.endswith("explorescreen.tsx"):
        if "NativeViewGestureHandler" not in content:
            content = content.replace(
                "  Pressable,\n  ScrollView,\n  StyleSheet,",
                "  Pressable,\n  StyleSheet,",
                1,
            )
            content = content.replace(
                '} from "react-native";\nimport { useNavigation }',
                '} from "react-native";\nimport {\n  NativeViewGestureHandler,\n  ScrollView,\n} from "react-native-gesture-handler";\nimport { useNavigation }',
                1,
            )
        if "mapGestureRef" not in content:
            content = content.replace(
                "  const webRef = useRef<WebView>(null);\n  const mapReadyRef",
                "  const webRef = useRef<WebView>(null);\n  const mapGestureRef = useRef<NativeViewGestureHandler>(null);\n  const mapReadyRef",
                1,
            )
            content = content.replace(
                "  const [mapLoaded, setMapLoaded] = useState(false);\n",
                "  const [mapLoaded, setMapLoaded] = useState(false);\n  const [pageScrollEnabled, setPageScrollEnabled] = useState(true);\n",
                1,
            )
        if "waitFor={mapGestureRef}" not in content:
            content = content.replace(
                '        keyboardShouldPersistTaps="handled"\n        contentContainerStyle',
                '        keyboardShouldPersistTaps="handled"\n        nestedScrollEnabled\n        scrollEnabled={pageScrollEnabled}\n        waitFor={mapGestureRef}\n        contentContainerStyle',
                1,
            )
        if EXPLORE_GESTURE_OLD in content:
            content = content.replace(EXPLORE_GESTURE_OLD, EXPLORE_GESTURE_NEW, 1)
    return content


def main() -> int:
    print("=== Pre-squircle full restore (transcript 1-546) ===")
    files = discover_files()
    print(f"Replaying {len(files)} files...")
    bad = []
    for rel in files:
        ok, fail = replay(rel)
        mark = " !" if fail else ""
        print(f"  {rel}: ok={ok} fail={fail}{mark}")
        if fail:
            bad.append(rel)

    print("\n=== Revert squircle-only tracked files to HEAD ===")
    for rel in SQUIRCLE_REVERT:
        if git_head(rel):
            git_checkout(rel)
            print(f"  reverted {rel}")

    radius = os.path.join(ROOT, "mobile/src/theme/radius.ts")
    if os.path.isfile(radius):
        os.remove(radius)
        print("  deleted mobile/src/theme/radius.ts")

    subprocess.run(
        ["git", "checkout", "HEAD", "--", "frontend/app/globals.css", "frontend/tailwind.config.ts"],
        cwd=ROOT,
        capture_output=True,
    )
    print("  reverted frontend squircle css/tailwind (if tracked)")

    print(f"\nDone. {len(bad)} files had patch failures (may still be OK).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
