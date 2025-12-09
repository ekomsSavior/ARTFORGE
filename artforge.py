#!/usr/bin/env python3
import subprocess
from pathlib import Path
import os
import random

# Optional glitchart library (pip3 install glitchart)
try:
    import glitchart  # type: ignore
    HAS_GLITCHART = True
except ImportError:
    glitchart = None
    HAS_GLITCHART = False

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

# Default font path for text/ASCII overlays (Kali / Debian)
DEFAULT_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


class Colors:
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    PURPLE = '\033[95m'
    CYAN = '\033[96m'
    END = '\033[0m'


def clear_screen():
    os.system("cls" if os.name == "nt" else "clear")


# ----------------- Generic helpers ----------------- #

def run_cmd(cmd: list):
    print("\n[+] Running:", " ".join(cmd))
    try:
        subprocess.run(cmd, check=True)
        print("[+] Done.")
    except subprocess.CalledProcessError as e:
        print("[!] ffmpeg error:", e)


def ask_int(prompt, default, min_val, max_val):
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    try:
        v = int(raw)
    except ValueError:
        print("[!] Invalid number, using default.")
        return default
    if v < min_val or v > max_val:
        print(f"[!] Out of range ({min_val}-{max_val}), using default.")
        return default
    return v


def ask_float(prompt, default, min_val, max_val):
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    try:
        v = float(raw)
    except ValueError:
        print("[!] Invalid number, using default.")
        return default
    if v < min_val or v > max_val:
        print(f"[!] Out of range ({min_val}-{max_val}), using default.")
        return default
    return v


def ask_string(prompt, default):
    raw = input(f"{prompt} [{default}]: ").strip()
    return raw or default


def build_output_path(input_path: Path, suffix: str, ext_override: str = None) -> Path:
    stem = input_path.stem
    if ext_override is not None:
        ext = ext_override
    else:
        ext = input_path.suffix or ".mp4"
    return OUTPUT_DIR / f"{stem}_{suffix}{ext}"


def parse_paths(raw: str):
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    paths = []
    for p in parts:
        path = Path(p).expanduser().resolve()
        if path.exists():
            paths.append(path)
        else:
            print(f"[!] Skipping, file not found: {path}")
    return paths


def ffmpeg_escape_text(s: str) -> str:
    """
    Escape characters that upset drawtext (\, :, ', newlines → \n).
    This is not perfect, but works well for captions / ASCII blocks.
    """
    s = s.replace("\\", "\\\\")
    s = s.replace(":", r"\:")
    s = s.replace("'", r"\\'")
    s = s.replace("\n", r"\n")
    return s


# ----------------- IMAGE FILTER BUILDERS (FFMPEG) ----------------- #

def build_img_rgb_shift():
    shift = ask_int("Shift amount in pixels (0-100)", 15, 0, 100)
    return f"chromashift=crh={shift}:cbh=-{shift}"


def build_img_vhs_noise():
    strength = ask_int("Noise strength (0-100)", 25, 0, 100)
    return f"noise=alls={strength}:allf=t+u"


def build_img_pixelate():
    factor = ask_int("Pixelation factor (2-80, higher = chunkier)", 10, 2, 80)
    return f"scale=iw/{factor}:ih/{factor},scale=iw*{factor}:ih*{factor}"


def build_img_neon_dream():
    hue_deg = ask_int("Hue rotation in degrees (0-360)", 90, 0, 360)
    sat = ask_float("Saturation multiplier (0.0-5.0)", 1.8, 0.0, 5.0)
    return f"hue=h={hue_deg}:s={sat}"


def build_img_ghost_lines():
    low = ask_float("Edge low threshold (0.0-1.0)", 0.08, 0.0, 1.0)
    high = ask_float("Edge high threshold (0.0-1.0)", 0.35, 0.0, 1.0)
    return f"edgedetect=low={low}:high={high}"


IMAGE_EFFECTS = {
    "1": ("RGB SHIFT (chromatic bleed)", build_img_rgb_shift),
    "2": ("VHS NOISE (static / grain)", build_img_vhs_noise),
    "3": ("PIXELATE (low-res blocks)", build_img_pixelate),
    "4": ("NEON DREAM (hue/sat shift)", build_img_neon_dream),
    "5": ("GHOST LINES (edge detect)", build_img_ghost_lines),
}


def interactive_build_image_filter_chain():
    print("\nSelect image glitch effects (chainable).")
    for key, (name, _) in IMAGE_EFFECTS.items():
        print(f"  {key}. {name}")
    raw = input("Enter numbers separated by commas (e.g. 1,3,4): ").strip()

    selected = []
    if raw:
        for part in raw.split(","):
            p = part.strip()
            if p in IMAGE_EFFECTS and p not in selected:
                selected.append(p)

    if not selected:
        print("[!] No valid effects selected.")
        return None

    filters = []
    for key in selected:
        name, builder = IMAGE_EFFECTS[key]
        print(f"\n--- Configure {name} ---")
        filt = builder()
        filters.append(filt)

    chain = ",".join(filters)
    print(f"\n[+] Image filter chain:\n    {chain}")
    return chain


