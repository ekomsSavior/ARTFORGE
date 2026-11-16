"""ARTFORGE Mutation Lab: portable recipes, image rendering, video loops and CLI.

Browser and still-image effects use the same seeded spatial algorithm. Video
uses native FFmpeg filters for speed and interprets the same creative controls.
"""

import argparse
from datetime import datetime
import importlib.util
import json
import math
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile

LIMITS = {
    "rgb": (0, 60, 0),
    "tear": (0, 100, 0),
    "grain": (0, 100, 0),
    "pixel": (1, 32, 1),
    "scan": (0, 100, 0),
    "hue": (-180, 180, 0),
    "saturation": (0, 200, 100),
    "contrast": (0, 200, 100),
    "posterize": (0, 16, 0),
    "echo": (0, 90, 0),
    "bitrot": (0, 100, 0),
    "spam": (0, 100, 0),
    "replicas": (1, 20, 6),
    "motion": (0, 100, 30),
    "path": (0, 5, 0),
    "sync": (0, 100, 0),
    "solarize": (0, 100, 0),
}
DEFAULTS = {key: bounds[2] for key, bounds in LIMITS.items()}
PRESETS = {
    "vhs-haunt": (
        "VHS HAUNT",
        dict(rgb=12, tear=18, grain=24, scan=30, saturation=70, contrast=116, echo=24),
    ),
    "neon-bleed": (
        "NEON BLEED",
        dict(rgb=24, tear=8, grain=12, hue=36, saturation=165, contrast=120),
    ),
    "pixel-riot": (
        "PIXEL RIOT",
        dict(
            rgb=14,
            tear=28,
            pixel=9,
            grain=10,
            posterize=5,
            saturation=145,
            contrast=125,
        ),
    ),
    "signal-loss": (
        "SIGNAL LOSS",
        dict(rgb=32, tear=68, grain=45, scan=52, saturation=35, contrast=135, echo=38),
    ),
    "acid-bloom": (
        "ACID BLOOM",
        dict(rgb=8, tear=10, hue=110, saturation=200, contrast=150, posterize=7),
    ),
    "ghost-machine": (
        "GHOST MACHINE",
        dict(rgb=9, tear=32, grain=28, scan=26, saturation=0, contrast=162, echo=65),
    ),
    "spamware": (
        "SPAMWARE",
        dict(
            tear=24,
            grain=15,
            scan=18,
            bitrot=12,
            spam=85,
            replicas=8,
            motion=40,
            path=0,
        ),
    ),
    "bit-rot": (
        "BIT ROT",
        dict(
            tear=55,
            grain=22,
            pixel=4,
            bitrot=65,
            posterize=4,
            saturation=0,
            contrast=145,
        ),
    ),
    "circuit-bent": (
        "CIRCUIT BENT",
        dict(
            rgb=22,
            tear=37,
            grain=20,
            sync=65,
            solarize=62,
            contrast=145,
            saturation=120,
            echo=45,
        ),
    ),
    "crt-burn": (
        "CRT BURN",
        dict(
            rgb=4,
            tear=12,
            grain=30,
            scan=66,
            sync=22,
            contrast=170,
            saturation=0,
            echo=78,
        ),
    ),
}
SPAM_TEXT = [
    "ILLEGAL OPERATION",
    "YOU ARE VISITOR 000404",
    "MEMORY COULD NOT BE READ",
    "FREE PIXELS. FOREVER.",
    "SIGNAL NOT FOUND",
    "DOWNLOAD MORE STATIC",
]
IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".bmp",
    ".tif",
    ".tiff",
    ".gif",
    ".avif",
}


def validate_recipe(value):
    if (
        not isinstance(value, dict)
        or type(value.get("version")) is not int
        or value["version"] != 1
        or value.get("app") != "ARTFORGE"
    ):
        raise ValueError("Expected an ARTFORGE v1 recipe.")
    seed = value.get("seed")
    if type(seed) is not int or not 0 <= seed <= 2147483647:
        raise ValueError("Seed must be an integer from 0 to 2147483647.")
    if not isinstance(value.get("params"), dict):
        raise ValueError("Recipe controls are missing.")
    params = dict(DEFAULTS)
    for key, number in value["params"].items():
        if key not in LIMITS:
            raise ValueError(f"Unknown control: {key}")
        low, high, _ = LIMITS[key]
        if type(number) is not int or not low <= number <= high:
            raise ValueError(f"{key} must be an integer from {low} to {high}.")
        params[key] = number
    messages = value.get("messages", [])
    if (
        not isinstance(messages, list)
        or len(messages) > 12
        or any(
            not isinstance(message, str)
            or not message.strip()
            or len(message) > 80
            or any(ord(c) < 32 for c in message)
            for message in messages
        )
    ):
        raise ValueError(
            "Use up to 12 popup messages, 1–80 characters each, without control characters."
        )
    name = value.get("name", "Custom mutation")
    return dict(
        app="ARTFORGE",
        version=1,
        name=name[:80] if isinstance(name, str) else "Custom mutation",
        seed=seed,
        params=params,
        messages=list(messages),
    )


