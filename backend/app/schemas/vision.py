"""视觉识别（拍照识景）相关 Schema。"""
from pydantic import BaseModel


class VisionRecognizeResponse(BaseModel):
    """拍照识景 / 截图识别结果。

    kind: scenery | hotel | ticket | map | food | other
    """

    kind: str = "other"
    title: str = ""
    description: str = ""
    highlights: list[str] = []
    tips: list[str] = []
    raw: str | None = None
