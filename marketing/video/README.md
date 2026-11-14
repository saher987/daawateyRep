# Daawatey promo videos

| Video | Length | Source |
|---|---|---|
| `daawatey-promo.mp4` | 85 s | `video.html` (full story; script in `SCRIPT.md`) |
| `daawatey-short.mp4` | 15 s | `short.html` (fast cut for Reels, TikTok and Stories) |

Both are vertical 1080×1920, 30 fps, with background music.

| File | What it is |
|---|---|
| `video.html`, `short.html` | The films. Each scene is a `<section>` with absolute times in seconds (`--s`/`--e` for the scene, `--d` for each element). Open one in a browser to watch it play live. |
| `style.css`, `common.js` | Shared by both films: the styles, the 2D Mom/Dad busts, the seeded random generator and the sparkles. |
| `render.js` | Seeks the page frame by frame with Playwright and pipes the frames to ffmpeg. |
| `make_music.py` | Generates the music: a tense minor intro, then a warm major bed. |
| `assets/` | Cropped app screenshots and the envelope logo. |
| `fonts/` | Noto Sans Arabic and Amiri, the app's own fonts, stored locally. |

## Re-render after editing text or timing

```bash
python3 make_music.py                                   # music.wav (85 s, relief at 6.5 s)
python3 make_music.py 15 2.8 music-short.wav            # music for the short
NODE_PATH=$(npm root -g) node render.js --stills 3,25   # quick PNG previews in stills/ (add --short for the short)
NODE_PATH=$(npm root -g) node render.js                 # full promo, about 3 minutes
NODE_PATH=$(npm root -g) node render.js --short         # 15 s short, about 30 seconds
```

If you change a film's length, update `window.DURATION` in its HTML and regenerate its music with the new length.
To add a recorded voiceover, mix it over the MP4, for example:
`ffmpeg -i daawatey-promo.mp4 -i voice.m4a -filter_complex "[0:a]volume=0.35[m];[m][1:a]amix=inputs=2:duration=first" -c:v copy out.mp4`
