import json, sys
import numpy as np
from scipy import signal

out_path = sys.argv[1]
rng = np.random.default_rng(42)
fs = 8000
x = rng.uniform(-1, 1, 2048)

cases = [
    ("lowpass", 1, 1000), ("lowpass", 5, 1000), ("lowpass", 8, 300),
    ("highpass", 2, 500), ("highpass", 5, 2500),
    ("bandpass", 1, [300, 1200]), ("bandpass", 4, [500, 1500]), ("bandpass", 5, [100, 3500]),
]
filters = []
for band, order, cutoff in cases:
    sos = signal.butter(order, cutoff, btype=band, fs=fs, output="sos")
    z, p, k = signal.butter(order, cutoff, btype=band, fs=fs, output="zpk")
    filters.append({
        "band": band, "order": order, "cutoff": cutoff, "fs": fs,
        "y": signal.sosfilt(sos, x).tolist(),
        "freqs": [50, 300, 1000, 2000, 3900],
        "gains": [float(abs(signal.sosfreqz(sos, worN=[f], fs=fs)[1][0])) for f in [50, 300, 1000, 2000, 3900]],
        "phases": [float(np.angle(signal.sosfreqz(sos, worN=[f], fs=fs)[1][0])) for f in [50, 300, 1000, 2000, 3900]],
        "zpk": {
            "z": [[float(c.real), float(c.imag)] for c in z],
            "p": [[float(c.real), float(c.imag)] for c in p],
            "k": float(k),
        },
    })

v = rng.standard_normal(256) + 1j * rng.standard_normal(256)
X = np.fft.fft(v)
json.dump({
    "x": x.tolist(),
    "filters": filters,
    "fft": {"re": v.real.tolist(), "im": v.imag.tolist(), "outRe": X.real.tolist(), "outIm": X.imag.tolist()},
}, open(out_path, "w"))
print("ok", __import__("scipy").__version__)
