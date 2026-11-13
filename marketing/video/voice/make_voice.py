# Synthesizes every line in lines.json to voice/<id>.wav (48 kHz mono).
# Base voice: Piper ar_JO "kareem" (offline, via sherpa-onnx). The text is fully
# vocalized because the model reads diacritics; without them it mispronounces.
#   nar: kareem as is      dad: slightly lower and slower
#   mom: WORLD vocoder, F0 raised and formants shifted up for a female timbre
# Usage: python3 make_voice.py <path-to vits-piper-ar_JO-kareem-medium> [line ids...]
import json, os, sys, numpy as np, soundfile as sf, pyworld as pw, sherpa_onnx
from scipy.signal import resample_poly
D = sys.argv[1]; HERE = os.path.dirname(os.path.abspath(__file__))
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
    vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=f'{D}/ar_JO-kareem-medium.onnx', tokens=f'{D}/tokens.txt',
        data_dir=f'{D}/espeak-ng-data', noise_scale=.5, noise_scale_w=.6), num_threads=4)))

def world(x, sr, f0_mul, formant_mul):
    x = x.astype(np.float64)
    f0, t = pw.harvest(x, sr, f0_floor=60, f0_ceil=400, frame_period=5)
    sp = pw.cheaptrick(x, f0, t, sr); ap = pw.d4c(x, f0, t, sr)
    n = sp.shape[1]; src = np.arange(n) / formant_mul  # stretch envelope upward
    sp2 = np.array([np.interp(src, np.arange(n), row) for row in sp])
    ap2 = np.array([np.interp(src, np.arange(n), row) for row in ap])
    return pw.synthesize(f0 * f0_mul, sp2, np.clip(ap2, 0, 1), sr, frame_period=5)

only = sys.argv[2:]  # optional: regenerate just these line ids
for ln in json.load(open(f'{HERE}/lines.json')):
    if only and ln['id'] not in only: continue
    speed = {'nar': .95, 'dad': .92, 'mom': 1.0}[ln['who']]
    a = tts.generate(ln['text'], sid=0, speed=speed)
    x, sr = np.array(a.samples), a.sample_rate
    if ln['who'] == 'mom': x = world(x, sr, 1.9, 1.12)
    if ln['who'] == 'dad': x = world(x, sr, 0.9, 0.97)
    x = resample_poly(x, 48000, sr)
    # trim silence, short fades, normalize
    idx = np.where(np.abs(x) > .02 * np.abs(x).max())[0]; x = x[max(0, idx[0]-480): idx[-1]+2400]
    f = np.minimum(1, np.arange(len(x)) / 480); x *= f * f[::-1]
    x = .9 * x / np.abs(x).max()
    sf.write(f"{HERE}/{ln['id']}.wav", x.astype(np.float32), 48000)
    print(f"{ln['id']:8s} {len(x)/48000:5.2f}s")