def preset_recipe(name, seed=404):
    if name not in PRESETS:
        raise ValueError(f"Unknown preset: {name}")
    title, params = PRESETS[name]
    return validate_recipe(
        dict(app="ARTFORGE", version=1, name=title, seed=seed, params=params)
    )


def stack_presets(names, seed=404):
    params = dict(DEFAULTS)
    titles = []
    for name in names:
        if name not in PRESETS:
            raise ValueError(f"Unknown preset: {name}")
        title, controls = PRESETS[name]
        params.update(controls)
        titles.append(title)
    return validate_recipe(
        dict(
            app="ARTFORGE",
            version=1,
            name=" + ".join(titles) or "CLEAN SIGNAL",
            seed=seed,
            params=params,
        )
    )


def load_recipe(path):
    if path.stat().st_size > 65536:
        raise ValueError("Recipe is too large (64 KB maximum).")
    return validate_recipe(json.loads(path.read_text(encoding="utf-8")))


def hash32(value):
    value &= 0xFFFFFFFF
    value = ((value ^ (value >> 16)) * 0x45D9F3B) & 0xFFFFFFFF
    value = ((value ^ (value >> 16)) * 0x45D9F3B) & 0xFFFFFFFF
    return (value ^ (value >> 16)) & 0xFFFFFFFF


def mutate_recipe(recipe, seed):
    params = dict(recipe["params"])
    number = seed
    for key, (low, high, _) in LIMITS.items():
        if key in ("echo", "replicas", "motion", "path"):
            continue
        number = hash32(number + 1)
        params[key] = max(
            low,
            min(
                high,
                math.floor(
                    params[key] + (number / 4294967296 - 0.5) * (high - low) * 0.5 + 0.5
                ),
            ),
        )
    return validate_recipe(
        dict(recipe, name="CUSTOM MUTATION", seed=seed, params=params)
    )


def image_dependencies():
    try:
        import numpy as np
        from PIL import Image, ImageDraw, ImageFont, ImageOps
    except ImportError as exc:
        raise RuntimeError(
            "Image lab needs Pillow and NumPy. Install with: python3 -m pip install pillow numpy"
        ) from exc
    return np, Image, ImageDraw, ImageFont, ImageOps


