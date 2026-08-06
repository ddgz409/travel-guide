"""行程生成进度（内存态，供 SSE 推送给前端）。"""
from __future__ import annotations

import re
import threading
from typing import Any

_lock = threading.Lock()
_store: dict[str, dict[str, Any]] = {}


def _extract_readable(preview: str) -> str:
    """从 LLM 流式 JSON 片段提取可读行程文案。"""
    if not preview:
        return ""
    lines: list[str] = []
    seen: set[str] = set()

    def add(line: str) -> None:
        line = line.strip()
        if line and line not in seen:
            seen.add(line)
            lines.append(line)

    patterns: list[tuple[str, str]] = [
        (r'"title"\s*:\s*"([^"\\]{2,80})"', "📋 {}"),
        (r'"theme"\s*:\s*"([^"\\]{2,40})"', "　主题：{}"),
        (r'"tagline"\s*:\s*"([^"\\]{2,60})"', "　{}"),
        (r'"summary"\s*:\s*"([^"\\]{4,120})"', "　{}"),
        (r'"name"\s*:\s*"([^"\\]{2,40})"', "　· {}"),
        (r'"description"\s*:\s*"([^"\\]{4,100})"', "　　{}"),
    ]
    for pat, fmt in patterns:
        for m in re.finditer(pat, preview):
            add(fmt.format(m.group(1).replace("\\n", " ")))

    day_m = re.search(r'"day_index"\s*:\s*(\d+)', preview)
    if day_m and f"day-{day_m.group(1)}" not in seen:
        seen.add(f"day-{day_m.group(1)}")
        lines.append(f"Day {day_m.group(1)}")

    return "\n".join(lines[-40:])


def update_progress(
    trip_id: str,
    *,
    phase: str,
    message: str,
    preview: str = "",
) -> None:
    with _lock:
        entry = _store.setdefault(trip_id, {})
        entry["phase"] = phase
        entry["message"] = message
        if preview:
            entry["preview"] = preview[-4000:]
            entry["readable"] = _extract_readable(entry["preview"])
        elif "preview" not in entry:
            entry["preview"] = ""
            entry["readable"] = ""


def append_preview(trip_id: str, chunk: str) -> None:
    if not chunk:
        return
    with _lock:
        entry = _store.setdefault(trip_id, {})
        prev = str(entry.get("preview") or "")
        entry["preview"] = (prev + chunk)[-4000:]
        entry["readable"] = _extract_readable(entry["preview"])


def get_progress(trip_id: str) -> dict[str, Any]:
    with _lock:
        return dict(_store.get(trip_id) or {})


def clear_progress(trip_id: str) -> None:
    with _lock:
        _store.pop(trip_id, None)
