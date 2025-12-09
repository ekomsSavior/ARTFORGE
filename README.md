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

Its goal is to give creators a modern, accessible, maximal glitch toolkit that respects the aesthetics of both traditional databending and contemporary video glitch processes.

---

## Key Features

### Image Glitching

![Screenshot_2025-08-29_10_52_12_blend_xor](https://github.com/user-attachments/assets/5408ea0a-8b2c-4e76-b009-4fce1a45bd53)

* Chainable ffmpeg glitch effects (RGB shift, pixelation, noise, neon hue shifts, edge detection)
* GlitchArt library databending for PNG and JPEG
* Hex-level corruption with configurable header protection and corruption passes
* Text and ASCII overlays
* Batch processing support

### Video Glitching

* Standard ffmpeg glitch chains (same logic as images, extended for video)
* Advanced codec-based glitching:

  * Datascope overlays
  * Snow codec corruption
  * x265 block/slice glitching
* Audio-reactive video mode that generates spectrum-based overlays driven by the video’s own audio
* Text/ASCII overlays

### Audio-Integrated Features

* Attach external music tracks to glitched videos
* Turn a single image into a music video synchronized with an audio file
* Experimental audio-reactive glitch mode

### Media Combination Tools

* Blend two images or videos using any ffmpeg blend mode
* Horizontal stacking
* Vertical stacking
* 2×2 media grids

---

## Requirements

### System dependencies

ARTFORGE relies heavily on `ffmpeg`.
Install it on Linux:

```
sudo apt update
sudo apt install ffmpeg
```

Confirm installation:

```
ffmpeg -version
```

### Python dependencies

Required:

```
pip3 install glitchart
```

ARTFORGE will still run without the glitchart library, but databending modes for PNG/JPEG will be disabled.

---

## Installation

Clone the repository:

```
git clone https://github.com/ekomsSavior/ARTFORGE
cd ARTFORGE
```

Run the tool:

```
python3 artforge.py
```

All output is saved automatically into the `output/` directory.

---

## Usage Overview

### Main Menu

![Screenshot_2025-12-08_18_23_25](https://github.com/user-attachments/assets/8ac4fbe6-7b50-4a2e-93f0-590f4d771a33)

## Glitch Modes

![Untitled_Artwork(1)_glitch_blend_xor](https://github.com/user-attachments/assets/8fb48f0c-2d74-4f40-b52f-28f91811d9fb)


https://github.com/user-attachments/assets/47eac247-ee5c-4073-ad38-9082288e19e8


### 1. Image Modes

#### A. FFmpeg Filter Chain

Stack any number of glitch filters:

* RGB shift
* VHS-style noise
* Pixelation
* Neon hue rotation
* Ghost lines (edge detection)

Each filter has interactive parameter prompts.

#### B. GlitchArt Databending (JPEG/PNG)

Performs structural databending by corrupting pixel data while preserving readability.

#### C. Text / ASCII Overlay

Adds captions or ASCII blocks using ffmpeg’s drawtext with:

* Positioning
* Font size
* Color
* Custom font file support

#### D. Raw Hex Databending

Performs actual file corruption:

* Protect the file header
* Randomly corrupt selected byte ranges
* Fully preserves the original image
* Creates a new corrupted output

---

### 2. Video Modes

#### A. Standard Filter Chain

Same effects as image processing, but applied across each frame.

#### B. Advanced Codec Glitching

These modes intentionally abuse internal codec behavior:

https://github.com/user-attachments/assets/db263eb4-cdef-405b-bb9a-b4203deef01e

* **Datascope Overlay**
  Generates a moving datascope visual from the video and blends it back into the feed.

* **Snow Codec Corruption**
  Re-encodes using the Snow codec with bitstream noise.
  Produces heavy tearing, whiteouts, and scrambled blocks.

* **x265 Slice/Block Glitching**
  Forces minimal keyframes, large block sizes, and noisy bitstreams for destructive x265 effects.

#### C. Text/ASCII Overlay

Same as images, applied to video with audio preserved.

---

### 3. Combine / Mesh Modes

* **Blend two inputs** using any ffmpeg blend mode
* **Horizontal stack**
* **Vertical stack**
* **2×2 media grid**

When blending, ARTFORGE scales and aligns inputs automatically.

---

## Supported Blend Modes

When the tool asks for a “blend mode”, users may type any of the following ffmpeg modes:

addition
average
burn
darken
difference
divide
dodge
exclusion
glow
grainextract
grainmerge
hardlight
hardmix
lighten
linearlight
multiply
negation
overlay
phoenix
pinlight
reflect
screen
softlight
stain
subtract
vividlight
xor

Additional ffmpeg blend modes may work as well; these are the most reliable and widely used.

---

## Audio / Music Tools

### Attach Music to Video

Adds an external audio track to any video.
Two modes:

* Trim to shortest
* Loop audio to cover entire video

### Image to Music Video

Turns a static image (glitched or normal) into a synchronized music video.
ARTFORGE automatically corrects odd image dimensions to satisfy H.264 requirements.

### Audio-Reactive Mode

Generates a real-time spectrum visualization from the video’s own audio, then blends it over the frames.
This is an experimental but powerful effect for music creators and VJ workflows.

---

## Output

All generated files are placed into:

```
output/
```

Each file is timestamped or suffix-tagged depending on the mode used.

---

## Philosophy

ARTFORGE is designed to bring the aesthetics of early databending, experimental video synthesis, and modern glitch art under one framework. It avoids mock or fake effects and instead leans into genuine compression artifacts, codec misbehavior, and real byte corruption wherever possible.

---

## Shout Outs and Credits

* **ffmpeg** for being the backbone of modern video and audio manipulation
* **Kazz Coyote (Instagram)** for inspiration, glitch artistry, and community influence
* **Glitchart Collective (Instagram)** for maintaining culture, tools, and databending methodology
* Merlyn Alexander - https://merlynalexander.name/guides/glitch-primer-part-i/  

![Screenshot 2025-10-14 111008_glitch](https://github.com/user-attachments/assets/a8f5fb93-a80a-427c-b16b-6166a571c8df)
