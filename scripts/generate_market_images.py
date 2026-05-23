from pathlib import Path
import math
import random

from PIL import Image, ImageDraw, ImageFilter


OUT_DIR = Path(__file__).resolve().parents[1] / "public" / "market-images"
WIDTH = 1200
HEIGHT = 675

CATEGORY_STYLES = {
    "crypto": {
        "colors": [(8, 18, 34), (12, 185, 129), (24, 215, 255), (239, 68, 68)],
        "motifs": ["nodes", "candles", "vault"],
    },
    "sports": {
        "colors": [(9, 16, 28), (18, 185, 129), (255, 255, 255), (239, 68, 68)],
        "motifs": ["field", "lights", "score"],
    },
    "politics": {
        "colors": [(12, 15, 28), (74, 101, 160), (229, 231, 235), (239, 68, 68)],
        "motifs": ["columns", "podium", "ballot"],
    },
    "macro": {
        "colors": [(7, 14, 27), (24, 215, 255), (245, 158, 11), (18, 185, 129)],
        "motifs": ["skyline", "routes", "bank"],
    },
    "ai": {
        "colors": [(5, 10, 24), (127, 92, 255), (24, 215, 255), (18, 185, 129)],
        "motifs": ["neural", "datacenter", "waves"],
    },
    "arc": {
        "colors": [(4, 13, 24), (24, 215, 255), (18, 185, 129), (127, 92, 255)],
        "motifs": ["arcs", "rails", "nodes"],
    },
    "other": {
        "colors": [(8, 11, 25), (148, 163, 184), (24, 215, 255), (239, 68, 68)],
        "motifs": ["signals", "horizon", "stage"],
    },
}


def lerp(left, right, t):
    return tuple(int(left[i] + (right[i] - left[i]) * t) for i in range(3))


def gradient_background(colors, seed):
    rng = random.Random(seed)
    base = Image.new("RGB", (WIDTH, HEIGHT))
    pixels = base.load()
    c0 = colors[0]
    c1 = tuple(max(0, min(255, value + rng.randint(10, 34))) for value in colors[0])
    c2 = tuple(max(0, min(255, int(value * 0.85) + 18)) for value in colors[1])
    for y in range(HEIGHT):
        ty = y / max(1, HEIGHT - 1)
        row = lerp(c0, c1, ty)
        for x in range(WIDTH):
            tx = x / max(1, WIDTH - 1)
            glow = max(0, 1 - math.hypot(tx - 0.72, ty - 0.25) * 2.2)
            color = lerp(row, c2, glow * 0.7)
            pixels[x, y] = color
    return base


def draw_nodes(draw, rng, colors):
    points = [(rng.randint(80, WIDTH - 80), rng.randint(70, HEIGHT - 80)) for _ in range(28)]
    for i, point in enumerate(points):
        for other in points[i + 1 :]:
            if rng.random() < 0.08:
                draw.line([point, other], fill=(*colors[2], 105), width=2)
    for x, y in points:
        radius = rng.randint(3, 8)
        draw.ellipse([x - radius * 3, y - radius * 3, x + radius * 3, y + radius * 3], fill=(*colors[1], 34))
        draw.ellipse([x - radius, y - radius, x + radius, y + radius], fill=(*colors[1], 220))


