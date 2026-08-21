# -*- coding: utf-8 -*-
"""预渲染 + 号菜单的“肥皂泡泡”球体素材。

1024 画布渲染（多层高斯模糊模拟弥散光/辉光/焦散），再降到 512 输出：
mobile/assets/bubble.png —— 半透明低饱和淡蓝泡泡，中心留通透，
配合运行时 BlurView 形成玻璃质感。

用法：python scripts/make_bubbles.py
"""

import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets", "bubble.png"))

S = 1024  # 渲染尺寸
C = S // 2
R = 368  # 球体半径，画布边缘留给辉光光晕


def layer():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


def circle(dr, r, color, width=None):
    box = (C - r, C - r, C + r, C + r)
    if width:
        dr.arc(box, 0, 360, fill=color, width=width)
    else:
        dr.ellipse(box, fill=color)


def arc(dr, r, start, end, color, width):
    box = (C - r, C - r, C + r, C + r)
    dr.arc(box, start, end, fill=color, width=width)


def ellipse_at(dr, cx, cy, w, h, color):
    dr.ellipse((cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2), fill=color)


def main():
    base = layer()

    # 1) 边缘辉光光晕：两层柔光，靠近球体更亮
    for r, alpha, blur in ((R + 6, 70, 60), (R - 30, 55, 34)):
        g = layer()
        circle(ImageDraw.Draw(g), r, (158, 208, 240, alpha))
        base = Image.alpha_composite(base, g.filter(ImageFilter.GaussianBlur(blur)))

    # 2) 球体基底：低饱和淡蓝、整体半透明
    b = layer()
    circle(ImageDraw.Draw(b), R, (172, 216, 243, 46))
    base = Image.alpha_composite(base, b)

    # 3) 泡泡边缘增亮环（折射感）：柔化的宽描边
    ring = layer()
    circle(ImageDraw.Draw(ring), R - 22, (150, 202, 235, 62), width=46)
    base = Image.alpha_composite(base, ring.filter(ImageFilter.GaussianBlur(20)))

    # 4) 左上内发光：柔和亮核，中心偏上
    glow = layer()
    ellipse_at(ImageDraw.Draw(glow), C - 70, C - 85, 540, 520, (236, 248, 253, 62))
    base = Image.alpha_composite(base, glow.filter(ImageFilter.GaussianBlur(95)))

    # 5) 右下柔和阴影：明暗过渡
    shade = layer()
    ellipse_at(ImageDraw.Draw(shade), C + 95, C + 135, 470, 440, (118, 166, 208, 42))
    base = Image.alpha_composite(base, shade.filter(ImageFilter.GaussianBlur(95)))

    # 6) 左上边缘光弧（主反光）
    rim1 = layer()
    arc(ImageDraw.Draw(rim1), R - 14, 168, 282, (243, 251, 255, 185), width=11)
    base = Image.alpha_composite(base, rim1.filter(ImageFilter.GaussianBlur(9)))

    # 7) 右下边缘光弧（次反光，更淡）
    rim2 = layer()
    arc(ImageDraw.Draw(rim2), R - 16, -14, 102, (205, 233, 250, 115), width=8)
    base = Image.alpha_composite(base, rim2.filter(ImageFilter.GaussianBlur(11)))

    # 8) 柔和焦散：下方内侧的透光弧
    caus = layer()
    arc(ImageDraw.Draw(caus), 244, 58, 124, (221, 243, 252, 88), width=24)
    base = Image.alpha_composite(base, caus.filter(ImageFilter.GaussianBlur(24)))

    # 9) 高光：斜置的柔亮椭圆（肥皂泡反光点）
    spec = layer()
    sd = ImageDraw.Draw(spec)
    ellipse_at(sd, 0, 0, 176, 104, (255, 255, 255, 150))
    spec = spec.filter(ImageFilter.GaussianBlur(13)).rotate(-26, resample=Image.BICUBIC)
    px, py = spec.size[0] // 2, spec.size[1] // 2
    base.alpha_composite(spec, (C - 150 - px, C - 158 - py))
    core = layer()
    ellipse_at(ImageDraw.Draw(core), 0, 0, 96, 46, (255, 255, 255, 205))
    core = core.filter(ImageFilter.GaussianBlur(6)).rotate(-26, resample=Image.BICUBIC)
    px, py = core.size[0] // 2, core.size[1] // 2
    base.alpha_composite(core, (C - 152 - px, C - 156 - py))

    out = base.resize((512, 512), Image.LANCZOS)
    out.save(OUT)
    print("wrote", OUT, out.size)


if __name__ == "__main__":
    main()
