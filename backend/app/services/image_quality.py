"""图片质量检测：过滤黑图、纯色图、极小图、损坏图。"""
from __future__ import annotations

import logging
from io import BytesIO
from urllib.parse import urlparse

import httpx
from PIL import Image, ImageStat

logger = logging.getLogger(__name__)


MIN_BYTES = 2048          # 小于 2KB 认为损坏/占位
MAX_SOLID_RATIO = 0.82    # 纯色像素占比超过 82% 认为纯色
MIN_EDGE_RATIO = 0.015    # 边缘像素占比低于 1.5% 认为太模糊/平滑
MAX_DARK_RATIO = 0.90     # 暗色像素超过 90% 认为黑图
MAX_BRIGHT_RATIO = 0.95   # 亮色像素超过 95% 认为白图/空白
SAMPLE_SIZE = 96          # 缩放后采样尺寸


def _is_dark(r: int, g: int, b: int) -> bool:
    return r < 35 and g < 35 and b < 35


def _is_bright(r: int, g: int, b: int) -> bool:
    return r > 245 and g > 245 and b > 245


def _is_solid(r: int, g: int, b: int, target: tuple[int, int, int]) -> bool:
    return abs(r - target[0]) < 12 and abs(g - target[1]) < 12 and abs(b - target[2]) < 12


def _dominant_color(pixels: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    rs = [p[0] for p in pixels]
    gs = [p[1] for p in pixels]
    bs = [p[2] for p in pixels]
    return int(sum(rs) / len(rs)), int(sum(gs) / len(gs)), int(sum(bs) / len(bs))


def check_image_quality(url: str, timeout: float = 10.0) -> bool:
    """返回 True 表示图片质量可接受。"""
    if not url or not url.startswith("http"):
        return False

    try:
        parsed = urlparse(url)
        if not parsed.netloc:
            return False

        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            resp = client.get(url, headers={"User-Agent": "Mozilla/5.0"})
            resp.raise_for_status()

        content = resp.content
        if len(content) < MIN_BYTES:
            logger.info("image too small bytes=%d url=%s", len(content), url[:80])
            return False

        try:
            img = Image.open(BytesIO(content))
            img = img.convert("RGB")
        except Exception as e:
            logger.info("image decode failed url=%s: %s", url[:80], e)
            return False

        w, h = img.size
        if w < 40 or h < 40 or w * h < 2500:
            logger.info("image too small size=%dx%d url=%s", w, h, url[:80])
            return False

        # 缩放采样，避免大图片过慢
        thumb = img.resize((SAMPLE_SIZE, SAMPLE_SIZE), Image.Resampling.LANCZOS)
        pixels = list(thumb.getdata())
        total = len(pixels)
        if total == 0:
            return False

        dominant = _dominant_color(pixels)
        solid_count = sum(1 for p in pixels if _is_solid(p[0], p[1], p[2], dominant))
        dark_count = sum(1 for p in pixels if _is_dark(*p))
        bright_count = sum(1 for p in pixels if _is_bright(*p))

        if solid_count / total > MAX_SOLID_RATIO:
            logger.info("image solid color ratio=%.2f url=%s", solid_count / total, url[:80])
            return False
        if dark_count / total > MAX_DARK_RATIO:
            logger.info("image dark ratio=%.2f url=%s", dark_count / total, url[:80])
            return False
        if bright_count / total > MAX_BRIGHT_RATIO:
            logger.info("image bright ratio=%.2f url=%s", bright_count / total, url[:80])
            return False

        # 边缘检测：太模糊/平滑的图不要
        stat = ImageStat.Stat(thumb)
        if stat.stddev and len(stat.stddev) >= 3:
            edge_score = sum(stat.stddev) / (3 * 255.0)
            if edge_score < MIN_EDGE_RATIO:
                logger.info("image too blurry edge_score=%.3f url=%s", edge_score, url[:80])
                return False

        return True
    except Exception as e:
        logger.info("image quality check failed url=%s: %s", url[:80], e)
        return False


def pick_best_image(urls: list[str]) -> str | None:
    """从多个 URL 中挑选第一张质量可接受的图片。"""
    for url in urls:
        if check_image_quality(url):
            return url
    return None
