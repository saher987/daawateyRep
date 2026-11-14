// Renders a film page into an MP4, frame by frame.
//   node render.js                  -> daawatey-promo.mp4 from video.html (music.wav if present)
//   node render.js --short          -> daawatey-short.mp4 from short.html (music-short.wav)
//   node render.js --stills 3,25,44 -> PNG previews at those seconds into ./stills/ (add --short for the short)
// Needs Playwright (Chromium) and ffmpeg on PATH.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const FPS = 30;
const dir = __dirname;
const args = process.argv.slice(2);
const short = args.includes('--short');
const PAGE = short ? 'short.html' : 'video.html';
const MUSIC = short ? 'music-short.wav' : 'music.wav';
const OUT = short ? 'daawatey-short.mp4' : 'daawatey-promo.mp4';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(dir, PAGE));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  const duration = await page.evaluate(() => window.DURATION);

  const si = args.indexOf('--stills');
  if (si >= 0) {
    fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
    for (const t of args[si + 1].split(',').map(Number)) {
      await page.evaluate((t) => window.seek(t), t);
      await page.screenshot({ path: path.join(dir, 'stills', `t${t.toFixed(1).padStart(5, '0')}.png`) });
    }
    await browser.close();
    return;
  }

  const music = path.join(dir, MUSIC);
  const out = path.join(dir, OUT);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    ...(fs.existsSync(music) ? ['-i', music, '-c:a', 'aac', '-b:a', '160k', '-shortest'] : []),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium',
    '-movflags', '+faststart', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const total = Math.round(duration * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate((t) => window.seek(t), f / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 150 === 0) console.log(`frame ${f}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await browser.close();
  console.log('wrote', out);
})();