def apply_image_chain(input_path: Path, filter_chain: str):
    out_path = build_output_path(input_path, "glitch")
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vf",
        filter_chain,
        "-frames:v",
        "1",  # ensure single image
        str(out_path),
    ]
    print(f"\n[+] Glitching image {input_path} → {out_path}")
    run_cmd(cmd)


# ----------------- GLITCHART DATABENDING (IMAGES) ----------------- #

def glitchart_image_batch(paths):
    """
    Databending mode using the glitchart library.
    Works best on JPG / PNG. Keeps originals.
    """
    if not HAS_GLITCHART:
        print("[!] glitchart is not installed. Run: pip3 install glitchart")
        return

    if not paths:
        print("[!] No files selected.")
        return

    print("\n=== GlitchArt databending mode (images) ===")
    seed_raw = input("[?] Seed (blank for random, or number to repeat a look): ").strip()
    seed = int(seed_raw) if seed_raw else None

    try:
        min_amt = int(input("[?] Min glitch amount (0-10, default 2): ") or "2")
        max_amt = int(input("[?] Max glitch amount (0-10, default 6): ") or "6")
    except ValueError:
        print("[!] Invalid numbers, falling back to 2–6.")
        min_amt, max_amt = 2, 6

    if min_amt < 0:
        min_amt = 0
    if max_amt > 10:
        max_amt = 10
    if max_amt < min_amt:
        max_amt = min_amt

    for p in paths:
        p = Path(p)
        ext = p.suffix.lower()
        print(f"[+] Glitching with glitchart → {p}")
        try:
            if ext in [".png"]:
                glitchart.png(
                    str(p),
                    seed=seed,
                    min_amount=min_amt,
                    max_amount=max_amt,
                    inplace=False,
                )
            elif ext in [".jpg", ".jpeg"]:
                glitchart.jpeg(
                    str(p),
                    seed=seed,
                    min_amount=min_amt,
                    max_amount=max_amt,
                    inplace=False,
                )
            else:
                print(f"[!] Skipping {p.name} (unsupported ext for glitchart)")
                continue
            print(f"    → Saved as *_glitch{ext} next to original")
        except Exception as e:
            print(f"[!] glitchart error on {p}: {e}")


# ----------------- HEX / BYTE-LEVEL DATABENDING (IMAGES) ----------------- #

def hex_databending_batch(paths):
    """
    Byte-level corruption inspired by manual hex editing:
    - Protects the header (configurable first N bytes).
    - Randomly corrupts slices deeper in the file.
    Outputs to output/<name>_hexglitch.ext, originals untouched.
    """
    if not paths:
        print("[!] No files selected.")
        return

    print("\n=== Hex / byte-level glitch (databending) ===")
    protect = ask_int("Protect first N header bytes (to keep file decodable)", 1000, 0, 500000)
    passes = ask_int("Number of corruption passes per file", 3, 1, 50)
    max_chunk = ask_int("Max bytes to corrupt per pass", 64, 1, 10000)

    for p in paths:
        p = Path(p)
        print(f"[+] Hex-glitching → {p}")
        try:
            data = bytearray(p.read_bytes())
        except Exception as e:
            print(f"[!] Could not read {p}: {e}")
            continue

        length = len(data)
        if length <= protect + 1:
            print(f"[!] File too small to glitch after header, skipping {p.name}")
            continue

        for _ in range(passes):
            start = random.randint(protect, length - 1)
            chunk_len = random.randint(1, min(max_chunk, length - start))
            for i in range(chunk_len):
                data[start + i] = random.randint(0, 255)

        out_ext = p.suffix or ".bin"
        out_path = build_output_path(p, "hexglitch", ext_override=out_ext)
        try:
            out_path.write_bytes(data)
            print(f"    → Wrote {out_path}")
        except Exception as e:
            print(f"[!] Could not write {out_path}: {e}")


# ----------------- TEXT / ASCII OVERLAY (IMAGES & VIDEOS) ----------------- #

