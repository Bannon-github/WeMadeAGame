#!/usr/bin/env python3
"""Generate CHEAP placeholder audio (mono 16-bit WAV) for Lucky Plumber Slots.
These are synthesized beeps/chimes meant only to prove the audio hooks work.
Replace each .wav with your own quality audio (same filename) when ready."""
import wave, struct, math

OUT = "docs/games/lucky-plumber-slots/assets/audio"
SR = 22050


def write(name, samples):
    # soft clip + int16
    frames = bytearray()
    for s in samples:
        s = max(-1.0, min(1.0, s))
        frames += struct.pack("<h", int(s * 32767 * 0.7))
    with wave.open(f"{OUT}/{name}", "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(frames))
    print(f"  {name}  {len(samples)/SR:.2f}s")


def env(i, n, a=0.01, r=0.3):
    """Simple attack/release envelope, 0..1, over sample index i of n."""
    t = i / n
    at = a
    rt = r
    if t < at:
        return t / at
    if t > 1 - rt:
        return max(0.0, (1 - t) / rt)
    return 1.0


def tone(freq, dur, vol=1.0, a=0.01, r=0.3, wave_fn=math.sin):
    n = int(SR * dur)
    return [vol * env(i, n, a, r) * wave_fn(2 * math.pi * freq * i / SR) for i in range(n)]


def mix(*tracks):
    n = max(len(t) for t in tracks)
    out = [0.0] * n
    for t in tracks:
        for i, s in enumerate(t):
            out[i] += s
    return out


def seq(notes):
    """notes = [(freq, dur, vol), ...] played sequentially."""
    out = []
    for f, d, v in notes:
        out += tone(f, d, v, a=0.01, r=0.4)
    return out


def noise(dur, vol, seed=1):
    n = int(SR * dur)
    x = seed
    out = []
    for i in range(n):
        x = (1103515245 * x + 12345) & 0x7FFFFFFF  # LCG (no Math.random needed)
        out.append(vol * env(i, n, 0.02, 0.4) * ((x / 0x3FFFFFFF) - 1.0))
    return out


# UI click — short blip
write("click.wav", tone(880, 0.06, 0.5, a=0.005, r=0.5, wave_fn=lambda p: 1 if math.sin(p) > 0 else -1))

# Reel spin — whirr (detuned saw-ish + noise) ~1.6s to cover spin
def saw(p):
    return (p / math.pi % 2) - 1
spin = mix(tone(220, 1.6, 0.25, a=0.05, r=0.2, wave_fn=saw),
           tone(223, 1.6, 0.2, a=0.05, r=0.2, wave_fn=saw),
           noise(1.6, 0.12))
write("spin.wav", spin)

# Reel stop — short thunk
write("reel_stop.wav", tone(150, 0.12, 0.6, a=0.002, r=0.6))

# Coin ding
write("coin.wav", seq([(1318, 0.06, 0.5), (1760, 0.18, 0.5)]))

# Win — pleasant ascending arpeggio (C E G C)
write("win.wav", seq([(523, 0.12, 0.5), (659, 0.12, 0.5), (784, 0.12, 0.5), (1046, 0.3, 0.5)]))

# Big win — longer fanfare
write("bigwin.wav", seq([(523, 0.12, 0.5), (659, 0.12, 0.5), (784, 0.12, 0.5),
                          (1046, 0.12, 0.5), (784, 0.1, 0.4), (1046, 0.12, 0.5),
                          (1318, 0.45, 0.55)]))

# Background music loop — simple looping chiptune bass + melody (~6s)
mel = seq([(392, 0.3, 0.3), (523, 0.3, 0.3), (659, 0.3, 0.3), (523, 0.3, 0.3),
           (587, 0.3, 0.3), (440, 0.3, 0.3), (523, 0.3, 0.3), (392, 0.3, 0.3),
           (392, 0.3, 0.3), (494, 0.3, 0.3), (587, 0.3, 0.3), (494, 0.3, 0.3),
           (523, 0.3, 0.3), (392, 0.3, 0.3), (349, 0.3, 0.3), (392, 0.3, 0.3)])
bass = seq([(98, 0.6, 0.35), (98, 0.6, 0.35), (110, 0.6, 0.35), (98, 0.6, 0.35),
            (98, 0.6, 0.35), (87, 0.6, 0.35), (98, 0.6, 0.35), (73, 0.6, 0.35)])
write("music_loop.wav", mix(mel, bass))

print("Done.")