def draw_candles(draw, rng, colors):
    x = 80
    while x < WIDTH - 70:
        h = rng.randint(45, 180)
        y = rng.randint(180, 470)
        color = colors[1] if rng.random() > 0.45 else colors[3]
        draw.line([x, y - h // 2, x, y + h // 2], fill=(*color, 190), width=3)
        draw.rounded_rectangle([x - 9, y - h // 4, x + 9, y + h // 4], radius=3, fill=(*color, 210))
        x += rng.randint(28, 48)


def draw_field(draw, rng, colors):
    y0 = rng.randint(350, 430)
    draw.polygon([(0, HEIGHT), (WIDTH, HEIGHT), (WIDTH * 0.72, y0), (WIDTH * 0.25, y0)], fill=(18, 185, 129, 92))
    for i in range(8):
        y = y0 + i * 34
        draw.line([(80, y), (WIDTH - 80, y + rng.randint(-10, 10))], fill=(*colors[2], 95), width=2)
    for x in range(90, WIDTH, 140):
        draw.ellipse([x - 7, 80, x + 7, 94], fill=(*colors[2], 220))
        draw.line([x, 90, x + rng.randint(-40, 40), 320], fill=(*colors[2], 70), width=3)


def draw_columns(draw, rng, colors):
    for x in range(100, WIDTH, 170):
        w = rng.randint(42, 68)
        draw.rectangle([x, 130, x + w, 560], fill=(226, 232, 240, 82))
        draw.rectangle([x - 18, 110, x + w + 18, 130], fill=(226, 232, 240, 120))
        draw.rectangle([x - 24, 560, x + w + 24, 585], fill=(226, 232, 240, 105))


def draw_skyline(draw, rng, colors):
    x = 0
    while x < WIDTH:
        w = rng.randint(36, 86)
        h = rng.randint(120, 420)
        draw.rectangle([x, HEIGHT - h, x + w, HEIGHT], fill=(10, 20, 35, 230))
        for wy in range(HEIGHT - h + 22, HEIGHT - 20, 36):
            if rng.random() > 0.35:
                draw.rectangle([x + 12, wy, x + 18, wy + 8], fill=(*colors[2], 160))
        x += w + rng.randint(4, 18)


def draw_neural(draw, rng, colors):
    for i in range(11):
        x0 = -60
        y0 = 80 + i * 46 + rng.randint(-10, 10)
        points = []
        for step in range(9):
            x = x0 + step * 170
            y = y0 + math.sin(step * 0.9 + i) * 42
            points.append((x, y))
        draw.line(points, fill=(*colors[1], 140), width=3)
    draw_nodes(draw, rng, colors)


def draw_arcs(draw, rng, colors):
    for i in range(9):
        bbox = [80 + i * 34, 120 + i * 18, WIDTH - 80 - i * 28, HEIGHT + 220 + i * 18]
        draw.arc(bbox, start=188, end=348, fill=(*colors[(i % 3) + 1], 150), width=5)


def draw_signals(draw, rng, colors):
    for i in range(18):
        y = rng.randint(90, HEIGHT - 90)
        points = []
        for x in range(0, WIDTH + 60, 60):
            points.append((x, y + math.sin(x / 70 + i) * rng.randint(8, 32)))
        draw.line(points, fill=(*colors[(i % 3) + 1], 118), width=3)


def draw_motif(layer, category, variant, rng, colors):
    draw = ImageDraw.Draw(layer, "RGBA")
    # Headline-safe dark wash under the visual motif.
    draw.rectangle([0, 0, WIDTH, HEIGHT], fill=(0, 0, 0, 18))
    draw.rectangle([0, 0, WIDTH * 0.66, HEIGHT], fill=(0, 0, 0, 62))

    motif = CATEGORY_STYLES[category]["motifs"][variant % 3]
    if motif in {"nodes", "vault"}:
        draw_nodes(draw, rng, colors)
    elif motif == "candles":
        draw_candles(draw, rng, colors)
    elif motif in {"field", "lights", "score"}:
        draw_field(draw, rng, colors)
    elif motif in {"columns", "podium", "ballot"}:
        draw_columns(draw, rng, colors)
    elif motif in {"skyline", "routes", "bank"}:
        draw_skyline(draw, rng, colors)
    elif motif in {"neural", "datacenter", "waves"}:
        draw_neural(draw, rng, colors)
    elif motif in {"arcs", "rails"}:
        draw_arcs(draw, rng, colors)
    else:
        draw_signals(draw, rng, colors)

    # Shared market-probability lines.
    for i, color in enumerate((colors[1], colors[3])):
        points = []
        y_base = 315 + i * 70 + rng.randint(-35, 35)
        for x in range(40, WIDTH - 30, 55):
            y = y_base + math.sin(x / 105 + variant + i) * rng.randint(12, 36)
            points.append((x, y))
        draw.line(points, fill=(*color, 190), width=4)


def add_noise(image, seed):
    rng = random.Random(seed)
    noise = Image.new("L", (WIDTH, HEIGHT))
    pixels = noise.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            pixels[x, y] = rng.randint(0, 34)
    noise = noise.filter(ImageFilter.GaussianBlur(0.3))
    return Image.blend(image, Image.composite(Image.new("RGB", (WIDTH, HEIGHT), (255, 255, 255)), image, noise.point(lambda p: p // 2)), 0.08)


def make_image(category, variant):
    style = CATEGORY_STYLES[category]
    seed = hash((category, variant, "aurapredict")) & 0xFFFFFFFF
    rng = random.Random(seed)
    colors = style["colors"]
    base = gradient_background(colors, seed)
    layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw_motif(layer, category, variant, rng, colors)
    image = Image.alpha_composite(base.convert("RGBA"), layer).convert("RGB")
    image = add_noise(image, seed)
    return image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=120, threshold=4))


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for category in CATEGORY_STYLES:
        for variant in range(1, 7):
            image = make_image(category, variant)
            path = OUT_DIR / f"{category}-{variant}.webp"
            image.save(path, "WEBP", quality=82, method=6)
            print(path.relative_to(OUT_DIR.parents[1]))


if __name__ == "__main__":
    main()