def text_overlay_batch(paths, media_type: str):
    """
    Adds a caption / text block to top or bottom of each file in paths.
    media_type: 'image' or 'video'.
    """
    if not paths:
        print("[!] No files selected.")
        return

    print("\n=== Text / ASCII overlay ===")
    mode = input("Overlay type: 1) simple text  2) text from file: ").strip() or "1"

    if mode == "1":
        print("[?] Enter the text to overlay.")
        print("    For line breaks, you can type '\\n'.")
        raw_text = input("Text: ")
        text = raw_text.replace("\\n", "\n")
    else:
        path = input("[?] Path to text file (ASCII art, etc.): ").strip()
        tpath = Path(path).expanduser().resolve()
        if not tpath.exists():
            print("[!] Text file not found.")
            return
        text = tpath.read_text(errors="ignore")

    position = input("Position (top/bottom, default top): ").strip().lower() or "top"
    fontsize = input("Font size (default 36): ").strip() or "36"
    color = input("Font color (default white): ").strip() or "white"

    fontfile = input(
        f"Font file path [ENTER for {DEFAULT_FONT}]: "
    ).strip() or DEFAULT_FONT

    text_escaped = ffmpeg_escape_text(text)

    if position.startswith("b"):
        y_expr = "h-text_h-40"
    else:
        y_expr = "40"

    draw = (
        f"drawtext=fontfile='{fontfile}':text='{text_escaped}':"
        f"fontsize={fontsize}:fontcolor={color}:"
        "bordercolor=black:borderw=2:"
        "x=(w-text_w)/2:"
        f"y={y_expr}"
    )

    for inp in paths:
        inp = Path(inp)
        if media_type == "image":
            out = OUTPUT_DIR / f"{inp.stem}_caption{inp.suffix}"
            cmd = [
                "ffmpeg",
                "-y",
                "-i", str(inp),
                "-vf", draw,
                str(out),
            ]
        else:  # video
            out = OUTPUT_DIR / f"{inp.stem}_caption.mp4"
            cmd = [
                "ffmpeg",
                "-y",
                "-i", str(inp),
                "-vf", draw,
                "-c:a", "copy",
                str(out),
            ]

        print(f"[+] Adding overlay → {out}")
        try:
            subprocess.run(cmd, check=True)
        except subprocess.CalledProcessError as e:
            print(f"[!] ffmpeg error on {inp}: {e}")


# ----------------- VIDEO FILTER BUILDERS (STANDARD) ----------------- #

def build_vid_rgb_shift():
    return build_img_rgb_shift(), None


def build_vid_vhs_noise():
    return build_img_vhs_noise(), None


def build_vid_pixelate():
    return build_img_pixelate(), None


def build_vid_neon_dream():
    return build_img_neon_dream(), None


def build_vid_ghost_lines():
    return build_img_ghost_lines(), None


def build_vid_time_stutter():
    # timing edit: slow down / speed up
    speed = ask_float("Playback speed factor (0.5-2.0, <1 = slower, >1 = faster)", 0.7, 0.5, 2.0)
    video_filter = f"setpts={1.0/speed}*PTS"
    audio_filter = f"atempo={speed}"
    return video_filter, audio_filter


VIDEO_EFFECTS_STANDARD = {
    "1": ("RGB SHIFT (chromatic bleed)", build_vid_rgb_shift),
    "2": ("VHS NOISE (static / grain)", build_vid_vhs_noise),
    "3": ("PIXELATE (low-res blocks)", build_vid_pixelate),
    "4": ("NEON DREAM (hue/sat shift)", build_vid_neon_dream),
    "5": ("GHOST LINES (edge detect)", build_vid_ghost_lines),
    "6": ("SPEED SHIFT (slow/fast playback)", build_vid_time_stutter),
}


def interactive_build_video_chain():
    print("\nSelect video glitch effects (chainable).")
    for key, (name, _) in VIDEO_EFFECTS_STANDARD.items():
        print(f"  {key}. {name}")
    raw = input("Enter numbers separated by commas (e.g. 1,3,6): ").strip()

    selected = []
    if raw:
        for part in raw.split(","):
            p = part.strip()
            if p in VIDEO_EFFECTS_STANDARD and p not in selected:
                selected.append(p)

    if not selected:
        print("[!] No valid effects selected.")
        return None, None

    v_filters = []
    a_filters = []
    for key in selected:
        name, builder = VIDEO_EFFECTS_STANDARD[key]
        print(f"\n--- Configure {name} ---")
        vf, af = builder()
        if vf:
            v_filters.append(vf)
        if af:
            a_filters.append(af)

    v_chain = ",".join(v_filters)
    a_chain = ",".join(a_filters) if a_filters else None

    print(f"\n[+] Video filter chain:\n    {v_chain}")
    if a_chain:
        print(f"[+] Audio filter chain:\n    {a_chain}")
    return v_chain, a_chain


def apply_video_chain(input_path: Path, v_chain: str, a_chain: str):
    out_path = build_output_path(input_path, "glitch")
    cmd = ["ffmpeg", "-y", "-i", str(input_path)]

    if v_chain:
        cmd += ["-vf", v_chain]

    if a_chain:
        cmd += ["-af", a_chain]
    else:
        cmd += ["-c:a", "copy"]

    cmd.append(str(out_path))

    print(f"\n[+] Glitching video {input_path} → {out_path}")
    run_cmd(cmd)


# ----------------- VIDEO ADVANCED / CODEC GLITCHES ----------------- #

