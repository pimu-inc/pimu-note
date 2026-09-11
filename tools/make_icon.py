"""
pimu-note のアプリアイコンを生成する。要件 F-702 〜 F-704。

背景は #60BCF0 → #169DE9 の縦グラデーション（中間が #3BACED）。
配布後「暗く感じる」との声で一段明るくした（元は #3BACED → #1071A8）。
形は macOS Big Sur 以降の角丸スクエア（squircle）に合わせる。
"""
import sys
from PIL import Image, ImageDraw, ImageFont

SIZE = 1024
TOP = (0x60, 0xBC, 0xF0)
BOTTOM = (0x16, 0x9D, 0xE9)
EMOJI = "\U0001F5D2️"  # 🗒️
FONT_PATH = "/System/Library/Fonts/Apple Color Emoji.ttc"
EMOJI_STRIKE = 160  # Apple Color Emoji が持つ最大のビットマップサイズ

# macOS のアイコンは実寸より少し内側に描かれる（周囲に余白がある）
CONTENT_RATIO = 0.90
# squircle の丸み。n を上げるほど四角に近づく。Apple の形は 5 前後
SUPERELLIPSE_N = 5.0


def superellipse_mask(size: int, n: float) -> Image.Image:
    """角丸スクエア（|x|^n + |y|^n = 1）のマスクを作る"""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = size / 2
    points = []
    steps = 2048
    for i in range(steps):
        t = 2 * 3.141592653589793 * i / steps
        import math
        ct, st = math.cos(t), math.sin(t)
        x = r * (abs(ct) ** (2 / n)) * (1 if ct >= 0 else -1)
        y = r * (abs(st) ** (2 / n)) * (1 if st >= 0 else -1)
        points.append((r + x, r + y))
    draw.polygon(points, fill=255)
    return mask


def vertical_gradient(size: int, top, bottom) -> Image.Image:
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        f = y / (size - 1)
        grad.putpixel(
            (0, y),
            tuple(round(top[i] + (bottom[i] - top[i]) * f) for i in range(3)),
        )
    return grad.resize((size, size), Image.NEAREST)


def render_emoji(target_px: int) -> Image.Image:
    """絵文字を最大ビットマップサイズで描いてから拡大する"""
    font = ImageFont.truetype(FONT_PATH, EMOJI_STRIKE)
    canvas = Image.new("RGBA", (EMOJI_STRIKE * 2, EMOJI_STRIKE * 2), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.text((EMOJI_STRIKE // 2, EMOJI_STRIKE // 2), EMOJI, font=font, embedded_color=True)
    bbox = canvas.getbbox()
    if bbox is None:
        raise SystemExit("絵文字を描画できませんでした")
    glyph = canvas.crop(bbox)
    ratio = target_px / max(glyph.size)
    return glyph.resize(
        (max(1, round(glyph.width * ratio)), max(1, round(glyph.height * ratio))),
        Image.LANCZOS,
    )


def main(out_path: str) -> None:
    content = round(SIZE * CONTENT_RATIO)

    background = vertical_gradient(content, TOP, BOTTOM)
    background.putalpha(superellipse_mask(content, SUPERELLIPSE_N))

    icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    offset = (SIZE - content) // 2
    icon.paste(background, (offset, offset), background)

    glyph = render_emoji(round(content * 0.58))
    icon.paste(
        glyph,
        ((SIZE - glyph.width) // 2, (SIZE - glyph.height) // 2),
        glyph,
    )

    icon.save(out_path)
    print(f"書き出しました: {out_path} ({icon.size[0]}x{icon.size[1]})")


if __name__ == "__main__":
    main(sys.argv[1])
