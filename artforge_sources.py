"""Local procedural source images for the ARTFORGE Mutation Lab."""

from artforge_lab import image_dependencies, hash32


def generate_source(kind, seed=404):
    if kind not in ("memory", "circuit", "boot"):
        raise ValueError("Source must be memory, circuit, or boot.")
    _, Image, ImageDraw, ImageFont, _ = image_dependencies()
    image = Image.new("RGB", (960, 720), "#111111")
    draw = ImageDraw.Draw(image)
    state = seed

    def rand():
        nonlocal state
        state = hash32(state + 1)
        return state / 4294967296

    def hex_value(digits):
        return f"{int(rand()*16**digits):0{digits}X}"

    def text(value, x, y, color="#cccccc", size=12):
        try:
            font = ImageFont.truetype("DejaVuSansMono.ttf", size)
        except OSError:
            font = ImageFont.load_default()
        draw.text((x, y), value, font=font, fill=color)

    def frame(x, y, w, h, title):
        draw.rectangle((x, y, x + w, y + h), outline="#777777")
        draw.rectangle((x, y, x + w, y + 25), fill="#bcbcbc")
        text(title, x + 8, y + 4, "#111111", 11)

    if kind == "memory":
        text("ARTFORGE / VOLATILE MEMORY", 30, 27, "#eeeeee", 24)
        text(f"SEGMENT 0x{hex_value(6)} / SEED {seed}", 30, 65, "#999999")
        frame(28, 104, 904, 517, "MEMORY INSPECTOR / RAW BYTE VIEW")
        text(
            "OFFSET      00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F      DECODED",
            42,
            143,
            "#eeeeee",
        )
        for row in range(25):
            y = 170 + row * 17
            values = [int(rand() * 256) for _ in range(16)]
            if row % 7 == 0:
                draw.rectangle((37, y - 1, 922, y + 15), fill="#c4c4c4")
            color = "#111111" if row % 7 == 0 else "#cccccc"
            text(f"{row*16:08X}", 42, y, color)
            text(" ".join(f"{v:02X}" for v in values), 145, y, color)
            text(
                "".join(chr(v) if 32 < v < 127 else "." for v in values),
                715,
                y,
                color,
                10,
            )
        text("READ / WRITE / DECAY", 30, 650, "#eeeeee", 18)
        text("SIMULATED DATA. REAL DAMAGE.", 30, 685, "#888888", 10)
    elif kind == "circuit":
        for x in range(0, 960, 20):
            for y in range(0, 720, 20):
                draw.point((x, y), fill="#444444")
        for i in range(70):
            x = round(rand() * 44) * 20 + 20
            y = round(rand() * 29) * 20 + 80
            dx = round(rand() * 8 - 4) * 20
            dy = round(rand() * 8 - 4) * 20
            draw.line(
                [(x, y), (x + dx, y), (x + dx, y + dy), (x + dx + 20, y + dy)],
                fill="#aaaaaa" if i % 4 == 0 else "#555555",
                width=3 if i % 5 == 0 else 1,
            )
            draw.rectangle((x - 3, y - 3, x + 3, y + 3), outline="#888888")
        for i in range(12):
            x = 70 + i % 4 * 225 + rand() * 20
            y = 120 + i // 4 * 180 + rand() * 20
            draw.rectangle((x, y, x + 122, y + 85), fill="#090909", outline="#b0b0b0")
            for pin in range(10):
                draw.rectangle(
                    (x + 8 + pin * 11, y - 9, x + 13 + pin * 11, y), fill="#aaaaaa"
                )
                draw.rectangle(
                    (x + 8 + pin * 11, y + 85, x + 13 + pin * 11, y + 94),
                    fill="#aaaaaa",
                )
            text("AF-" + hex_value(4), x + 15, y + 20, "#eeeeee", 15)
            text(f"U{i+1} / {hex_value(6)}", x + 15, y + 46, "#888888", 10)
        text("AF-01 / SIGNAL PROCESSOR", 28, 26, "#eeeeee", 24)
        text("EXPERIMENTAL BOARD / SIMULATED HARDWARE", 30, 66, "#888888")
        text("NO SERVICEABLE PARTS. ONLY POSSIBILITIES.", 30, 675, "#aaaaaa")
    else:
        text("ARTFORGE SYSTEM BIOS", 35, 30, "#eeeeee", 28)
        text("COPYRIGHT (C) THE BROKEN SIGNAL", 35, 76, "#999999")
        lines = [
            "CPU ............. SIGNAL PROCESSOR / 404 MHz",
            f"MEMORY .......... {64+int(rand()*256)} MB / UNSTABLE",
            "VIDEO ........... ANALOG OUT / SYNC LOST",
            "INPUT ........... ARTIST PRESENT",
            "BUS ............. OPEN CIRCUIT",
            "CACHE ........... " + hex_value(8),
            "CHECKSUM ........ " + hex_value(8) + " / MISMATCH",
            "RESTORING PREVIOUS BEAUTIFUL FAILURE...",
        ]
        for i, line in enumerate(lines):
            text(line, 38, 130 + i * 27, "#ffffff" if i == 3 else "#aaaaaa", 15)
        frame(35, 386, 890, 192, "COMPONENT STATUS / DIAGNOSTIC STILL")
        for i, label in enumerate(["MEMORY", "VIDEO", "AUDIO", "BUS", "VOLTAGE"]):
            x = 53 + i * 172
            text(label, x, 430, "#cccccc", 13)
            for j in range(14):
                color = "#dddddd" if rand() > 0.25 else "#363636"
                draw.rectangle(
                    (x, 459 + j * 6, x + int(rand() * 130) + 12, 462 + j * 6),
                    fill=color,
                )
            text(hex_value(8), x, 558, "#aaaaaa", 11)
        text("PRESS ANYTHING TO MAKE IT WORSE_", 36, 631, "#eeeeee", 19)
        text("GENERATED ARTWORK / NOT A SYSTEM DIAGNOSTIC", 36, 679, "#777777", 10)
    return image
