import contextlib
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

import artforge_lab as lab

ROOT = Path(__file__).resolve().parents[1]


class RecipeTests(unittest.TestCase):
    def test_round_trip_and_no_aliasing(self):
        recipe = lab.preset_recipe("spamware", 2147483647)
        loaded = lab.validate_recipe(json.loads(json.dumps(recipe)))
        self.assertEqual(recipe, loaded)
        loaded["params"]["replicas"] = 1
        self.assertEqual(recipe["params"]["replicas"], 8)

    def test_invalid_recipes_rejected(self):
        for value in [
            None,
            [],
            {},
            dict(app="ARTFORGE", version=True, seed=1, params={}),
            dict(app="ARTFORGE", version=9, seed=1, params={}),
        ]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                lab.validate_recipe(value)
        for key, value in [
            ("rgb", 61),
            ("grain", -1),
            ("tear", float("nan")),
            ("pixel", True),
            ("seed", -1),
            ("filter", "movie=/etc/passwd"),
        ]:
            recipe = lab.preset_recipe("signal-loss")
            if key == "seed":
                recipe["seed"] = value
            else:
                recipe["params"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                lab.validate_recipe(recipe)

    def test_mutations_deterministic_and_bounded(self):
        source = lab.preset_recipe("signal-loss", 42)
        self.assertEqual(lab.mutate_recipe(source, 43), lab.mutate_recipe(source, 43))
        self.assertNotEqual(
            lab.mutate_recipe(source, 43), lab.mutate_recipe(source, 44)
        )
        for seed in range(100):
            lab.validate_recipe(lab.mutate_recipe(source, seed))

    def test_stack_combines_modules_and_latest_shared_controls(self):
        recipe = lab.stack_presets(["vhs-haunt", "spamware"], 19)
        self.assertEqual(recipe["params"]["rgb"], 12)
        self.assertEqual(recipe["params"]["spam"], 85)
        self.assertEqual(recipe["params"]["grain"], 15)
        self.assertIn("VHS HAUNT + SPAMWARE", recipe["name"])

    def test_custom_messages_validate_and_repeat(self):
        recipe = lab.preset_recipe("spamware")
        recipe["messages"] = ["ONE", "TWO"]
        recipe = lab.validate_recipe(recipe)
        self.assertEqual(
            [b["text"] for b in lab.popup_layout(960, 720, recipe)][:3],
            ["ONE", "TWO", "ONE"],
        )
        for bad in [[""], ["x" * 81], ["a"] * 13, ["a\nline"], [123]]:
            with self.assertRaises(ValueError):
                lab.validate_recipe(dict(recipe, messages=bad))

    def test_popup_motion_and_replication(self):
        recipe = lab.preset_recipe("spamware")
        for mode in range(6):
            recipe["params"]["path"] = mode
            self.assertEqual(len(lab.popup_layout(960, 720, recipe)), 8)
            self.assertNotEqual(
                lab.popup_layout(960, 720, recipe, 0),
                lab.popup_layout(960, 720, recipe, 2),
            )
            recipe["params"]["motion"] = 0
            self.assertEqual(
                lab.popup_layout(960, 720, recipe, 0),
                lab.popup_layout(960, 720, recipe, 2),
            )
            recipe["params"]["motion"] = 40

    @unittest.skipUnless(shutil.which("node"), "Node needed for cross-engine checks")
    def test_browser_schema_presets_mutations_and_layout_match(self):
        script = """import {LIMITS,PRESETS,recipeFromPreset,mutate,popupLayout} from './web/recipe.mjs';
        console.log(JSON.stringify({limits:LIMITS,presets:PRESETS.map(p=>recipeFromPreset(p.id)),mutation:mutate(recipeFromPreset('signal-loss',42),43),layouts:[0,1,2,3,4,5].map(path=>{let r=recipeFromPreset('spamware');r.params.path=path;return popupLayout(960,720,r,2);})}));"""
        data = json.loads(
            subprocess.check_output(
                ["node", "--input-type=module", "-e", script], cwd=ROOT, text=True
            )
        )
        self.assertEqual(data["limits"], {k: list(v) for k, v in lab.LIMITS.items()})
        self.assertEqual(data["presets"], [lab.preset_recipe(k) for k in lab.PRESETS])
        self.assertEqual(
            data["mutation"],
            lab.mutate_recipe(lab.preset_recipe("signal-loss", 42), 43),
        )
        for mode in range(6):
            recipe = lab.preset_recipe("spamware")
            recipe["params"]["path"] = mode
            self.assertEqual(
                data["layouts"][mode], lab.popup_layout(960, 720, recipe, 2)
            )


@unittest.skipUnless(
    lab.importlib.util.find_spec("numpy") and lab.importlib.util.find_spec("PIL"),
    "Image dependencies needed",
)
class ImageTests(unittest.TestCase):
    def setUp(self):
        import numpy as np
        from PIL import Image

        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.array = np.random.default_rng(99).integers(
            0, 256, (95, 137, 4), dtype=np.uint8
        )
        self.source = self.root / "original.png"
        Image.fromarray(self.array).save(self.source)

    def test_generated_sources_are_seeded_and_distinct(self):
        from artforge_sources import generate_source

        hashes = set()
        for kind in ("memory", "circuit", "boot"):
            first = generate_source(kind, 404)
            self.assertEqual(first.size, (960, 720))
            self.assertEqual(first.tobytes(), generate_source(kind, 404).tobytes())
            self.assertNotEqual(first.tobytes(), generate_source(kind, 405).tobytes())
            hashes.add(hashlib.sha256(first.tobytes()).hexdigest())
        self.assertEqual(len(hashes), 3)

    def test_image_render_preserves_source_and_alpha(self):
        import numpy as np
        from PIL import Image

        before = self.source.read_bytes()
        recipe = lab.preset_recipe("acid-bloom", 88)
        a = self.root / "a.png"
        b = self.root / "b.png"
        lab.render_image(self.source, a, recipe)
        lab.render_image(self.source, b, recipe)
        self.assertEqual(a.read_bytes(), b.read_bytes())
        self.assertEqual(self.source.read_bytes(), before)
        with Image.open(a) as image:
            self.assertEqual(image.size, (137, 95))
            self.assertEqual(image.mode, "RGBA")
        self.assertTrue(
            np.array_equal(
                lab.render_pixels(
                    self.array,
                    lab.validate_recipe(
                        dict(app="ARTFORGE", version=1, seed=0, params={})
                    ),
                ),
                self.array,
            )
        )

    def test_cli_batch_variants_and_collision_protection(self):
        args = [
            "forge",
            str(self.source),
            "--preset",
            "spamware",
            "--seed",
            "42",
            "--variants",
            "3",
            "--output",
            str(self.root / "output"),
        ]
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(lab.cli(args), 0)
            self.assertEqual(lab.cli(args), 0)
        sessions = list((self.root / "output").iterdir())
        self.assertEqual(len(sessions), 2)
        for session in sessions:
            manifest = json.loads((session / "session.json").read_text())
            self.assertEqual(len(manifest["results"]), 3)
            self.assertEqual(manifest["failures"], [])
            self.assertTrue((session / "contact-sheet.jpg").is_file())
            for item in manifest["results"]:
                recipe = lab.load_recipe(session / item["recipe"])
                replay = self.root / "replay.png"
                lab.render_image(self.source, replay, recipe)
                self.assertEqual(
                    replay.read_bytes(), (session / item["output"]).read_bytes()
                )

    def test_failed_input_returns_nonzero_and_manifest(self):
        bad = self.root / "broken.png"
        bad.write_bytes(b"not an image")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(
            io.StringIO()
        ):
            result = lab.cli(["forge", str(bad), "--output", str(self.root / "output")])
        self.assertEqual(result, 1)
        session = next((self.root / "output").iterdir())
        self.assertFalse(list(session.glob("*.png")))
        self.assertEqual(
            len(json.loads((session / "session.json").read_text())["failures"]), 1
        )

    @unittest.skipUnless(shutil.which("node"), "Node needed for pixel parity")
    def test_browser_pixels_match_numpy(self):
        import numpy as np

        payload = {
            "pixels": self.array.ravel().tolist(),
            "width": 137,
            "height": 95,
            "recipes": [lab.preset_recipe(k, 456) for k in lab.PRESETS],
        }
        script = """import {renderPixels} from './web/recipe.mjs';import fs from 'node:fs';
        const d=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(d.recipes.map(r=>Array.from(renderPixels(new Uint8ClampedArray(d.pixels),d.width,d.height,r,7)))));"""
        actual = json.loads(
            subprocess.run(
                ["node", "--input-type=module", "-e", script],
                cwd=ROOT,
                input=json.dumps(payload),
                text=True,
                capture_output=True,
                check=True,
            ).stdout
        )
        for recipe, rendered in zip(payload["recipes"], actual):
            expected = lab.render_pixels(self.array, recipe, 7).ravel().astype(int)
            self.assertLessEqual(
                int(np.max(np.abs(expected - np.array(rendered)))), 1, recipe["name"]
            )


@unittest.skipUnless(
    shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg needed"
)
class VideoTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "input.mp4"
        lab.run_process(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=size=160x120:rate=12",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=44100",
                "-t",
                "1",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                str(self.source),
            ]
        )

    def test_all_presets_produce_playable_video_and_audio(self):
        before = hashlib.sha256(self.source.read_bytes()).hexdigest()
        for key in lab.PRESETS:
            with self.subTest(preset=key):
                output = self.root / f"{key}.mp4"
                lab.render_video(
                    self.source,
                    output,
                    lab.preset_recipe(key),
                    duration=0.3,
                    max_size=160,
                )
                stream, info = lab.probe(output)
                self.assertEqual((stream["width"], stream["height"]), (160, 120))
                self.assertTrue(
                    any(s["codec_type"] == "audio" for s in info["streams"])
                )
                lab.run_process(
                    ["ffmpeg", "-v", "error", "-i", str(output), "-f", "null", "-"]
                )
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), before)

    def test_loop_duration_and_motion_paths(self):
        for mode in range(6):
            output = self.root / f"motion-{mode}.mp4"
            recipe = lab.preset_recipe("spamware")
            recipe["params"]["path"] = mode
            lab.render_video(
                self.source, output, recipe, loop_seconds=1.4, max_size=160
            )
            _, info = lab.probe(output)
            self.assertAlmostEqual(float(info["format"]["duration"]), 1.4, delta=0.15)

    def test_still_to_motion_and_odd_dimensions(self):
        from PIL import Image

        source = self.root / "odd.png"
        Image.new("RGB", (137, 95), "gray").save(source)
        output = self.root / "loop.mp4"
        lab.render_video(
            source,
            output,
            lab.preset_recipe("spamware"),
            loop_seconds=0.4,
            is_image=True,
        )
        stream, info = lab.probe(output)
        self.assertEqual((stream["width"], stream["height"]), (136, 94))
        self.assertFalse(any(s["codec_type"] == "audio" for s in info["streams"]))

    def test_custom_text_is_literal_and_overlays_support_all_motion_paths(self):
        from PIL import Image

        recipe = lab.preset_recipe("spamware")
        recipe["messages"] = ["YOU'RE 100% CORRUPTED: [x], %{n}", r"quote \\ path"]
        lab.render_video(
            self.source, self.root / "text.mp4", recipe, duration=0.2, max_size=160
        )
        overlay = self.root / "overlay.png"
        Image.new("RGBA", (40, 25), (255, 255, 255, 150)).save(overlay)
        for mode in range(6):
            recipe["params"]["path"] = mode
            output = self.root / f"overlay-{mode}.mp4"
            lab.render_video(
                self.source,
                output,
                recipe,
                duration=0.2,
                max_size=160,
                overlay_path=overlay,
            )
            stream, _ = lab.probe(output)
            self.assertEqual(stream["codec_name"], "h264")

    def test_phone_conversion_preserves_input_audio_and_existing_output(self):
        source = self.source
        # Test setup supplies an actual audio/video fixture, including odd sizes.
        out = self.root / "phone.mp4"
        before = source.read_bytes()
        lab.convert_for_phone(source, out)
        stream, metadata = lab.probe(out)
        self.assertEqual(stream["codec_name"], "h264")
        self.assertEqual(stream["pix_fmt"], "yuv420p")
        self.assertEqual(stream["width"] % 2, 0)
        data = json.loads(
            subprocess.check_output(
                ["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(out)],
                text=True,
            )
        )
        self.assertIn("aac", [x["codec_name"] for x in data["streams"]])
        with self.assertRaises(ValueError):
            lab.convert_for_phone(source, out)
        self.assertEqual(source.read_bytes(), before)
        self.assertTrue(out.is_file())

    def test_existing_output_is_not_overwritten_or_deleted(self):
        output = self.root / "existing.mp4"
        output.write_bytes(b"keep me")
        with self.assertRaises(ValueError):
            lab.render_video(self.source, output, lab.preset_recipe("vhs-haunt"))
        self.assertEqual(output.read_bytes(), b"keep me")

    def test_failure_cleans_partial_output(self):
        source = self.root / "broken.mp4"
        source.write_text("invalid")
        output = self.root / "failed.mp4"
        with self.assertRaises(RuntimeError):
            lab.render_video(source, output, lab.preset_recipe("vhs-haunt"))
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
