# Daawatey promo video

`daawatey-promo.mp4`: 88 s, vertical 1080×1920, 30 fps. 3D Mom and Dad with lip-sync, Arabic voices, and a music bed that ducks under speech.
The script (scene by scene, spoken lines and on-screen text) is in `SCRIPT.md`.

| File | What it is |
|---|---|
| `video.html` | The film's 2D layer: captions, phone screens, icons. Each scene is a `<section>` with absolute times in seconds (`--s`/`--e` for the scene, `--d` for each element). |
| `scene3d.js` | The 3D layer (three.js): Mom and Dad built from primitives, the living room, and the shot list (`SHOTS`) with camera framing per shot. Lip-sync reads `voice/mouth.js`. |
| `voice/lines.json` | Every spoken line, fully vocalized, with its speaker (`nar`, `dad`, `mom`). |
| `voice/cues.json` | When each line starts, and the total length. |
| `voice/make_voice.py` | Text to speech, offline: Piper `ar_JO-kareem` via sherpa-onnx. Dad is pitched down slightly; Mom is pitched up with the WORLD vocoder. |
| `voice/mix.py` | Places the lines, ducks the music, and writes `audio.wav` and `voice/mouth.js`. |
| `make_music.py` | Generates `music.wav`: tense until `relief_at`, then a warm major progression. |
| `render.js` | Serves the folder locally, seeks every frame (HTML animations and 3D), and pipes the frames to ffmpeg with `audio.wav`. |
| `assets/`, `fonts/`, `vendor/` | App screenshots, the app's fonts (Noto Sans Arabic, Amiri), and three.js r170 (MIT). |

## Rebuild

```bash
pip install "sherpa-onnx<1.13" pyworld soundfile scipy numpy
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-ar_JO-kareem-medium.tar.bz2
tar xjf vits-piper-ar_JO-kareem-medium.tar.bz2

python3 voice/make_voice.py vits-piper-ar_JO-kareem-medium   # all lines (or add line ids to redo just those)
python3 make_music.py
python3 voice/mix.py                                          # audio.wav + voice/mouth.js
NODE_PATH=$(npm root -g) node render.js --stills 3,58,84      # quick PNG previews in stills/
NODE_PATH=$(npm root -g) node render.js                       # full MP4, about 5–10 minutes on CPU
```

- The TTS model reads diacritics. Write new lines with full tashkeel, or it will mispronounce them.
- Generation is slightly random. If a line sounds off, regenerate just that line: `python3 voice/make_voice.py <model> s6_mom`.
- To use real recorded voices, replace `voice/<id>.wav` (48 kHz mono WAV), adjust `voice/cues.json` if lengths change, and rerun `mix.py`. The lip-sync follows automatically.
- If you change timings, keep `video.html` scene times, `SHOTS` in `scene3d.js`, and `voice/cues.json` in step.
