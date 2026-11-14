# Generates a soft background bed. Pure numpy, no samples.
# Until RELIEF: tense, sparse minor pads (the worry); then a warm D-major
# progression with plucked arpeggios (the relief).
# The earlier calm track (kept for reference); make_music.py is the current dynamic one.
#   python3 make_music_calm.py                  -> music.wav (85 s full promo, relief at 6.5 s)
#   python3 make_music_calm.py 15 2.8 music-short.wav -> the 15 s short
import numpy as np, wave, sys
DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 85.0
RELIEF = float(sys.argv[2]) if len(sys.argv) > 2 else 6.5
OUT = sys.argv[3] if len(sys.argv) > 3 else 'music.wav'
SR = 44100; N = int(SR * DUR)
out = np.zeros((N, 2))
def hz(m): return 440 * 2 ** ((m - 69) / 12)

def pad(notes, t0, t1, vol=.05):
    a, b = int(t0 * SR), min(N, int(t1 * SR)); t = np.arange(b - a) / SR
    env = np.minimum(1, t / 1.2) * np.minimum(1, (t1 - t0 - t) / 1.0)
    for m in notes:
        for det, pan in ((-0.12, .3), (0.12, .7)):
            f = hz(m) * 2 ** (det / 12 / 4)
            w = np.sin(2*np.pi*f*t) + .25*np.sin(4*np.pi*f*t) + .08*np.sin(6*np.pi*f*t)
            out[a:b, 0] += vol * env * w * (1 - pan); out[a:b, 1] += vol * env * w * pan

def pluck(m, t0, vol=.16, pan=.5, length=1.6):
    f = hz(m); p = int(SR / f); L = int(length * SR)
    rng = np.random.default_rng(int(t0 * 1000) + m)
    buf = rng.uniform(-1, 1, p); y = np.zeros(L)
    for i in range(L):
        y[i] = buf[i % p]; buf[i % p] = .5 * (buf[i % p] + buf[(i + 1) % p]) * .996
    y = np.convolve(y, np.ones(4) / 4, 'same')  # soften
    a = int(t0 * SR); b = min(N, a + L)
    if b <= a: return  # starts after the end of the track
    y = y[:b - a]
    out[a:b, 0] += vol * y * (1 - pan); out[a:b, 1] += vol * y * pan

def bass(m, t0, t1, vol=.09):
    a, b = int(t0 * SR), min(N, int(t1 * SR)); t = np.arange(b - a) / SR
    env = np.exp(-t * 1.2) * np.minimum(1, t / .02)
    w = np.sin(2*np.pi*hz(m)*t); out[a:b] += (vol * env * w)[:, None]

# --- the worry: Bm -> G -> Em -> F#, slow, hollow
for i, ch in enumerate([[59, 62, 66], [55, 59, 62], [52, 55, 59], [54, 58, 61]]):
    pad(ch, i * RELIEF / 4, i * RELIEF / 4 + RELIEF / 4 + .6, vol=.035)
# --- the relief: D A Bm G at 96 bpm, one chord per bar
beat = 60 / 96; bar = 4 * beat; t = RELIEF
prog = [(50, [62, 66, 69]), (45, [61, 64, 69]), (47, [62, 66, 71]), (43, [62, 67, 71])]
arp = [0, 1, 2, 1, 2, 1, 0, 2]
k = 0
while t < DUR - 1.5:
    root, ch = prog[k % 4]
    pad([n - 12 for n in ch] + [ch[0]], t, t + bar + .8, vol=.03)
    bass(root - 12 + 12, t, t + bar)
    if t > RELIEF + min(2.5, DUR / 12):  # arps come in once the logo has landed
        for j in range(8):
            n = ch[arp[j]] + (12 if (k % 8 >= 4 and j in (2, 5)) else 0)
            pluck(n, t + j * beat / 2, vol=.12 if j % 2 == 0 else .08, pan=.35 + .3 * (j % 2))
    t += bar; k += 1
# final chord
pad([50, 57, 62, 66, 69], t, DUR, vol=.04); pluck(74, t, vol=.15); pluck(78, t + .25, vol=.12)

# simple stereo echo for space
d = int(beat * .75 * SR)
for ch, dd in ((0, d), (1, d + 900)):
    wet = np.zeros(N); wet[dd:] = out[:-dd, ch] * .28; wet[2*dd:] += out[:-2*dd, ch] * .12
    out[:, ch] += wet
tt = np.arange(N) / SR
out *= (np.minimum(1, tt / 1.0) * np.minimum(1, (DUR - tt) / 3.0))[:, None]
out *= .85 / np.max(np.abs(out))
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((out * 32767).astype('<i2').tobytes())
print(OUT, 'written')