def advanced_datascope(input_path: Path):
    print("\n=== DATASCOPE OVERLAY ===")
    w = ask_int("Datascope width", 1024, 64, 4096)
    h = ask_int("Datascope height", 1024, 64, 4096)
    mode = ask_string(
        "Blend mode (hardlight, screen, difference, overlay, etc.)", "hardlight"
    )
    opacity = ask_float("Blend opacity for datascope (0.0-1.0)", 0.7, 0.0, 1.0)
    out_path = build_output_path(input_path, "datascope")

    # Scale original to match datascope size so blend inputs match
    fc = (
        f"[0:v]split=2[orig][scope];"
        f"[orig]scale={w}x{h}[orig_s];"
        f"[scope]datascope=mode=color:size={w}x{h}[ds];"
        f"[orig_s][ds]blend=all_mode={mode}:all_opacity={opacity}[v]"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-filter_complex",
        fc,
        "-map",
        "[v]",
        "-c:a",
        "copy",
        str(out_path),
    ]
    print(f"\n[+] Applying datascope overlay to {input_path} → {out_path}")
    run_cmd(cmd)


def advanced_snow_codec(input_path: Path):
    print("\n=== SNOW CODEC CORRUPTION ===")
    size = ask_int("Scale size (e.g. 512 → 512x512)", 512, 64, 4096)
    aggression = ask_int("Aggression level (1-5, 1 = subtle, 5 = meltdown)", 3, 1, 5)

    # Pixel-space noise (0-100 is useful range for noise=alls)
    pixel_noise = min(100, 10 * aggression + 20)
    # Bitstream noise for the bsf (higher = more broken GOP/blocks)
    bit_noise = 800 * aggression * aggression

    temp_path = build_output_path(input_path, "snow_temp", ext_override=".avi")
    out_path = build_output_path(input_path, "snow")

    # Visible noise + downscale for crunch
    vf = f"scale={size}x{size},noise=alls={pixel_noise}:allf=t+u"

    # Step 1: corrupt with snow codec + bitstream noise
    cmd1 = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vf",
        vf,
        "-c:v",
        "snow",
        "-bsf:v",
        f"noise=amount={bit_noise}*not(key)",
        str(temp_path),
    ]
    print(f"\n[+] Snow corruption pass (aggression={aggression}) → {temp_path}")
    run_cmd(cmd1)

    # Step 2: re-encode to mp4
    cmd2 = [
        "ffmpeg",
        "-y",
        "-i",
        str(temp_path),
        str(out_path),
    ]
    print(f"\n[+] Re-encoding corrupted video → {out_path}")
    run_cmd(cmd2)

    try:
        os.remove(temp_path)
    except OSError:
        pass


def advanced_x265_glitch(input_path: Path):
    print("\n=== X265 BLOCK / SLICE GLITCH ===")
    size = ask_int("Scale size (e.g. 512 → 512x512)", 512, 64, 4096)
    aggression = ask_int("Aggression level (1-5, 1 = subtle, 5 = meltdown)", 3, 1, 5)

    # Pixel noise for visible grain/blocking
    pixel_noise = min(100, 12 * aggression + 10)
    # Bitstream noise to hammer the encoded stream
    bit_noise = 1000 * aggression * aggression
    # More aggression → higher CRF (worse quality, more artifacts)
    crf = 26 + aggression * 3

    temp_path = build_output_path(input_path, "x265_temp", ext_override=".mp4")
    out_path = build_output_path(input_path, "x265")

    # x265 params: long GOP, no deblock/SAO, no psycho optimizations, crunchy CRF
    xparams = (
        f"min_keyint=1000:keyint=1000:"
        f"bframes=0:min_cu_size=8:ctu=16:slices=1:"
        f"no-sao=1:no-deblock=1:aq-mode=0:psy-rd=0.0:psy-rdoq=0.0:crf={crf}"
    )

    # Visible glitch chain before encoding:
    #  - scale to chunky size
    #  - add strong temporal smear with tmix
    vf = (
        f"scale={size}x{size},"
        f"noise=alls={pixel_noise}:allf=t+u,"
        "tmix=frames=3:weights='1 1 1'"
    )

    cmd1 = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vf",
        vf,
        "-c:v",
        "libx265",
        "-x265-params",
        xparams,
        "-bsf:v",
        f"noise=amount={bit_noise}",
        str(temp_path),
    ]
    print(f"\n[+] X265 glitch encode (aggression={aggression}, CRF={crf}) → {temp_path}")
    run_cmd(cmd1)

    cmd2 = [
        "ffmpeg",
        "-y",
        "-i",
        str(temp_path),
        str(out_path),
    ]
    print(f"\n[+] Re-encoding glitched video → {out_path}")
    run_cmd(cmd2)

    try:
        os.remove(temp_path)
    except OSError:
        pass


ADVANCED_VIDEO_MODULES = {
    "1": ("Datascope overlay + blend", advanced_datascope),
    "2": ("Snow codec corruption", advanced_snow_codec),
    "3": ("X265 block/slice glitch", advanced_x265_glitch),
}