def render_pixels(source, recipe, phase=0):
    """Render an RGBA array without mutating the source (vectorized by row)."""
    np, *_ = image_dependencies()
    height, width, _ = source.shape
    p = recipe["params"]
    scale = width / 960
    block = max(1, math.floor(p["pixel"] * scale + 0.5))
    shift = math.floor(p["rgb"] * scale + 0.5)
    band = max(2, math.floor(18 * scale + 0.5))
    seed = (recipe["seed"] + phase) & 0xFFFFFFFF
    angle = p["hue"] * math.pi / 180
    co, si = math.cos(angle), math.sin(angle)
    matrix = np.array(
        [
            [
                0.213 + co * 0.787 - si * 0.213,
                0.715 - co * 0.715 - si * 0.715,
                0.072 - co * 0.072 + si * 0.928,
            ],
            [
                0.213 - co * 0.213 + si * 0.143,
                0.715 + co * 0.285 + si * 0.140,
                0.072 - co * 0.072 - si * 0.283,
            ],
            [
                0.213 - co * 0.213 - si * 0.787,
                0.715 - co * 0.715 + si * 0.715,
                0.072 + co * 0.928 + si * 0.072,
            ],
        ]
    )
    output = np.empty_like(source)
    xs = np.arange(width, dtype=np.int64)

    def hashes(values):
        values = values.astype(np.uint32)
        values = (values ^ (values >> 16)) * np.uint32(0x45D9F3B)
        values = (values ^ (values >> 16)) * np.uint32(0x45D9F3B)
        return values ^ (values >> 16)

    for y in range(height):
        h = hash32(y // band + seed)
        tear = (
            math.floor(((h >> 8) % 201 - 100) * scale * p["tear"] / 100 + 0.5)
            if h % 100 < p["tear"]
            else 0
        )
        tear += math.floor(
            p["sync"]
            * scale
            * 1.8
            * math.sin(y / height * 12 + recipe["seed"] * 0.001 + phase * 0.1)
            + 0.5
        )
        sx = ((xs + tear) % width) // block * block
        roll = math.floor(
            p["sync"]
            / 100
            * height
            * 0.22
            * math.sin(recipe["seed"] * 0.1 + phase * 0.04)
            + 0.5
        )
        sy = (y // block * block + roll) % height
        rgb = np.stack(
            [
                source[sy, (sx + shift) % width, 0],
                source[sy, sx, 1],
                source[sy, (sx - shift) % width, 2],
            ],
            axis=1,
        ).astype(float)
        rgb = rgb @ matrix.T
        luma = rgb @ np.array([0.2126, 0.7152, 0.0722])
        rgb = (
            (luma[:, None] + (rgb - luma[:, None]) * p["saturation"] / 100) - 128
        ) * p["contrast"] / 100 + 128
        if p["posterize"] >= 2:
            rgb = (
                np.floor(np.clip(rgb, 0, 255) / 255 * (p["posterize"] - 1) + 0.5)
                * 255
                / (p["posterize"] - 1)
            )
        rot = hashes(xs // max(4, block * 4) + (y // band) * 131 + seed)
        mask = rot % 100 < p["bitrot"]
        if mask.any():
            rgb[mask] = (
                np.floor(np.clip(rgb[mask], 0, 255) + 0.5).astype(np.uint32)
                ^ ((rot[mask] >> 8) & 255)[:, None]
            )
        if p["solarize"]:
            rgb = np.clip(rgb, 0, 255)
            rgb = np.where(rgb > 255 - p["solarize"] * 2, 255 - rgb, rgb)
        grain = ((hashes(xs + y * width + seed) % 256) / 255 - 0.5) * p["grain"] * 1.3
        scan = (
            1 - p["scan"] / 140 if y % max(2, math.floor(4 * scale + 0.5)) == 0 else 1
        )
        output[y, :, :3] = np.clip(
            np.floor(rgb * scan + grain[:, None] + 0.5), 0, 255
        ).astype(np.uint8)
        output[y, :, 3] = source[sy, sx, 3]
    return output


def popup_layout(width, height, recipe, time=0):
    p = recipe["params"]
    if not p["spam"]:
        return []
    w = min(width * 0.53, max(width * 0.26, 180 * width / 960))
    h = w * 0.51
    results = []
    for i in range(p["replicas"]):
        a = hash32(recipe["seed"] + i * 71)
        b = hash32(a + 1)
        x, y = a % 1000 / 1000 * (width - w), b % 1000 / 1000 * (height - h)
        t = time * p["motion"] / 100
        if p["path"] == 0:
            x = (x + t * width * 0.19 * (1 if i % 2 else -1)) % (width + w) - w / 2
            y = (y + t * height * 0.11) % (height + h) - h / 2
        elif p["path"] == 1:
            x += (math.cos(t * 2 + i) - math.cos(i)) * width * 0.17
            y += (math.sin(t * 2 + i) - math.sin(i)) * height * 0.17
        elif p["path"] == 3:
            x = (t * width * 0.23 - i * width * 0.15) % (width + w) - w / 2
            y = (height - h) / 2 + math.sin(t * 3 - i * 0.65) * (height - h) * 0.35
        elif p["path"] == 4:
            x = (t * width * 0.3 - i * width * 0.18) % (width + w) - w / 2
            y = (height - h) / 2
        elif p["path"] == 5:
            x = (width - w) / 2
            y = (t * height * 0.3 - i * height * 0.18) % (height + h) - h / 2
        else:
            bounce = lambda v, maximum: maximum - abs(v % (maximum * 2) - maximum)
            x, y = bounce(x + t * width * 0.3, width - w), bounce(
                y + t * height * 0.22, height - h
            )
        results.append(
            dict(
                x=math.floor(x + 0.5),
                y=math.floor(y + 0.5),
                w=math.floor(w + 0.5),
                h=math.floor(h + 0.5),
                text=(recipe["messages"] or SPAM_TEXT)[
                    i % len(recipe["messages"] or SPAM_TEXT)
                ],
                index=i,
            )
        )
    return results


def draw_spam(image, recipe, time=0, custom_image=None):
    _, Image, ImageDraw, ImageFont, _ = image_dependencies()
    overlay = Image.new("RGBA", image.size)
    draw = ImageDraw.Draw(overlay)
    scale = image.width / 960
    try:
        font = ImageFont.truetype("DejaVuSansMono.ttf", max(7, round(10 * scale)))
    except OSError:
        font = ImageFont.load_default()
    for box in popup_layout(*image.size, recipe, time):
        x, y, w, h = [box[k] for k in ("x", "y", "w", "h")]
        if custom_image is not None:
            stamp = custom_image.copy()
            stamp.thumbnail((max(1, w), max(1, h)), Image.Resampling.LANCZOS)
            overlay.alpha_composite(stamp, (x, y))
            continue
        draw.rectangle(
            (x + 5 * scale, y + 5 * scale, x + w + 5 * scale, y + h + 5 * scale),
            fill="black",
        )
        draw.rectangle(
            (x, y, x + w, y + h),
            fill="#bcbcbc",
            outline="white",
            width=max(1, round(2 * scale)),
        )
        draw.rectangle(
            (x + 4 * scale, y + 4 * scale, x + w - 4 * scale, y + 27 * scale),
            fill="#1b1b1b",
        )
        draw.text(
            (x + 9 * scale, y + 7 * scale),
            f"SYSTEM_{box['index']:02}.EXE",
            fill="white",
            font=font,
        )
        draw.text(
            (x + 12 * scale, y + 36 * scale), box["text"], fill="black", font=font
        )
        draw.text(
            (x + 12 * scale, y + 54 * scale),
            "The image performed an illegal operation.",
            fill="black",
            font=font,
        )
        draw.rectangle(
            (
                x + w - 78 * scale,
                y + h - 30 * scale,
                x + w - 14 * scale,
                y + h - 10 * scale,
            ),
            outline="#666",
        )
        draw.text(
            (x + w - 65 * scale, y + h - 28 * scale), "REPEAT", fill="black", font=font
        )
        px, py = x + w * 0.74, y + h * 0.66
        draw.polygon(
            [
                (px, py),
                (px + 7 * scale, py + 21 * scale),
                (px + 11 * scale, py + 13 * scale),
                (px + 20 * scale, py + 11 * scale),
            ],
            fill="white",
            outline="black",
        )
    opacity = min(1, 0.45 + recipe["params"]["spam"] / 182)
    overlay.putalpha(
        overlay.getchannel("A").point(lambda alpha: round(alpha * opacity))
    )
    return Image.alpha_composite(image, overlay)


def render_image(source_path, output_path, recipe, max_size=2560, overlay_path=None):
    np, Image, _, _, ImageOps = image_dependencies()
    with Image.open(source_path) as source:
        image = ImageOps.exif_transpose(source).convert("RGBA")
        if max_size:
            image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        image = Image.fromarray(render_pixels(np.array(image), recipe))
    if recipe["params"]["spam"]:
        custom = None
        if overlay_path:
            with Image.open(overlay_path) as overlay:
                custom = ImageOps.exif_transpose(overlay).convert("RGBA")
        image = draw_spam(image, recipe, custom_image=custom)
    image.save(output_path)


def run_process(command, timeout=None):
    try:
        result = subprocess.run(
            command, check=True, capture_output=True, text=True, timeout=timeout
        )
        return result.stdout
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"{command[0]} is missing. Install FFmpeg (includes ffprobe)."
        ) from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError((exc.stderr or str(exc))[-3000:].strip()) from exc


def probe(path):
    info = json.loads(
        run_process(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_streams",
                "-show_format",
                "-of",
                "json",
                str(path),
            ],
            timeout=30,
        )
    )
    stream = next(
        (s for s in info.get("streams", []) if s.get("codec_type") == "video"), None
    )
    if not stream:
        raise ValueError(f"No image or video stream in {path.name}.")
    return stream, info


def video_filters(recipe, width, height, text_files=None):
    p = recipe["params"]
    scale = width / 960
    filters = [f"scale={width}:{height}:flags=lanczos", "setsar=1"]
    if p["pixel"] > 1:
        block = max(1, round(p["pixel"] * scale))
        filters += [
            f"scale={max(1,width//block)}:{max(1,height//block)}:flags=neighbor",
            f"scale={width}:{height}:flags=neighbor",
        ]
    filters += ["format=gbrp"]
    if p["tear"]:
        amount = p["tear"] * scale
        # The time term animates only the row displacement; still recipes remain seeded.
        x = f'X+{amount:.4f}*sin(floor(Y/18)*17+{recipe["seed"]}+floor(T*12))'
        sample = f"p(mod({x}+W*2,W),Y)"
        filters += [f"geq=r='{sample}':g='{sample}':b='{sample}'"]
    if p["sync"]:
        filters += [f'scroll=vertical={p["sync"]/100*.2:.4f}']
    if p["rgb"]:
        shift = min(255, round(p["rgb"] * scale))
        filters += [f"rgbashift=rh={shift}:bh={-shift}:edge=wrap"]
    filters += [
        f'hue=h={p["hue"]}:s={p["saturation"]/100}',
        f'eq=contrast={p["contrast"]/100}',
    ]
    if p["posterize"] >= 2:
        n = p["posterize"] - 1
        expression = f"round(val/255*{n})*255/{n}"
        filters += [f"lutrgb=r='{expression}':g='{expression}':b='{expression}'"]
    if p["bitrot"]:
        expression = f'if(lt(mod(floor(val)*13+{recipe["seed"]},100),{p["bitrot"]}),bitand(val,170)+bitand(255-val,85),val)'
        filters += [f"lutrgb=r='{expression}':g='{expression}':b='{expression}'"]
    if p["solarize"]:
        expression = f'if(gt(val,{255-p["solarize"]*2}),255-val,val)'
        filters += [f"lutrgb=r='{expression}':g='{expression}':b='{expression}'"]
    if p["grain"]:
        filters += [f'noise=alls={p["grain"]}:allf=t+u:all_seed={recipe["seed"]}']
    if p["scan"]:
        filters += [
            f'drawgrid=w=iw:h={max(2,round(4*scale))}:t=1:c=black@{p["scan"]/140:.4f}'
        ]
    if p["echo"]:
        filters += [
            f"tmix=frames=3:weights='1 {p['echo']/100:.3f} {p['echo']/200:.3f}'"
        ]
    if p["spam"]:
        # drawtext's box follows its animated x/y expressions, unlike drawbox.
        speed = p["motion"] / 100
        for box in popup_layout(width, height, recipe):
            i = box["index"]
            x = box["x"]
            y = box["y"]
            if p["path"] == 0:
                xe = f"mod({x+width}+t*{width*.19*speed*(1 if i%2 else -1):.4f}+w*100,w)-tw/2"
                ye = f"mod({y+height}+t*{height*.11*speed:.4f},h)-th/2"
            elif p["path"] == 1:
                xe = f"{x}+(cos(t*{speed*2:.4f}+{i})-cos({i}))*w*.17"
                ye = f"{y}+(sin(t*{speed*2:.4f}+{i})-sin({i}))*h*.17"
            elif p["path"] == 3:
                xe = f"mod(t*w*{speed*.23:.4f}-{i}*w*.15+(w+tw)*100,w+tw)-tw/2"
                ye = f"(h-th)/2+sin(t*{speed*3:.4f}-{i}*.65)*(h-th)*.35"
            elif p["path"] == 4:
                xe = f"mod(t*w*{speed*.3:.4f}-{i}*w*.18+(w+tw)*100,w+tw)-tw/2"
                ye = "(h-th)/2"
            elif p["path"] == 5:
                xe = "(w-tw)/2"
                ye = f"mod(t*h*{speed*.3:.4f}-{i}*h*.18+(h+th)*100,h+th)-th/2"
            else:
                xe = f"(w-tw)-abs(mod({max(0,x)}+t*w*{speed*.3:.4f},2*(w-tw))-(w-tw))"
                ye = f"(h-th)-abs(mod({max(0,y)}+t*h*{speed*.22:.4f},2*(h-th))-(h-th))"
            content = f"text='SYSTEM {i:02} - {box['text']}'"
            if text_files:
                text_path = (
                    str(text_files[i % len(text_files)])
                    .replace("\\", "/")
                    .replace(":", r"\:")
                    .replace("'", r"'\\''")
                )
                content = f"textfile='{text_path}':expansion=none"
            filters += [
                f"drawtext={content}:fontsize={max(6,round(11*scale))}:fontcolor=black:box=1:boxcolor=white@{.45+p['spam']/182:.3f}:boxborderw={max(2,round(12*scale))}:x='{xe}':y='{ye}'"
            ]
    return ",".join(filters + ["format=yuv420p"])


def render_video(
    source_path,
    output_path,
    recipe,
    loop_seconds=None,
    fps=24,
    max_size=1920,
    start=0,
    duration=None,
    is_image=False,
    overlay_path=None,
):
    if output_path.exists():
        raise ValueError(f"Output already exists: {output_path}")
    stream, _ = probe(source_path)
    width, height = int(stream["width"]), int(stream["height"])
    # FFmpeg autorotates phone videos before filtering.
    rotation = next(
        (
            s.get("rotation", 0)
            for s in stream.get("side_data_list", [])
            if "rotation" in s
        ),
        0,
    )
    if abs(int(rotation)) % 180 == 90:
        width, height = height, width
    ratio = min(1, max_size / max(width, height)) if max_size else 1
    width, height = max(2, int(width * ratio) // 2 * 2), max(
        2, int(height * ratio) // 2 * 2
    )
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-n",
        "-filter_threads",
        "1",
    ]
    if is_image:
        command += ["-loop", "1", "-framerate", str(fps)]
    elif loop_seconds:
        command += ["-stream_loop", "-1"]
    if start:
        command += ["-ss", str(start)]
    command += ["-i", str(source_path)]
    with tempfile.TemporaryDirectory(prefix="artforge-render-") as temporary:
        text_files = []
        for index, message in enumerate(recipe["messages"]):
            text_path = Path(temporary) / f"message-{index}.txt"
            text_path.write_text(message, encoding="utf-8")
            text_files.append(text_path)
        if overlay_path and recipe["params"]["spam"]:
            _, Image, _, _, ImageOps = image_dependencies()
            with Image.open(overlay_path) as overlay:
                overlay = ImageOps.exif_transpose(overlay).convert("RGBA")
                overlay.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                overlay.save(Path(temporary) / "overlay.png")
            command += [
                "-loop",
                "1",
                "-framerate",
                str(fps),
                "-i",
                str(Path(temporary) / "overlay.png"),
            ]
            clean = dict(recipe, params=dict(recipe["params"], spam=0))
            layout = popup_layout(width, height, recipe)
            count = len(layout)
            w = layout[0]["w"]
            h = layout[0]["h"]
            filters = f"[0:v]{video_filters(clean,width,height)}[base];"
            filters += (
                f'[1:v]scale={w}:{h}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa={min(1,.45+recipe["params"]["spam"]/182):.3f},split={count}'
                + "".join(f"[stamp{i}]" for i in range(count))
                + ";"
            )
            speed = recipe["params"]["motion"] / 100
            for i, box in enumerate(layout):
                x, y = box["x"], box["y"]
                if recipe["params"]["path"] == 0:
                    xe = f"mod({x+width}+t*{width*.19*speed*(1 if i%2 else -1):.4f}+main_w*100,main_w)-overlay_w/2"
                    ye = f"mod({y+height}+t*{height*.11*speed:.4f},main_h)-overlay_h/2"
                elif recipe["params"]["path"] == 1:
                    xe = f"{x}+(cos(t*{speed*2:.4f}+{i})-cos({i}))*main_w*.17"
                    ye = f"{y}+(sin(t*{speed*2:.4f}+{i})-sin({i}))*main_h*.17"
                elif recipe["params"]["path"] == 3:
                    xe = f"mod(t*main_w*{speed*.23:.4f}-{i}*main_w*.15+(main_w+overlay_w)*100,main_w+overlay_w)-overlay_w/2"
                    ye = f"(main_h-overlay_h)/2+sin(t*{speed*3:.4f}-{i}*.65)*(main_h-overlay_h)*.35"
                elif recipe["params"]["path"] == 4:
                    xe = f"mod(t*main_w*{speed*.3:.4f}-{i}*main_w*.18+(main_w+overlay_w)*100,main_w+overlay_w)-overlay_w/2"
                    ye = "(main_h-overlay_h)/2"
                elif recipe["params"]["path"] == 5:
                    xe = "(main_w-overlay_w)/2"
                    ye = f"mod(t*main_h*{speed*.3:.4f}-{i}*main_h*.18+(main_h+overlay_h)*100,main_h+overlay_h)-overlay_h/2"
                else:
                    xe = f"(main_w-overlay_w)-abs(mod({max(0,x)}+t*main_w*{speed*.3:.4f},2*(main_w-overlay_w))-(main_w-overlay_w))"
                    ye = f"(main_h-overlay_h)-abs(mod({max(0,y)}+t*main_h*{speed*.22:.4f},2*(main_h-overlay_h))-(main_h-overlay_h))"
                before = "base" if i == 0 else f"layer{i-1}"
                filters += f"[{before}][stamp{i}]overlay=x='{xe}':y='{ye}':shortest=1:format=auto[layer{i}];"
            filters += f"[layer{count-1}]format=yuv420p[out]"
            command += [
                "-filter_complex_threads",
                "1",
                "-filter_complex",
                filters,
                "-map",
                "[out]",
                "-map",
                "0:a?",
            ]
        else:
            command += [
                "-map",
                "0:v:0",
                "-map",
                "0:a?",
                "-vf",
                video_filters(recipe, width, height, text_files),
            ]
        if loop_seconds or duration:
            command += ["-t", str(loop_seconds or duration)]
        command += [
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "19",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
        try:
            run_process(command)
        except BaseException:
            output_path.unlink(missing_ok=True)
            raise


def contact_sheet(paths, output_path):
    _, Image, ImageDraw, ImageFont, _ = image_dependencies()
    columns = min(3, len(paths))
    rows = math.ceil(len(paths) / columns)
    sheet = Image.new("RGB", (columns * 320, rows * 278 + 60), "#111111")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSansMono.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    draw.text((15, 20), "ARTFORGE / MUTATION CONTACT SHEET", font=font, fill="white")
    for i, path in enumerate(paths):
        with Image.open(path) as image:
            image = image.convert("RGB")
            image.thumbnail((300, 230))
            x = (i % columns) * 320
            y = (i // columns) * 278 + 60
            sheet.paste(
                image, (x + (320 - image.width) // 2, y + (230 - image.height) // 2)
            )
            draw.text((x + 12, y + 239), path.stem[:37], font=font, fill="#bbbbbb")
    sheet.save(output_path)


def positive_float(raw):
    value = float(raw)
    if not math.isfinite(value) or value <= 0 or value > 86400:
        raise argparse.ArgumentTypeError(
            "Use a finite duration from 0 to 86400 seconds (exclusive of 0)."
        )
    return value


def seed_number(raw):
    value = int(raw)
    if not 0 <= value <= 2147483647:
        raise argparse.ArgumentTypeError("Seed must be between 0 and 2147483647.")
    return value


def forge(args):
    if not 1 <= args.variants <= 24:
        raise ValueError("Variants must be from 1 to 24.")
    if not math.isfinite(args.start) or args.start < 0:
        raise ValueError("Start must be a finite, nonnegative time.")
    if args.max_size < 32 or args.max_size > 8192:
        raise ValueError("Max size must be from 32 to 8192 pixels.")
    source_recipe = (
        load_recipe(args.recipe)
        if args.recipe
        else stack_presets(
            args.preset or ["signal-loss"],
            (
                args.seed
                if args.seed is not None
                else random.SystemRandom().randrange(2147483648)
            ),
        )
    )
    if args.recipe and args.seed is not None:
        source_recipe["seed"] = args.seed
    for raw in args.set:
        key, separator, value = raw.partition("=")
        if not separator:
            raise ValueError(
                "Controls use --set name=value, for example --set replicas=12"
            )
        source_recipe["params"][key] = int(value)
    if args.message:
        source_recipe["messages"] = args.message
        if not source_recipe["params"]["spam"]:
            source_recipe["params"]["spam"] = 85
    if args.overlay:
        args.overlay = args.overlay.expanduser().resolve()
        if not args.overlay.is_file():
            raise ValueError(f"Overlay not found: {args.overlay}")
        if not source_recipe["params"]["spam"]:
            source_recipe["params"]["spam"] = 85
    source_recipe = validate_recipe(source_recipe)
    sources = [p.expanduser().resolve() for p in args.inputs]
    for path in sources:
        if not path.is_file():
            raise ValueError(f"File not found: {path}")
    args.output.mkdir(parents=True, exist_ok=True)
    folder = Path(
        tempfile.mkdtemp(
            prefix=datetime.now().strftime("forge-%Y%m%d-%H%M%S-"), dir=args.output
        )
    )
    print(f'[+] Seed {source_recipe["seed"]} / {source_recipe["name"]}')
    print(f"[+] Session: {folder}")
    results = []
    failures = []
    images = []
    for source_index, source in enumerate(sources, 1):
        is_image = args.media == "image" or (
            args.media == "auto" and source.suffix.lower() in IMAGE_EXTENSIONS
        )
        for variant in range(args.variants):
            recipe = (
                source_recipe
                if variant == 0
                else mutate_recipe(
                    source_recipe, (source_recipe["seed"] + variant) % 2147483648
                )
            )
            stem = f'{source_index:02}-{source.stem[:70]}-v{variant+1:02}-s{recipe["seed"]}'
            output = folder / (
                stem + (".png" if is_image and not args.loop_seconds else ".mp4")
            )
            try:
                if output.suffix == ".png":
                    render_image(source, output, recipe, args.max_size, args.overlay)
                    images.append(output)
                else:
                    render_video(
                        source,
                        output,
                        recipe,
                        args.loop_seconds,
                        args.fps,
                        args.max_size,
                        args.start,
                        args.duration,
                        is_image,
                        args.overlay,
                    )
                output.with_suffix(".json").write_text(
                    json.dumps(recipe, indent=2) + "\n", encoding="utf-8"
                )
                results.append(
                    dict(
                        source=str(source),
                        output=output.name,
                        recipe=output.with_suffix(".json").name,
                        overlay=str(args.overlay) if args.overlay else None,
                    )
                )
                print(f"[+] {output.name}")
            except (ValueError, RuntimeError, OSError) as exc:
                output.unlink(missing_ok=True)
                failures.append(
                    dict(source=str(source), variant=variant + 1, error=str(exc))
                )
                print(f"[!] {source.name}: {exc}", file=sys.stderr)
    if len(images) > 1:
        try:
            contact_sheet(images, folder / "contact-sheet.jpg")
            print(f'[+] Preview: {folder / "contact-sheet.jpg"}')
        except (RuntimeError, OSError) as exc:
            print(f"[!] Contact sheet unavailable: {exc}", file=sys.stderr)
    (folder / "session.json").write_text(
        json.dumps(dict(results=results, failures=failures), indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[+] {len(results)} rendered / {len(failures)} failed. Originals untouched.")
    return 1 if failures else 0


def convert_for_phone(source, output=None):
    """Convert existing downloads to H.264/AAC MP4 without changing the source."""
    source = Path(source).expanduser().resolve()
    output = (
        Path(output).expanduser().resolve()
        if output
        else source.with_name(source.stem + "-phone.mp4")
    )
    if not source.is_file():
        raise ValueError(f"Source not found: {source}")
    if output.suffix.lower() != ".mp4":
        raise ValueError("Phone video output must end in .mp4.")
    if output.exists():
        raise ValueError(f"Output already exists: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix=".artforge-convert-", dir=output.parent
    ) as temporary:
        staged = Path(temporary) / "phone.mp4"
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-n",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-vf",
            "scale=1280:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
            "-r",
            "30",
            "-c:v",
            "libx264",
            "-profile:v",
            "baseline",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-movflags",
            "+faststart",
            str(staged),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode:
            raise ValueError("Video conversion failed: " + result.stderr[-1500:])
        # Exclusive publication also protects a file created during conversion.
        import os

        os.link(staged, output)
    print(f"[+] Phone-compatible MP4: {output}")
    return output


def cli(argv=None):
    parser = argparse.ArgumentParser(
        description="ARTFORGE / Mutation Lab. No arguments opens the classic interactive menu."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("presets", help="List the ten built-in looks")
    convert = commands.add_parser(
        "convert", help="Convert an existing loop/video to phone-friendly H.264/AAC MP4"
    )
    convert.add_argument("input", type=Path)
    convert.add_argument(
        "--output", type=Path, help="New .mp4 path (default: INPUT-phone.mp4)"
    )
    commands.add_parser(
        "doctor", help="Check optional media tools without importing them"
    )
    generate = commands.add_parser(
        "generate", help="Generate a byte dump, circuit board, or boot-screen still"
    )
    generate.add_argument(
        "--source", choices=["memory", "circuit", "boot"], default="memory"
    )
    generate.add_argument("--seed", type=seed_number, default=404)
    generate.add_argument("--preset", choices=PRESETS, action="append")
    generate.add_argument("--output", type=Path, default=Path("output"))
    studio = commands.add_parser("studio", help="Serve the browser studio on localhost")
    studio.add_argument("--port", type=int, default=8765)
    render = commands.add_parser(
        "forge", help="Render images, videos, variations, or motion loops"
    )
    render.add_argument("inputs", type=Path, nargs="+")
    selection = render.add_mutually_exclusive_group()
    selection.add_argument(
        "--preset",
        choices=PRESETS,
        action="append",
        help="Repeat to stack looks; last selected preset sets shared controls",
    )
    selection.add_argument("--recipe", type=Path)
    render.add_argument(
        "--overlay",
        type=Path,
        help="Replicate your own image instead of built-in popup windows",
    )
    render.add_argument(
        "--message",
        action="append",
        default=[],
        help="Custom popup text, up to 12 messages; repeatable",
    )
    render.add_argument("--seed", type=seed_number)
    render.add_argument(
        "--variants",
        type=int,
        default=1,
        help="1–24 deterministic mutations; first is the original look",
    )
    render.add_argument(
        "--set",
        action="append",
        default=[],
        metavar="CONTROL=VALUE",
        help="Override a recipe control; repeatable",
    )
    render.add_argument("--output", type=Path, default=Path("output"))
    render.add_argument(
        "--media",
        choices=["auto", "image", "video"],
        default="auto",
        help="Override extension-based detection (GIF defaults to first frame)",
    )
    render.add_argument(
        "--loop-seconds",
        type=positive_float,
        help="Animate a still or loop a video into an MP4 of this duration",
    )
    render.add_argument(
        "--start", type=float, default=0, help="Video input seek in seconds"
    )
    render.add_argument(
        "--duration",
        type=positive_float,
        help="Limit video output duration; loop-seconds takes precedence",
    )
    render.add_argument("--fps", type=int, choices=[12, 24, 25, 30, 60], default=24)
    render.add_argument(
        "--max-size",
        type=int,
        default=2560,
        help="Longest output edge, 32–8192 pixels (default 2560)",
    )
    args = parser.parse_args(argv)
    try:
        if args.command == "convert":
            convert_for_phone(args.input, args.output)
            return 0
        if args.command == "presets":
            for key, (name, _) in PRESETS.items():
                print(f"{key:16} {name}")
            return 0
        if args.command == "doctor":
            for binary in ("ffmpeg", "ffprobe"):
                print(f'{binary:14} {shutil.which(binary) or "MISSING"}')
            for module in (
                "PIL",
                "numpy",
                "glitchart",
                "cryptography",
                "scipy",
                "torch",
            ):
                print(
                    f'{module:14} {"available" if importlib.util.find_spec(module) else "optional / not installed"}'
                )
            return 0
        if args.command == "generate":
            from artforge_sources import generate_source

            args.output.mkdir(parents=True, exist_ok=True)
            folder = Path(
                tempfile.mkdtemp(
                    prefix=f"generated-{args.source}-{args.seed}-", dir=args.output
                )
            )
            source = folder / "source.png"
            generate_source(args.source, args.seed).save(source)
            print(f"[+] Source: {source}")
            if args.preset:
                recipe = stack_presets(args.preset, args.seed)
                render_image(source, folder / "glitched.png", recipe)
                (folder / "recipe.json").write_text(
                    json.dumps(recipe, indent=2) + "\n", encoding="utf-8"
                )
                print(f'[+] Glitched: {folder / "glitched.png"}')
            return 0
        if args.command == "studio":
            from functools import partial
            from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

            root = Path(__file__).resolve().parent / "web"
            server = ThreadingHTTPServer(
                ("127.0.0.1", args.port),
                partial(SimpleHTTPRequestHandler, directory=str(root)),
            )
            print(f"ARTFORGE studio: http://127.0.0.1:{server.server_port}", flush=True)
            print(
                "Files are processed locally in your browser. Ctrl+C stops the studio.",
                flush=True,
            )
            try:
                server.serve_forever()
            finally:
                server.server_close()
            return 0
        return forge(args)
    except (ValueError, RuntimeError, OSError) as exc:
        print(f"[!] {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n[!] Stopped.", file=sys.stderr)
        return 130


def interactive_lab():
    print("\n=== MUTATION LAB / ARTFORGE ===")
    print(
        "1. Render a preset or recipe\n2. Start the browser studio\n3. Check dependencies\n4. Back"
    )
    choice = input("Choice [1]: ").strip() or "1"
    if choice == "2":
        cli(["studio"])
        return
    if choice == "3":
        cli(["doctor"])
        return
    if choice != "1":
        return
    source = input("Source image or video path: ").strip()
    if not source:
        return
    for i, key in enumerate(PRESETS, 1):
        print(f"  {i}. {PRESETS[key][0]} ({key})")
    selection = (
        input("Preset name or number [signal-loss], or recipe JSON path: ").strip()
        or "signal-loss"
    )
    if selection.isdigit() and 1 <= int(selection) <= len(PRESETS):
        selection = list(PRESETS)[int(selection) - 1]
    args = [
        "forge",
        source,
        "--recipe" if selection.lower().endswith(".json") else "--preset",
        selection,
    ]
    seed = input("Seed [random / saved recipe]: ").strip()
    variants = input("Variations [1]: ").strip() or "1"
    loop = input(
        "Motion loop duration in seconds [blank for still/full video]: "
    ).strip()
    if seed:
        args += ["--seed", seed]
    args += ["--variants", variants]
    if loop:
        args += ["--loop-seconds", loop]
    try:
        cli(args)
    except SystemExit:
        # argparse reports invalid input without closing the classic menu.
        pass


if __name__ == "__main__":
    sys.exit(cli())
