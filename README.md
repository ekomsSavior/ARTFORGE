# ARTFORGE

Advanced Glitch Art Framework for Images, Video, Audio, and Databending

![Screenshot_2025-12-08_18_23_25(2)](https://github.com/user-attachments/assets/6b822049-0f8d-43fb-97e5-1aa1b852fb1d)

ARTFORGE is a multi-tool glitch art engine designed for artists, musicians, and experimental creators who want to transform ordinary media into distorted, data-bent, audio-reactive, and codec-corrupted artworks.
It provides a fully interactive Python command-line interface that guides users through glitching images, videos, audio, and mixed-media compositions without needing to manually craft complex ffmpeg commands or edit hex by hand.

ARTFORGE combines multiple glitch disciplines into a single framework:

* ffmpeg-based visual filter chains
* codec-level glitching (snow, x265 slice corruption, datascope overlays)
* glitchart Python library databending for JPEG and PNG
* raw hex-level databending through controlled header-safe byte corruption
* audio-reactive visualization overlays
* image-to-music video generation
* video soundtrack injection
* media blending, stacking, and grid compositions
* steganographic encrypted messages embedded inside images
* distance-warp / grid-warp style image deformation (SciPy + optional Torch)

Its goal is to give creators a modern, accessible, maximal glitch toolkit that respects the aesthetics of both traditional databending and contemporary video glitch processes.

---

## Key Features

### Image Glitching

![Screenshot_2025-08-29_10_52_12_blend_xor](https://github.com/user-attachments/assets/5408ea0a-8b2c-4e76-b009-4fce1a45bd53)
<img width="534" height="640" alt="lfg_warp_scipy" src="https://github.com/user-attachments/assets/f96698e2-fc11-4e3f-b01c-1f484f31ba87" />




* Chainable ffmpeg glitch effects (RGB shift, pixelation, noise, neon hue shifts, edge detection)
* GlitchArt library databending for PNG and JPEG
* Hex-level corruption with configurable header protection and corruption passes
* Text and ASCII overlays
* Batch processing support
* Stego mode for embedding encrypted messages into images
* Warp mode (distance-map / grid-warp deformation):
  * SciPy distance-warp (chunky / harsh)
  * Torch grid-sample warp (smoother / elastic)

### Video Glitching

https://github.com/user-attachments/assets/269f092f-6426-40b9-872f-cc5ff43db5c9

* Standard ffmpeg glitch chains (same logic as images, extended for video)
* Advanced codec-based glitching:
  * Datascope overlays
  * Snow codec corruption
  * x265 block/slice glitching
* Audio-reactive video mode that generates spectrum-based overlays driven by the video’s own audio
* Text/ASCII overlays
* PNG overlay mode for logos, textures, and moving overlays

### Audio-Integrated Features

* Attach external music tracks to glitched videos
* Turn a single image into a music video synchronized with an audio file
* Experimental audio-reactive glitch mode

### Media Combination Tools

* Blend two images or videos using any ffmpeg blend mode
* Horizontal stacking
* Vertical stacking
* 2×2 media grids

### Steganographic Secret Messages

* Embed encrypted messages inside image pixels
* Extract and decrypt hidden messages using a passphrase
* Fully local, passphrase-based workflow

---

## Requirements

### System dependencies (Linux)

ARTFORGE relies heavily on `ffmpeg`:

```bash
sudo apt update
sudo apt install -y ffmpeg
````

Confirm:

```bash
ffmpeg -version
```

### Python dependencies

Core (enables databending modes):

```bash
pip3 install glitchart --break-system-packages
```

Optional (Stego / Encrypted messages menu):

```bash
pip3 install cryptography pillow --break-system-packages
```

Optional (Warp mode — SciPy distance-warp):

```bash
pip3 install numpy scipy pillow --break-system-packages
```

Optional (Warp mode — Torch grid-sample warp, smoother / elastic)

This is a big install (VMs need disk space). CPU wheels:

```bash
pip3 install torch --index-url https://download.pytorch.org/whl/cpu --break-system-packages
```

Notes:

* ARTFORGE will still run without `glitchart`, but PNG/JPEG databending modes will be disabled.
* Stego mode is disabled unless both `cryptography` and `pillow` are installed.
* Warp mode (SciPy) requires `numpy`, `scipy`, and `pillow`.
* Warp mode (Torch) additionally requires `torch`.

---

## Installation

Clone the repository:

```bash
git clone https://github.com/ekomsSavior/ARTFORGE
cd ARTFORGE
```

Run the tool:

```bash
python3 artforge.py
```

All output is saved automatically into the `output/` directory.

---

## Usage Overview

### Main Menu

![Screenshot\_2025-12-08\_18\_23\_25](https://github.com/user-attachments/assets/8ac4fbe6-7b50-4a2e-93f0-590f4d771a33)

ARTFORGE presents a simple text-based menu to explore:

* Glitching single or multiple files
* Combining / meshing media
* Audio / music integrations
* Warp deformation mode (inside Image modes)
* Stego / encrypted message workflows
* Exit

---

## Glitch Modes

![Untitled\_Artwork(1)\_glitch\_blend\_xor](https://github.com/user-attachments/assets/8fb48f0c-2d74-4f40-b52f-28f91811d9fb)

[https://github.com/user-attachments/assets/47eac247-ee5c-4073-ad38-9082288e19e8](https://github.com/user-attachments/assets/47eac247-ee5c-4073-ad38-9082288e19e8)

### 1. Image Modes

#### A. FFmpeg Filter Chain

Stack any number of glitch filters:

* RGB shift
* VHS-style noise
* Pixelation
* Neon hue rotation
* Ghost lines (edge detection)

Each filter has interactive parameter prompts and can be chained for complex looks.

#### B. GlitchArt Databending (JPEG/PNG)

Performs structural databending by corrupting pixel data while preserving readability.
Uses the `glitchart` Python library to apply repeatable databent effects to `.jpg`, `.jpeg`, and `.png`.

#### C. Text / ASCII Overlay

Adds captions or ASCII blocks using ffmpeg’s `drawtext` with:

* Positioning (top or bottom)
* Font size
* Color
* Custom font file support
* Multi-line support via `\n`

#### D. Raw Hex Databending

Performs actual file corruption:

* Protect the file header (configurable number of bytes)
* Randomly corrupt selected byte ranges deeper in the file
* Fully preserves the original image
* Creates a new corrupted output in `output/`

#### E. Distance-Warp / Grid-Warp (Warp Mode)

A deformation mode that remaps pixels using distance transforms.

Two variants:

* **SciPy distance-warp (chunky / harsh)**

  * Generates a binary mask by comparing pixel luminance vs global mean
  * Applies morphological closing for blob smoothing
  * Uses `distance_transform_edt(return_indices=True)` to remap pixels
  * Prompt: `Closing iterations` (higher = chunkier)

* **Torch grid-sample warp (smoother / elastic)**

  * Uses the same mask + distance transform idea
  * Builds a normalized sampling grid and warps with `torch.grid_sample`
  * Prompt: `Dilation iterations` (higher = more aggressive warping)

If Torch isn’t installed, the Torch warp option will warn and return to menu.



https://github.com/user-attachments/assets/fec8c2cd-671f-422e-94c3-2c156569c7b4



---

### 2. Video Modes

#### A. Standard Filter Chain

Same effects as image processing, applied across each frame:

* RGB shift
* Noise overlays
* Pixelation
* Neon hue / saturation changes
* Edge detection
* Time-based playback speed changes

Video and audio filters can be combined; video is processed with a filter chain and audio can be re-timed or copied.

#### B. Advanced Codec Glitching

These modes intentionally abuse internal codec behavior:

[https://github.com/user-attachments/assets/db263eb4-cdef-405b-bb9a-b4203deef01e](https://github.com/user-attachments/assets/db263eb4-cdef-405b-bb9a-b4203deef01e)

* **Datascope Overlay**
  Generates a moving datascope visual from the video input and blends it back into the feed. Produces oscilloscope-style overlays and signal-like textures.

* **Snow Codec Corruption**
  Re-encodes using the Snow codec with bitstream noise. Produces heavy tearing, whiteouts, flicker, and scrambled macroblocks.
  Output is then normalized back to a standard format for playback.

* **x265 Slice/Block Glitching**
  Forces long GOPs, minimal keyframes, and noisy bitstreams while disabling corrective features like deblocking and SAO.
  Creates destructive x265 artifacting: frozen frames, block tearing, and compression ruins.

#### C. Text/ASCII Overlay

Same as images, applied to video with audio preserved:

* Simple captions
* Titles
* ASCII art overlays

All overlays are rendered through `drawtext`, preserving timing and audio.

#### D. PNG Overlay on Video (Logo / Texture)

A dedicated mode for compositing a PNG file over video:

* Overlay a static logo or texture in:

  * Center
  * Any corner
  * Custom X/Y offsets
* Optionally animate the overlay in a bouncing/orbit-style path across the frame
* Two compositing styles:

  * **Normal alpha overlay** – respects PNG transparency and position
  * **Full-frame blend mode** – scales PNG to the video and blends it via ffmpeg `blend=all_mode=...`

This is ideal for:

* Branding and logo stamping
* Texture overlays
* Repeating glitch motifs that ride along the video

ARTFORGE automatically handles multi-input scaling and mapping to avoid dimension mismatches.

---

### 3. Combine / Mesh Modes

* **Blend two inputs** using any ffmpeg blend mode
* **Horizontal stack** (side-by-side)
* **Vertical stack** (top/bottom)
* **2×2 media grid**

When blending, ARTFORGE uses `scale2ref` to scale one input to match the other and guarantees compatible resolutions.
For stacking and grids, all inputs are scaled to shared target dimensions before being combined.

---

## Supported Blend Modes

When the tool asks for a “blend mode”, users may type any of the following ffmpeg modes:

| Blend Mode       | Visual Description                                           |
| ---------------- | ------------------------------------------------------------ |
| **addition**     | Adds pixel values; brightens; glow effects.                  |
| **and**          | Bitwise AND; produces blocky, digital-mask artifacts.        |
| **average**      | Softens by averaging pixels; muted low-contrast look.        |
| **burn**         | Dark, harsh contrast; intense shadows.                       |
| **darken**       | Keeps darkest pixels; moody, shadow-heavy blend.             |
| **difference**   | Absolute subtraction; neon edges and inversion-like effects. |
| **divide**       | Divides pixel values; washed-out, experimental distortion.   |
| **dodge**        | Brightens highlight areas dramatically.                      |
| **exclusion**    | Soft “difference” mode; smoky, surreal inversions.           |
| **freeze**       | Lightens highlights aggressively; crystalline distortion.    |
| **glow**         | Soft highlight bloom; VHS vibes.                             |
| **grainextract** | Extracts grain; creates grey noisy maps.                     |
| **grainmerge**   | Adds grain back; film-like noise overlay.                    |
| **hardlight**    | Punchy contrast; vivid shadows and highlights.               |
| **hardmix**      | Posterized, binary color explosions; chaotic glitch look.    |
| **heat**         | Thermal-imaging style shifts; intense experimental color.    |
| **lighten**      | Keeps brightest pixels; bright, airy composites.             |
| **linearlight**  | Strong linear dodge + burn; extremely high contrast.         |
| **multiply**     | Darkens; film/ink overlay aesthetic.                         |
| **negation**     | Inverts combined values; surreal ghosting.                   |
| **or**           | Bitwise OR; chaotic, pixel-mask glitching.                   |
| **overlay**      | Balanced contrast boost; classic photo composite.            |
| **phoenix**      | Chaotic subtract/add oscillation; dramatic glitch textures.  |
| **pinlight**     | Threshold-based replace; fractured digital patterns.         |
| **reflect**      | Metallic shine; inverted highlight boosts.                   |
| **screen**       | Light, airy brighten mode; luminous film look.               |
| **softlight**    | Gentle version of hardlight; subtle gradients.               |
| **stain**        | Subtractive mode; dirty, smeared, analog-paper effect.       |
| **subtract**     | Strong dark subtractive effect; negative-space distortions.  |
| **vividlight**   | Extreme highlight/shadow contrast; aggressive glitch mode.   |
| **xor**          | Boolean XOR; corrupted bitmap-style glitching.               |

For users who want chaos:

```text
Experimental / Advanced Blend Modes:
and
or
xor
freeze
heat
hardoverlay
harmonic
negation
extremity
geometric
```

---

## Audio / Music Tools

### Attach Music to Video

Adds an external audio track to any video.

Two modes:

* Trim to the shortest stream
* Loop audio to cover entire video, then stop when the video ends

The resulting file keeps the original video stream and replaces or overlays the soundtrack.

### Image to Music Video

Turns a static image (glitched or normal) into a synchronized music video.

* The image is looped for the duration of the audio
* Output is encoded with `libx264` and `yuv420p`
* Image dimensions are automatically adjusted to even values to satisfy codec requirements

### Audio-Reactive Mode

Generates a real-time spectrum visualization from the video’s own audio, then blends it over the frames:

* Uses `showspectrum` to derive visual frequency content
* Scales the spectrum to match the video
* Blends the spectrum back onto the frames with a configurable opacity

This is experimental but powerful for:

* Music videos
* Live visuals
* VJ and performance workflows

---

## Stego / Encrypted Messages Mode

ARTFORGE includes a steganography mode that lets you hide encrypted messages inside image pixels.

This is not code execution. It is a local, passphrase-based secret channel for artists and collaborators.

### How It Works

* Messages are encrypted using `cryptography.Fernet`
* A Fernet key is derived from your passphrase via SHA-256
* The encrypted bytes are packed into the least significant bits (LSBs) of the image’s RGB pixels
* A magic marker (`AF_STEG1`) and payload length are stored alongside the ciphertext
* Only users with the passphrase can decrypt and read the hidden text

### Requirements

```bash
pip3 install cryptography pillow --break-system-packages
```

### Embedding a Hidden Message

From the main menu:

1. Select: `5. Stego / Encrypted messages`
2. Choose: `1. Embed hidden encrypted message into image`
3. Point ARTFORGE at a source image (PNG or other common format)
4. Choose whether to:

   * Type your message directly, or
   * Load the message from a text file
5. Enter a passphrase (this is what you share with the recipient)
6. ARTFORGE writes a new image into the `output/` directory, suffixed with `_stego.png`

### Decoding a Hidden Message

From the main menu:

1. Select: `5. Stego / Encrypted messages`
2. Choose: `2. Decode hidden encrypted message from image`
3. Point ARTFORGE at a stego image (the `_stego.png`)
4. Enter the passphrase
5. If the marker and ciphertext are valid, ARTFORGE will:

   * Print the decrypted message in the terminal
   * Optionally save it to `output/<name>_stego_message.txt`

If the passphrase is wrong or the data is corrupted, decryption will fail safely and ARTFORGE will notify you.

---

## Output

All generated files are placed into:

```text
output/
```

Each file is suffix-tagged depending on the mode used, for example:

* `_glitch`
* `_hexglitch`
* `_datascope`
* `_snow`
* `_x265`
* `_blend_<mode>`
* `_hstack`
* `_vstack`
* `_grid2x2`
* `_png_overlay`
* `_with_music`
* `_musicvid`
* `_audio_reactive`
* `_warp_scipy.png`
* `_warp_torch.png`
* `_stego.png`
* `_stego_message.txt`

This keeps originals untouched and makes it easy to track which pipeline produced which artifact.

---

## Philosophy

ARTFORGE is designed to bring the aesthetics of early databending, experimental video synthesis, and modern glitch art under one framework. It avoids mock or fake effects and instead leans into genuine compression artifacts, codec misbehavior, and real byte corruption wherever possible.

The stego mode continues this philosophy by treating digital art as a carrier for encrypted stories, prompts, and signals between collaborators.

---

[https://github.com/user-attachments/assets/07085af9-219d-4b88-b205-9a0a742ca4cd](https://github.com/user-attachments/assets/07085af9-219d-4b88-b205-9a0a742ca4cd)

## Shout Outs and Credits

* **ffmpeg** for being the backbone of modern video and audio manipulation
  [https://github.com/FFmpeg](https://github.com/FFmpeg)
* **Glitchart Collective (Instagram)** for maintaining culture, tools, and databending methodology
* Merlyn Alexander – [https://merlynalexander.name/guides/glitch-primer-part-i/](https://merlynalexander.name/guides/glitch-primer-part-i/)

![Screenshot 2025-10-14 111008\_glitch](https://github.com/user-attachments/assets/a8f5fb93-a80a-427c-b16b-6166a571c8df)

<img width="676" height="1272" alt="E5727FEE-3F86-4B45-ABDB-2FB67CADEAA7_vstack" src="https://github.com/user-attachments/assets/06631b38-93af-4fc5-92cf-c969d443a259" />
```