def interactive_advanced_video_mode(input_paths):
    print("\nAdvanced video glitch modules:")
    for key, (name, _) in ADVANCED_VIDEO_MODULES.items():
        print(f"  {key}. {name}")
    choice = input("Choose one advanced module: ").strip()

    if choice not in ADVANCED_VIDEO_MODULES:
        print("[!] Invalid choice.")
        return

    name, func = ADVANCED_VIDEO_MODULES[choice]
    print(f"\n[+] Selected module: {name}")
    for p in input_paths:
        func(p)


# ----------------- COMBINE / MESH ----------------- #

def combine_blend(paths, media_type):
    if len(paths) < 2:
        print("[!] Need at least 2 files to blend.")
        return
    if len(paths) > 2:
        print("[*] Blending only first 2 inputs for now.")
        paths = paths[:2]

    mode = ask_string("Blend mode", "hardlight")
    opacity = ask_float("Top layer opacity (0.0-1.0)", 1.0, 0.0, 1.0)

    print("\nLayer order:")
    print("  1. First path on top of second (default)")
    print("  2. Second path on top of first")
    order = ask_int("Choose layer order", 1, 1, 2)

    # Determine which input is top vs bottom, default is order given
    if order == 1:
        top = paths[0]
        bottom = paths[1]
    else:
        top = paths[1]
        bottom = paths[0]

    out_ext = ".mp4" if media_type == "video" else bottom.suffix or ".png"
    out_path = build_output_path(bottom, f"blend_{mode}", ext_override=out_ext)

    # top is input 0, bottom is input 1
    fc = (
        "[0:v][1:v]scale2ref[fg][bg];"
        f"[bg][fg]blend=all_mode={mode}:all_opacity={opacity}[v]"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(top),
        "-i", str(bottom),
        "-filter_complex", fc,
        "-map", "[v]",
    ]

    if media_type == "video":
        # keep audio from the bottom/base layer
        cmd += ["-map", "1:a?", "-c:a", "copy"]

    cmd.append(str(out_path))

    print(f"\n[+] Blending top={top} over bottom={bottom} → {out_path}")
    run_cmd(cmd)


def combine_stack(paths, media_type, direction="h"):
    if len(paths) < 2:
        print("[!] Need at least 2 files to stack.")
        return
    if len(paths) > 2:
        print("[*] Stacking only first 2 inputs for now.")
        paths = paths[:2]

    in0, in1 = paths
    out_ext = ".mp4" if media_type == "video" else in0.suffix or ".png"
    suffix = "hstack" if direction == "h" else "vstack"
    out_path = build_output_path(in0, suffix, ext_override=out_ext)

    stack_filter = "hstack=inputs=2" if direction == "h" else "vstack=inputs=2"

    fc = (
        "[0:v]scale=iw:-1[a];"
        "[1:v]scale=iw:-1[b];"
        "[a][b]" + stack_filter + "[v]"
    )

    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(in0),
        "-i", str(in1),
        "-filter_complex", fc,
        "-map", "[v]",
    ]
    if media_type == "video":
        cmd += ["-map", "0:a?", "-c:a", "copy"]

    cmd.append(str(out_path))

    print(f"\n[+] {suffix.UPPER()} {in0} and {in1} → {out_path}")
    run_cmd(cmd)


def combine_grid_2x2(paths, media_type):
    if len(paths) < 4:
        print("[!] Need 4 files for a 2x2 grid.")
        return
    if len(paths) > 4:
        print("[*] Using only first 4 inputs for the grid.")
        paths = paths[:4]

    w = ask_int("Grid cell width", 640, 64, 4096)
    h = ask_int("Grid cell height", 360, 64, 4096)

    inputs = []
    for p in paths:
        inputs += ["-i", str(p)]

    out_ext = ".mp4" if media_type == "video" else paths[0].suffix or ".png"
    out_path = build_output_path(paths[0], "grid2x2", ext_override=out_ext)

    fc = (
        f"[0:v]scale={w}x{h}[a];"
        f"[1:v]scale={w}x{h}[b];"
        f"[2:v]scale={w}x{h}[c];"
        f"[3:v]scale={w}x{h}[d];"
        "[a][b][c][d]xstack=inputs=4:layout=0_0|{w}_0|0_{h}|{w}_{h}[v]"
    ).format(w=w, h=h)

    cmd = ["ffmpeg", "-y"] + inputs + ["-filter_complex", fc, "-map", "[v]"]
    if media_type == "video":
        cmd += ["-map", "0:a?", "-c:a", "copy"]

    cmd.append(str(out_path))

    print(f"\n[+] 2x2 grid → {out_path}")
    run_cmd(cmd)


def combine_menu(media_type):
    print("\nCombine / mesh options:")
    print("  1. Blend two inputs with a blend mode")
    print("  2. Horizontal stack (side-by-side)")
    print("  3. Vertical stack (top/bottom)")
    print("  4. 2x2 grid (needs 4 inputs)")
    choice = input("Choose (1-4): ").strip()
    return choice


