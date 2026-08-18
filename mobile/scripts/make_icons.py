# -*- coding: utf-8 -*-
"""从 assets/icon-source.jpg 生成全套应用图标。

流程：裁掉四周浅青色衬边 -> 居中取正方形 -> 切圆角（四角圆弧）
     -> 组合为「浅蓝底 #E8F3FC + 圆角图案居中」的图标，
        并重生成 assets 与 android mipmap 各密度 webp。

用法：python scripts/make_icons.py
"""

import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.normpath(os.path.join(HERE, "..", "assets"))
RES = os.path.normpath(os.path.join(HERE, "..", "android", "app", "src", "main", "res"))
SRC = os.path.join(ASSETS, "icon-source.jpg")

BG = (232, 243, 252)  # #E8F3FC，与 app.json adaptiveIcon.backgroundColor 一致
BORDER_MAX_FRACTION = 0.15  # 每边最多按 15% 处理，防止误裁进主体
MATCH_RATIO = 0.85  # 一条扫描线里多大比例像"衬边"才算衬边


def looks_like_border(px):
    r, g, b = px[:3]
    spread = max(r, g, b) - min(r, g, b)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return (
        18 <= spread <= 75  # 有一定彩度（白/灰不算，深色主体也不算）
        and b >= r  # 青蓝系
        and g >= r - 8
        and 160 <= lum <= 248
    )


def scanline_border_len(lines):
    """返回开头连续"衬边"扫描线的数量。"""
    n = 0
    for line in lines:
        total = 0
        hit = 0
        for px in line:
            total += 1
            if looks_like_border(px):
                hit += 1
        if total and hit / total >= MATCH_RATIO:
            n += 1
        else:
            break
    return n


def crop_border(im):
    im = im.convert("RGB")
    W, H = im.size
    px = im.load()
    cap = lambda v, m: int(min(v, m))
    top = cap(scanline_border_len([px[x, y] for x in range(0, W, 3)] for y in range(H)), H * BORDER_MAX_FRACTION)
    bot = cap(scanline_border_len([px[x, H - 1 - y] for x in range(0, W, 3)] for y in range(H)), H * BORDER_MAX_FRACTION)
    left = cap(scanline_border_len([px[x, y] for y in range(0, H, 3)] for x in range(W)), W * BORDER_MAX_FRACTION)
    right = cap(scanline_border_len([px[W - 1 - x, y] for y in range(0, H, 3)] for x in range(W)), W * BORDER_MAX_FRACTION)
    print("border crop (frac): top=%.3f bottom=%.3f left=%.3f right=%.3f" % (top / H, bot / H, left / W, right / W))
    box = (left, top, W - right, H - bot)
    inner = im.crop(box)
    # 去边后再轻微内缩 1%，让边缘干净
    w, h = inner.size
    ins_x, ins_y = int(w * 0.01), int(h * 0.01)
    return inner.crop((ins_x, ins_y, w - ins_x, h - ins_y))


def rounded(img, size, radius_frac):
    """缩放到 size 并切圆角，返回 RGBA。"""
    im = img.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    r = int(size * radius_frac)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=255)
    im.putalpha(mask)
    return im


def compose_full(img, size, art_frac=0.76, radius_frac=0.17):
    """浅蓝底 + 圆角图案居中（icon.png / favicon / 旧版 launcher 用）。"""
    canvas = Image.new("RGB", (size, size), BG)
    art = rounded(img, int(size * art_frac), radius_frac)
    off = (size - art.size[0]) // 2
    canvas.paste(art, (off, off), art)
    return canvas


def compose_foreground(img, size, art_frac=0.42, radius_frac=0.20):
    """自适应图标前景：透明底 + 圆角图案居中（42% 保证圆形遮罩不切到图案圆角）。"""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    art = rounded(img, int(size * art_frac), radius_frac)
    off = (size - art.size[0]) // 2
    canvas.paste(art, (off, off), art)
    return canvas


def compose_monochrome(fg, size):
    """主题图标单色层：取图案中较深的笔画为白色形状，保底用整个圆角形状。"""
    base = fg.resize((size, size), Image.LANCZOS).convert("RGBA")
    px = base.load()
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    op = out.load()
    hit = 0
    for y in range(size):
        for x in range(size):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            if lum < 170:
                op[x, y] = (255, 255, 255, 255)
                hit += 1
    coverage = hit / (size * size)
    print("monochrome stroke coverage: %.3f" % coverage)
    if coverage < 0.03:  # 画面太浅时退化为整块圆角形状
        return fg.resize((size, size), Image.LANCZOS).convert("RGBA")
    return out


def save_webp(img, path):
    img.save(path, "WEBP", quality=90, method=6)
    print("wrote", os.path.relpath(path, HERE), img.size)


def main():
    src = Image.open(SRC)
    print("source:", src.size)
    art = crop_border(src)
    # 图标是正方形：取居中最大正方形
    w, h = art.size
    s = min(w, h)
    art = art.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    print("art after crop:", art.size)

    # ---- assets ----
    full = compose_full(art, 1024)
    full.save(os.path.join(ASSETS, "icon.png"))
    full.save(os.path.join(ASSETS, "splash-icon.png"))
    compose_full(art, 192).save(os.path.join(ASSETS, "favicon.png"))
    fg = compose_foreground(art, 1024)
    fg.save(os.path.join(ASSETS, "android-icon-foreground.png"))
    Image.new("RGB", (1024, 1024), BG).save(os.path.join(ASSETS, "android-icon-background.png"))
    mono = compose_monochrome(fg, 1024)
    mono.save(os.path.join(ASSETS, "android-icon-monochrome.png"))
    print("wrote assets")

    # ---- android mipmaps（旧版 launcher 用完整构图，adaptive 层用前景/背景/单色）----
    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for dpi, launcher_px in densities.items():
        folder = os.path.join(RES, "mipmap-" + dpi)
        layer_px = int(launcher_px * 108 / 48)
        save_webp(compose_full(art, launcher_px), os.path.join(folder, "ic_launcher.webp"))
        save_webp(compose_full(art, launcher_px), os.path.join(folder, "ic_launcher_round.webp"))
        save_webp(fg.resize((layer_px, layer_px), Image.LANCZOS), os.path.join(folder, "ic_launcher_foreground.webp"))
        save_webp(mono.resize((layer_px, layer_px), Image.LANCZOS), os.path.join(folder, "ic_launcher_monochrome.webp"))
        save_webp(
            Image.new("RGB", (layer_px, layer_px), BG).resize((layer_px, layer_px)),
            os.path.join(folder, "ic_launcher_background.webp"),
        )
    print("done")


if __name__ == "__main__":
    main()
