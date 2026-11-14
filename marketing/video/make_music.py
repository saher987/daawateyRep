# Dynamic Arabic-pop music bed for the promo videos. Pure numpy/scipy, no samples.
#
#   Intro (until DROP): tension under the worried parents: a low Hijaz drone,
#     a heartbeat kick, ticking hats, a noise riser and a snare roll.
#   DROP (the Daawatey logo): 120 BPM, kick + clap + darbuka (maqsum rhythm),
#     bass, offbeat chord stabs, and a qanun-like lead hook over the Andalusian
#     progression Gm - F - Eb - D (D Hijaz). The long version rotates sections
#     (full / lighter / breakdown) so the loop does not get tiring.
#   Every scene cut gets a short whoosh; the end lands on a big G-major hit.
#
#   python3 make_music.py                         -> music.wav (85 s promo, drop at 6.5 s)
#   python3 make_music.py 15 2.8 music-short.wav  -> the 15 s short (drop at 2.8 s)
#   optional 4th arg: comma-separated scene-cut times for the whooshes
import sys, wave, numpy as np
from scipy.signal import butter, lfilter

DUR = float(sys.argv[1]) if len(sys.argv) > 1 else 85.0
DROP = float(sys.argv[2]) if len(sys.argv) > 2 else 6.5
OUT = sys.argv[3] if len(sys.argv) > 3 else 'music.wav'
DEFAULT_CUTS = {85.0: [11, 15.5, 22, 31, 40, 47.5, 54.5, 61, 68.5, 76], 15.0: [4.6, 6.6, 8.4, 10.2, 11.9]}
CUTS = [float(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else DEFAULT_CUTS.get(DUR, [])

SR = 44100; N = int(SR * DUR)
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT; S16 = BEAT / 4
rng = np.random.default_rng(11)          # fixed seed: every run gives the same track
dry = np.zeros((N, 2)); wet = np.zeros((N, 2))   # wet goes through the reverb
side = np.ones(N)                                # sidechain gain (pump on the kick)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

def put(sig, t, vol=1.0, pan=0.5, rev=0.0, duck=False):
    a = int(round(t * SR))
    if a >= N or a + len(sig) <= 0: return
    if a < 0: sig = sig[-a:]; a = 0
    sig = sig[:N - a] * vol
    l, r = np.cos(pan * np.pi / 2), np.sin(pan * np.pi / 2)
    tgt = dry[a:a + len(sig)]
    if duck: sig = sig * side[a:a + len(sig)]
    tgt[:, 0] += sig * l * 1.41; tgt[:, 1] += sig * r * 1.41
    if rev: wet[a:a + len(sig), 0] += sig * l * rev; wet[a:a + len(sig), 1] += sig * r * rev

def tt(sec): return np.arange(int(sec * SR)) / SR
def lp(x, f, o=2): b, a = butter(o, min(f, SR / 2.1) / (SR / 2)); return lfilter(b, a, x)
def hp(x, f, o=2): b, a = butter(o, f / (SR / 2), 'high'); return lfilter(b, a, x)
def bp(x, f1, f2): b, a = butter(2, [f1 / (SR / 2), f2 / (SR / 2)], 'band'); return lfilter(b, a, x)
def saw(f, t): return 2 * ((f * t) % 1) - 1

# ---------- instruments ----------
def kick(vol=1.0):
    t = tt(.35); f = 48 + 110 * np.exp(-t * 30)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    s += .3 * hp(rng.standard_normal(len(t)), 2000) * np.exp(-t * 200)  # click
    return np.tanh(s * 1.6) * vol

def clap():
    t = tt(.25); n = rng.standard_normal(len(t)); env = np.zeros(len(t))
    for d in (0, .011, .022): env += np.exp(-np.maximum(t - d, 0) * 90) * (t >= d)
    env += .5 * np.exp(-t * 18)
    return bp(n, 900, 3500) * env * .7

def hat(open_=False):
    t = tt(.3 if open_ else .06); n = hp(rng.standard_normal(len(t)), 7000)
    return n * np.exp(-t * (14 if open_ else 70)) * .35

def dum():   # darbuka low stroke
    t = tt(.4); f = 95 + 40 * np.exp(-t * 40)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7) * .8

def tak(ghost=False):   # darbuka rim stroke
    t = tt(.12)
    s = .6 * bp(rng.standard_normal(len(t)), 1800, 6000) * np.exp(-t * 60)
    s += .5 * np.sin(2 * np.pi * 820 * t) * np.exp(-t * 45)
    return s * (.35 if ghost else 1.0)

def crash(sec=2.2):
    t = tt(sec); n = hp(rng.standard_normal(len(t)), 4500)
    return n * np.exp(-t * 2.2) * .5

def bass(m, sec):
    t = tt(sec); f = hz(m)
    s = .6 * saw(f, t) + .5 * np.sin(2 * np.pi * f * t) + .35 * np.sin(np.pi * f * t)  # + sub octave
    k = np.exp(-t * 18)                        # filter 'pluck': bright attack, dark sustain
    s = lp(s, 1300) * k + lp(s, 380) * (1 - k)
    return s * np.minimum(1, t / .004) * np.exp(-t * 2.5) * np.minimum(1, (sec - t) / .02)

def stab(notes, sec=.16):
    t = tt(sec); s = sum(saw(hz(m) * d, t) for m in notes for d in (.997, 1.003))
    return lp(s, 2600) * np.exp(-t * 16) * .12

def pad(notes, sec):
    t = tt(sec); s = sum(np.sin(2 * np.pi * hz(m) * d * t) + .2 * np.sin(4 * np.pi * hz(m) * d * t)
                         for m in notes for d in (.995, 1.005))
    return s * np.minimum(1, t / .3) * np.minimum(1, (sec - t) / .5) * .05

def qanun(m, sec=.6):   # plucked lead: harmonics that fade faster the higher they are
    t = tt(sec); f = hz(m); s = np.zeros(len(t))
    for k in range(1, 9):
        s += np.sin(2 * np.pi * f * k * (1 + .0007 * k * k) * t) / k * np.exp(-t * (4 + 2.2 * k))
    s *= np.minimum(1, t / .002)
    return s * .32

def whoosh(sec=.45):
    t = tt(sec); n = rng.standard_normal(len(t))
    out = np.zeros(len(t)); step = 512
    for i in range(0, len(t), step):  # rising band-pass sweep
        c = 600 + 7000 * (i / len(t)) ** 2
        out[i:i + step] = bp(n[i:i + step], c * .7, min(c * 1.4, SR / 2.2))
    return out * (t / sec) ** 2.5 * .5

# ---------- music ----------
PROG = [  # (bass root, stab voicing)  Gm - F - Eb - D  (D Hijaz / Andalusian cadence)
    (43, [55, 58, 62]), (41, [53, 57, 60]), (39, [51, 55, 58]), (38, [50, 54, 57])]
HOOK = [  # per chord: (eighth, midi, length in eighths)
    [(0, 74, 1), (1, 75, 1), (2, 74, 1), (3, 72, 1), (4, 70, 2), (6, 69, 1), (7, 70, 1)],
    [(0, 72, 1), (1, 70, 1), (2, 69, 1), (3, 67, 1), (4, 69, 3), (7, 67, 1)],
    [(0, 67, 1), (1, 70, 1), (2, 75, 1), (3, 74, 1), (4, 72, 1), (5, 70, 1), (6, 72, 2)],
    [(0, 74, 2), (2, 75, 1), (3, 74, 1), (4, 72, 1), (5, 70, 1), (6, 66, 1), (7, 69, 1)]]
ARP = [0, 1, 2, 1, 2, 1, 0, 2]

# where the music ends: a final hit on a bar line at least ~2.2 s before the end
nbars = int((DUR - DROP - 2.2) // BAR)
END = DROP + max(1, nbars) * BAR

def section(b):
    """Long version: 8 bars full + hook, 4 bars lighter (arps), 4 bars breakdown; short: always full."""
    if DUR <= 30: return 'full'
    k = b % 16
    return 'full' if k < 8 else ('light' if k < 12 else 'break')

# --- intro: tension under the worried parents ---
put(pad([38, 45, 50], DROP + .4), 0, vol=1.3, rev=.3)                       # low Hijaz drone
beats_before = int(DROP / BEAT)
for k in range(1, beats_before + 1):
    t = DROP - k * BEAT
    if k % 2 == 0: put(kick(.4), t)                                        # heartbeat
    if t > DROP - 2.6: put(hat(), t + BEAT / 2, vol=.6 + .4 * (1 - (DROP - t) / 2.6), pan=.65)
riser = min(2.6, DROP - .1)
r = tt(riser); n = rng.standard_normal(len(r)); rs = np.zeros(len(r))
for i in range(0, len(r), 1024):
    c = 400 + 9000 * (i / len(r)) ** 2
    rs[i:i + 1024] = bp(n[i:i + 1024], c * .6, min(c * 1.5, SR / 2.2))
put(rs * (r / riser) ** 2 * .35, DROP - .06 - riser, rev=.2)
# snare roll: 16ths, then 32nds in the last beat, getting louder
for i, t in enumerate(np.arange(DROP - 2 * BEAT, DROP - BEAT - 1e-6, S16)):
    put(clap(), t, vol=.15 + .05 * i, pan=.5)
for i, t in enumerate(np.arange(DROP - BEAT, DROP - .07, S16 / 2)):
    put(clap(), t, vol=.35 + .04 * i, pan=.5)

# --- body ---
put(crash(3), DROP, vol=.8, rev=.3)
b = 0; t0 = DROP
while t0 < END - 1e-6:
    root, ch = PROG[b % 4]; sec = section(b)
    # sidechain pump on every kick
    kicks = [0, 3, 4] if sec != 'break' else []
    for e in kicks:
        a = int((t0 + e * BEAT / 2) * SR); L = int(.25 * SR)
        if a < N: side[a:a + L] = np.minimum(side[a:a + L], 1 - .55 * np.exp(-np.arange(min(L, N - a)) / SR / .09))
    for e in kicks: put(kick(), t0 + e * BEAT / 2)
    if sec != 'break':
        for e in (2, 6): put(clap(), t0 + e * BEAT / 2, vol=.55, pan=.5, rev=.25)
    # darbuka maqsum: D T . T D . T .  (+ ghost "ka" strokes on the 16ths)
    for e in (0, 4): put(dum(), t0 + e * BEAT / 2, vol=.7, pan=.4)
    for e in (1, 3, 6): put(tak(), t0 + e * BEAT / 2, vol=.55, pan=.62, rev=.15)
    for s16 in (3, 5, 9, 11, 13, 15): put(tak(ghost=True), t0 + s16 * S16, vol=.5, pan=.7)
    for s16 in range(16):
        put(hat(open_=(s16 % 4 == 2)), t0 + s16 * S16, vol=(.5 if s16 % 2 else .3) * (.6 if sec == 'break' else 1), pan=.3)
    # bass
    for s16, oc in ((0, 0), (3, 0), (6, 12), (8, 0), (11, 0), (14, 12)):
        put(bass(root + oc, S16 * 2.2), t0 + s16 * S16, vol=.55 if sec != 'break' else .35, duck=True)
    # chords
    if sec == 'break':
        put(pad(ch + [ch[0] + 12], BAR + .3), t0, vol=1.6, rev=.4, duck=True)
    else:
        for s16 in (2, 6, 10, 14): put(stab(ch), t0 + s16 * S16, vol=1.0, pan=.55, rev=.3, duck=True)
    # lead: the hook in full sections, arpeggios in lighter ones
    if sec == 'full':
        for e, m, ln in HOOK[b % 4]:
            put(qanun(m, .25 + ln * .2), t0 + e * BEAT / 2, vol=.75, pan=.45, rev=.35)
            put(qanun(m + 12, .2), t0 + e * BEAT / 2 + .004, vol=.15, pan=.6, rev=.35)
    elif sec == 'light':
        for j in range(8): put(qanun(ch[ARP[j]] + 12, .35), t0 + j * BEAT / 2, vol=.4, pan=.4 + .2 * (j % 2), rev=.4)
    if b % 4 == 3 and sec != 'break':   # fill into the next phrase
        for s16 in (12, 13, 14, 15): put(tak(), t0 + s16 * S16, vol=.5 + .1 * (s16 - 12), pan=.62)
    if b % 8 == 0 and b > 0 and sec == 'full': put(crash(2), t0, vol=.5, rev=.3)
    b += 1; t0 += BAR

# --- ending: big G-major hit that rings out ---
put(kick(1.1), END); put(crash(3.2), END, vol=.9, rev=.4)
put(bass(31, 2.4), END, vol=.7)
put(pad([55, 59, 62, 67], DUR - END), END, vol=2.2, rev=.5)
for i, m in enumerate([55, 59, 62, 67, 71, 74]): put(qanun(m, 2.0), END + i * .03, vol=.55, pan=.3 + .08 * i, rev=.5)

# --- whooshes into scene cuts ---
for c in CUTS:
    if abs(c - DROP) > .3 and c < END - .2: put(whoosh(), c - .45, vol=.35, pan=.5, rev=.3)

# ---------- reverb (small Schroeder hall) + master ----------
def reverb(x):
    out = np.zeros_like(x)
    for d, g in ((1557, .80), (1617, .79), (1491, .78), (1422, .77)):
        a = np.zeros(d + 1); a[0] = 1; a[d] = -g; out += lfilter([1], a, x)
    for d, g in ((225, .5), (556, .5)):
        bb = np.zeros(d + 1); bb[0] = -g; bb[d] = 1; aa = np.zeros(d + 1); aa[0] = 1; aa[d] = -g
        out = lfilter(bb, aa, out)
    return lp(out, 6000) * .18
mix = dry + np.stack([reverb(wet[:, 0]), reverb(wet[:, 1])], 1)
mix = hp(mix.T, 30).T
tt_ = np.arange(N) / SR
mix *= np.minimum(1, (DUR - tt_) / 1.2)[:, None]       # fade at the very end
mix = np.tanh(mix / np.percentile(np.abs(mix), 99.9) * 1.1)  # soft-clip master
mix *= .79 / np.abs(mix).max()          # ~ -1 dBTP headroom
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(f'{OUT} written: {DUR:g}s, drop at {DROP:g}s, final hit at {END:.2f}s, {b} bars, {len(CUTS)} whooshes')