# ----------------- VIDEO PNG OVERLAY (LOGO / TEXTURE) ----------------- #

def video_overlay_png_menu(video_paths):
    """
    Overlay a PNG (with or without transparent background) on top of one or more videos.
    This is perfect for logos, textures, or repeating visual motifs.
    """
    if not video_paths:
        print("[!] No video files provided.")
        return

    clear_screen()
    print("\n=== VIDEO + PNG OVERLAY ===")
    print("This mode overlays a PNG (transparent background supported) on your video(s).")
    print("Use a logo, texture, or any PNG and let it ride on top of your glitches.\n")
    print("[!] Heads up: PNG overlays and full-frame blends can be slow to render,")
    print("    especially on long or high-resolution clips. Let ffmpeg cook.\n")

    png_path_raw = input("[?] Enter path to your PNG/logo file: ").strip()
    png_paths = parse_paths(png_path_raw)
    if not png_paths:
        print("[!] No valid PNG file.")
        return
    png = png_paths[0]

    print("\nOverlay style:")
    print("  1. Static center")
    print("  2. Static corner / custom position")
    print("  3. Bouncing overlay (orbit-style)")
    choice = input("Choose (1-3) [1]: ").strip() or "1"

    # Precompute overlay expression (for normal alpha overlay)
    if choice == "1":
        # Centered logo / texture
        overlay_expr = "overlay=(main_w-overlay_w)/2:(main_h-overlay_h)/2:format=auto"
    elif choice == "2":
        print("\nPosition presets:")
        print("  1. Top-left")
        print("  2. Top-right")
        print("  3. Bottom-left")
        print("  4. Bottom-right")
        print("  5. Custom x/y offsets")
        preset = input("Choose position (1-5) [1]: ").strip() or "1"

        if preset == "1":
            x_expr = "10"
            y_expr = "10"
        elif preset == "2":
            x_expr = "main_w-overlay_w-10"
            y_expr = "10"
        elif preset == "3":
            x_expr = "10"
            y_expr = "main_h-overlay_h-10"
        elif preset == "4":
            x_expr = "main_w-overlay_w-10"
            y_expr = "main_h-overlay_h-10"
        else:
            # Custom numeric offsets from top-left corner
            x_off = ask_int("Custom X offset (pixels from left)", 40, -10000, 10000)
            y_off = ask_int("Custom Y offset (pixels from top)", 40, -10000, 10000)
            x_expr = str(x_off)
            y_expr = str(y_off)

        overlay_expr = f"overlay={x_expr}:{y_expr}:format=auto"
    else:
        # Bouncing / orbit overlay using sin/cos over time
        overlay_expr = (
            "overlay="
            "x='(main_w-overlay_w)/2 + sin(t*2)*((main_w-overlay_w)/2-20)':"
            "y='(main_h-overlay_h)/2 + cos(t*2)*((main_h-overlay_h)/2-20)':"
            "format=auto"
        )

    print("\nBlend / compositing mode for PNG:")
    print("  1. Normal alpha overlay (respect PNG transparency & position)")
    print("  2. Full-frame blend mode (ffmpeg blend=all_mode=...)")
    blend_choice = input("Choose (1-2) [1]: ").strip() or "1"

    blend_mode = None
    blend_opacity = None
    if blend_choice == "2":
        blend_mode = ask_string(
            "Blend mode (addition, screen, overlay, multiply, difference, etc.)",
            "screen",
        )
        blend_opacity = ask_float("Blend opacity (0.0-1.0)", 0.8, 0.0, 1.0)
        print("\n[*] Note: full-frame blend mode ignores the bounce/position math and")
        print("    blends the PNG as a texture over the whole frame using scale2ref.")

    for video in video_paths:
        video = Path(video)
        out_path = build_output_path(video, "png_overlay", ext_override=".mp4")

        if blend_choice == "1":
            # Normal alpha overlay with all the positioning / bouncing options
            fc = f"[0:v][1:v]{overlay_expr}[v]"
        else:
            # Full-frame blend: base video + PNG as texture with chosen mode/opacity
            fc = (
                "[0:v][1:v]scale2ref[fg][bg];"
                f"[bg][fg]blend=all_mode={blend_mode}:all_opacity={blend_opacity}[v]"
            )

        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(video),
            "-loop", "1", "-i", str(png),
            "-filter_complex", fc,
            "-map", "[v]",
            "-map", "0:a?",
            "-c:a", "copy",
            str(out_path),
        ]

        print(f"\n[+] Overlaying {png} on {video} → {out_path}")
        run_cmd(cmd)


# ----------------- AUDIO / MUSIC TOOLS ----------------- #

