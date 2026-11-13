# Daawatey promo video

`daawatey-promo.mp4`: 70 s, vertical 1080×1920, 30 fps, with background music.
The script (scene by scene, on-screen text and voiceover) is in `SCRIPT.md`.

| File | What it is |
|---|---|
| `video.html` | The film. Each scene is a `<section>` with absolute times in seconds (`--s`/`--e` for the scene, `--d` for each element). Open it in a browser to watch it play live. |
| `render.js` | Seeks the page frame by frame with Playwright and pipes the frames to ffmpeg. |
| `make_music.py` | Generates `music.wav`: a tense minor intro, then a warm major bed from 6.5 s. |
| `assets/` | Cropped app screenshots and the envelope logo. |
| `fonts/` | Noto Sans Arabic and Amiri, the app's own fonts, stored locally. |

## Re-render after editing text or timing

```bash
python3 make_music.py                                  # only if music.wav is missing or changed
NODE_PATH=$(npm root -g) node render.js --stills 3,25  # quick PNG previews in stills/
NODE_PATH=$(npm root -g) node render.js                # full MP4, about 2 minutes
```

If you change the total length, update `window.DURATION` in `video.html` and `DUR` in `make_music.py`.
To add a recorded voiceover, mix it over the MP4, for example:
`ffmpeg -i daawatey-promo.mp4 -i voice.m4a -filter_complex "[0:a]volume=0.35[m];[m][1:a]amix=inputs=2:duration=first" -c:v copy out.mp4`
