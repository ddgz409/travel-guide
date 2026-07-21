"""Android 应用版本检查（侧载 APK 提示更新）。"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/app", tags=["应用更新"])

_STATIC_ANDROID = Path(__file__).resolve().parents[2] / "static" / "android"
_VERSION_FILE = _STATIC_ANDROID / "version.json"

_DEFAULT = {
    "versionCode": 1,
    "versionName": "1.0.0",
    "apkUrl": "http://81.71.159.218:8000/static/android/app-release.apk",
    "notes": "",
    "force": False,
}


class AndroidUpdateOut(BaseModel):
    versionCode: int = Field(ge=1)
    versionName: str
    apkUrl: str
    notes: str = ""
    force: bool = False
    apkAvailable: bool = False


def _load_version() -> dict:
    if not _VERSION_FILE.is_file():
        return dict(_DEFAULT)
    try:
        data = json.loads(_VERSION_FILE.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return dict(_DEFAULT)
        out = dict(_DEFAULT)
        out.update(data)
        return out
    except (OSError, json.JSONDecodeError):
        return dict(_DEFAULT)


@router.get("/android-update", response_model=AndroidUpdateOut)
def android_update():
    """返回最新 Android APK 版本信息（无需登录）。"""
    data = _load_version()
    apk_name = Path(str(data.get("apkUrl") or "")).name or "app-release.apk"
    local_apk = _STATIC_ANDROID / apk_name
    # 也兼容固定文件名
    if not local_apk.is_file():
        local_apk = _STATIC_ANDROID / "app-release.apk"
    return AndroidUpdateOut(
        versionCode=int(data.get("versionCode") or 1),
        versionName=str(data.get("versionName") or "1.0.0"),
        apkUrl=str(data.get("apkUrl") or _DEFAULT["apkUrl"]),
        notes=str(data.get("notes") or ""),
        force=bool(data.get("force")),
        apkAvailable=local_apk.is_file(),
    )