def attach_music_to_video():
    """
    Attach an external music track to a (glitched or normal) video.
    Lets you either trim the track or loop it over the video.
    """
    v_path = input("\n[?] Enter path to your video file: ").strip()
    videos = parse_paths(v_path)
    if not videos:
        print("[!] No valid video file.")
        return
    video = videos[0]

    a_path = input("[?] Enter path to your audio file (mp3/wav/etc.): ").strip()
    audios = parse_paths(a_path)
    if not audios:
        print("[!] No valid audio file.")
        return
    audio = audios[0]

    print("\nAudio handling:")
    print("  1. Trim audio to match video length (shortest)")
    print("  2. Loop audio over entire video (stream_loop)")
    mode = input("Choice (1/2) [1]: ").strip() or "1"

    out_path = build_output_path(video, "with_music", ext_override=".mp4")

    if mode == "2":
        # loop audio, stop when video ends
        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(video),
            "-stream_loop", "-1",
            "-i", str(audio),
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "copy",
            "-shortest",
            str(out_path),
        ]
    else:
        # simple trim: shortest of video / audio wins
        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(video),
            "-i", str(audio),
            "-map", "0:v",
            "-map", "1:a",
            "-c:v", "copy",
            "-shortest",
            str(out_path),
        ]

    print(f"\n[+] Attaching music to video → {out_path}")
    run_cmd(cmd)


def image_to_music_video():
    """
    Turn a (glitched) image + audio track into a simple music video.
    Ensures the image is scaled to even dimensions for libx264/yuv420p.
    """
    img_path = input("\n[?] Enter path to your image file: ").strip()
    images = parse_paths(img_path)
    if not images:
        print("[!] No valid image file.")
        return
    image = images[0]

    a_path = input("[?] Enter path to your audio file (mp3/wav/etc.): ").strip()
    audios = parse_paths(a_path)
    if not audios:
        print("[!] No valid audio file.")
        return
    audio = audios[0]

    out_path = build_output_path(image, "musicvid", ext_override=".mp4")

    # Make sure width/height are even for libx264 + yuv420p
    # trunc(iw/2)*2 → nearest lower even number, same for height
    vf = "scale=trunc(iw/2)*2:trunc(ih/2)*2"

    print("\n[+] Building still-image music video (image + audio).")
    cmd = [
        "ffmpeg",
        "-y",
        "-loop", "1",
        "-i", str(image),
        "-i", str(audio),
        "-vf", vf,
        "-c:v", "libx264",
        "-tune", "stillimage",
        "-c:a", "copy",
        "-shortest",
        "-pix_fmt", "yuv420p",
        str(out_path),
    ]
    run_cmd(cmd)


def audio_reactive_glitch_mode():
    """
    Experimental audio-reactive mode:
    Uses the video's audio to generate a moving spectrum and blends it over the picture.
    This version auto-scales the spectrum to match the video size using scale2ref.
    """
    v_path = input("\n[?] Enter path to your video file (with audio): ").strip()
    videos = parse_paths(v_path)
    if not videos:
        print("[!] No valid video file.")
        return
    video = videos[0]

    opacity = ask_float("Overlay opacity for spectrum (0.0-1.0)", 0.7, 0.0, 1.0)

    # Build filter graph:
    #  1) Make spectrum from audio  → [spec]
    #  2) scale2ref: resize [spec] to match [0:v] → [spec_s], [vid]
    #  3) Blend the resized spectrum over the video → [v]
    fc = (
        "[0:a]showspectrum=mode=combined:color=intensity:slide=scroll[spec];"
        "[spec][0:v]scale2ref[spec_s][vid];"
        f"[vid][spec_s]blend=all_mode=screen:all_opacity={opacity}[v]"
    )

    out_path = build_output_path(video, "audio_reactive", ext_override=".mp4")

    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(video),
        "-filter_complex", fc,
        "-map", "[v]",
        "-map", "0:a?",
        "-c:a", "copy",
        str(out_path),
    ]

    print(f"\n[+] Audio-reactive spectrum overlay → {out_path}")
    run_cmd(cmd)


def mode_audio_music():
    """
    Audio / Music branch:
      A. Attach music track to video
      B. Turn image + music into video
      C. Audio-reactive glitch mode (experimental)
    """
    while True:
        print("\nAudio / Music tools:")
        print("  A. Attach music track to video")
        print("  B. Turn glitched image + music into a video")
        print("  C. Audio-reactive glitch mode (experimental)")
        print("  X. Back to main menu")

        choice = input("Choice (A-C or X): ").strip().upper()

        if choice == "A":
            attach_music_to_video()
        elif choice == "B":
            image_to_music_video()
        elif choice == "C":
            audio_reactive_glitch_mode()
        elif choice == "X":
            break
        else:
            print("[!] Invalid choice.")


# ----------------- HIGH-LEVEL MODES ----------------- #

def mode_single_or_batch(single: bool):
    print("\nWhat type of media?")
    print("  1. Images")
    print("  2. Videos")
    mtype = input("Choice (1/2): ").strip()

    if mtype not in ("1", "2"):
        print("[!] Invalid media type.")
        return

    if single:
        file_path = input("\n[?] Enter path to your file: ").strip()
        paths = parse_paths(file_path)
    else:
        raw = input("\n[?] Enter paths separated by commas: ").strip()
        paths = parse_paths(raw)

    if not paths:
        print("[!] No valid files found.")
        return

    if mtype == "1":
        # images
        print("\nImage glitch mode:")
        print("  1. FFmpeg filter chain (ArtForge effects)")
        print("  2. GlitchArt databending (JPEG/PNG corruption)")
        print("  3. Text / ASCII overlay")
        print("  4. Hex / byte-level databending (raw corruption)")
        imode = input("Choice (1-4): ").strip() or "1"

        if imode == "1":
            chain = interactive_build_image_filter_chain()
            if not chain:
                return
            for p in paths:
                apply_image_chain(p, chain)
        elif imode == "2":
            glitchart_image_batch(paths)
        elif imode == "3":
            text_overlay_batch(paths, media_type="image")
        elif imode == "4":
            hex_databending_batch(paths)
        else:
            print("[!] Invalid image mode.")
            return

    else:
        # videos
        print("\nVideo glitch mode:")
        print("  1. Standard filter chain (chainable)")
        print("  2. Advanced / codec glitches (datascope, snow, x265)")
        print("  3. Text / ASCII overlay")
        print("  4. PNG overlay (logo / texture)")
        vmode = input("Choose (1-4): ").strip() or "1"

        if vmode == "1":
            v_chain, a_chain = interactive_build_video_chain()
            if not v_chain:
                return
            for p in paths:
                apply_video_chain(p, v_chain, a_chain)
        elif vmode == "2":
            interactive_advanced_video_mode(paths)
        elif vmode == "3":
            text_overlay_batch(paths, media_type="video")
        elif vmode == "4":
            video_overlay_png_menu(paths)
        else:
            print("[!] Invalid video mode.")


def mode_combine():
    print("\nCombine what type of media?")
    print("  1. Images")
    print("  2. Videos")
    mtype = input("Choice (1/2): ").strip()

    if mtype not in ("1", "2"):
        print("[!] Invalid media type.")
        return

    raw = input("\n[?] Enter paths to combine (comma-separated): ").strip()
    paths = parse_paths(raw)
    if not paths:
        print("[!] No valid files.")
        return

    choice = combine_menu("image" if mtype == "1" else "video")
    media_type = "image" if mtype == "1" else "video"

    if choice == "1":
        combine_blend(paths, media_type)
    elif choice == "2":
        combine_stack(paths, media_type, direction="h")
    elif choice == "3":
        combine_stack(paths, media_type, direction="v")
    elif choice == "4":
        combine_grid_2x2(paths, media_type)
    else:
        print("[!] Invalid combine option.")


# ----------------- MAIN ----------------- #

def main():
    print(f"""{Colors.PURPLE}
============================================================================================
   █████████   ███████████   ███████████    ██████                                      
  ███░░░░░███ ░░███░░░░░███ ░█░░░███░░░█   ███░░███                                     
 ░███    ░███  ░███    ░███ ░   ░███  ░   ░███ ░░░   ██████  ████████   ███████  ██████ 
 ░███████████  ░██████████      ░███     ███████    ███░░███░░███░░███ ███░░███ ███░░███
 ░███░░░░░███  ░███░░░░░███     ░███    ░░░███░    ░███ ░███ ░███ ░░░ ░███ ░███░███████ 
 ░███    ░███  ░███    ░███     ░███      ░███     ░███ ░███ ░███     ░███ ░███░███░░░  
 █████   █████ █████   █████    █████     █████    ░░██████  █████    ░░███████░░██████ 
░░░░░   ░░░░░ ░░░░░   ░░░░░    ░░░░░     ░░░░░      ░░░░░░  ░░░░░      ░░░░░███ ░░░░░░  
                                                                       ███ ░███         
                                                                      ░░██████          
                                                                       ░░░░░░           
=============================================================================================
For artists, hackers, and glitch witches
 ✩₊˚.⋆☾⋆⁺₊✧ by: ek0ms savi0r ✩₊˚.⋆☾⋆⁺₊✧
{Colors.END}""")

    while True:
        print("\nMain menu:")
        print("  1. Glitch a single file")
        print("  2. Glitch multiple files (same settings)")
        print("  3. Combine / mesh multiple files")
        print("  4. Audio / Music tools")
        print("  5. Exit")

        choice = input("Choice (1-5): ").strip()

        if choice == "1":
            mode_single_or_batch(single=True)
        elif choice == "2":
            mode_single_or_batch(single=False)
        elif choice == "3":
            mode_combine()
        elif choice == "4":
            mode_audio_music()
        elif choice == "5":
            print("Bye.")
            break
        else:
            print("[!] Invalid choice.")


if __name__ == "__main__":
    main()
