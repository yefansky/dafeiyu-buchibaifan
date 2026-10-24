"""Tiny local completion chime for the BigFish helper.

The sound palette and envelope are a direct port of the reviewed
``dsh-token-pet`` completion sound: three two-note themes rendered with
oscillators, a very low peak gain, a 15 ms attack and a 230 ms exponential
decay.  token-pet synthesises the notes with Web Audio in the browser; the
desktop pet lives in a native helper, so the same envelope is rendered into a
small in-memory WAV and played with the Windows ``winsound`` module.  No audio
files, no network, no extra dependency.

Everything here is deliberately side-effect free except ``play()``: the WAV
builder is pure so it can be unit tested without an audio device.
"""

from __future__ import annotations

import io
import math
import struct
import threading
import wave
from typing import Any

# [frequency Hz, start offset seconds] pairs, copied from token-pet.
SOUND_THEMES: dict[str, tuple[tuple[float, float], ...]] = {
    "chime": ((660.0, 0.0), (880.0, 0.12)),
    "pop": ((523.0, 0.0), (784.0, 0.09)),
    "soft": ((392.0, 0.0), (523.0, 0.16)),
}

THEME_IDS = tuple(SOUND_THEMES)
DEFAULT_PEAK_GAIN = 0.055
SAMPLE_RATE = 44100

# Envelope constants (seconds) mirror the Web Audio parameters exactly:
# gain 0 -> linear to peak in 15 ms -> exponential to 1e-4 at 230 ms -> stop 250 ms.
ATTACK_S = 0.015
DECAY_END_S = 0.23
NOTE_END_S = 0.25
FLOOR_GAIN = 1e-4


def _clamp01(value: Any) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 1.0
    return max(0.0, min(1.0, float(value)))


def build_wav(theme: str = "chime", volume: float = 1.0, sample_rate: int = SAMPLE_RATE) -> bytes:
    """Render one two-note completion chime to a mono 16-bit WAV image.

    A missing/unknown theme falls back to ``chime``; volume is clamped to 0..1.
    The result is a complete in-memory WAV so ``winsound`` can play it without
    touching disk.
    """
    notes = SOUND_THEMES.get(theme, SOUND_THEMES["chime"])
    peak = DEFAULT_PEAK_GAIN * _clamp01(volume)
    duration = max(offset for _, offset in notes) + NOTE_END_S
    total = max(1, int(math.ceil(duration * sample_rate)))
    samples = [0.0] * total
    attack = max(1, int(ATTACK_S * sample_rate))
    decay_end = max(attack + 1, int(DECAY_END_S * sample_rate))
    note_len = max(decay_end + 1, int(NOTE_END_S * sample_rate))
    # Exponential ramp from peak to a volume-scaled floor across the decay.
    decay_span = max(1, decay_end - attack)
    floor_gain = FLOOR_GAIN * _clamp01(volume)
    decay_ratio = (floor_gain / peak) if peak > 0 else 1.0
    log_ratio = math.log(decay_ratio) if decay_ratio > 0 else 0.0
    soft = theme == "soft"
    for frequency, offset in notes:
        if peak <= 0.0:
            continue
        start = max(0, int(offset * sample_rate))
        omega = 2.0 * math.pi * frequency / sample_rate
        for index in range(note_len):
            target = start + index
            if target >= total:
                break
            if index < attack:
                envelope = peak * (index / attack)
            elif index < decay_end:
                envelope = peak * math.exp(log_ratio * ((index - attack) / decay_span))
            else:
                envelope = floor_gain
            phase = omega * index
            if soft:
                # triangle: 2/pi * asin(sin(x)), matching the "soft" oscillator.
                wave_value = (2.0 / math.pi) * math.asin(max(-1.0, min(1.0, math.sin(phase))))
            else:
                wave_value = math.sin(phase)
            samples[target] += envelope * wave_value

    # 5 ms fade-out avoids a click if the final sample is not near zero.
    fade = min(total, max(1, int(0.005 * sample_rate)))
    for index in range(fade):
        samples[total - fade + index] *= 1.0 - (index / fade)

    pcm = bytearray(total * 2)
    for index, value in enumerate(samples):
        clamped = max(-1.0, min(1.0, value))
        struct.pack_into("<h", pcm, index * 2, int(round(clamped * 32767.0)))

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(bytes(pcm))
    return buffer.getvalue()


class CompletionSound:
    """Play the completion chime, gated by the user's settings.

    ``enabled`` defaults to False, matching token-pet: the plugin must never
    become noisy on its own.  ``play(force=True)`` is used by the settings
    "preview" button and ignores the enabled gate, but still honours volume.
    """

    def __init__(
        self,
        *,
        enabled: bool = False,
        theme: str = "chime",
        volume: float = 1.0,
    ) -> None:
        self.enabled = bool(enabled)
        self.theme = theme if theme in SOUND_THEMES else "chime"
        self.volume = _clamp01(volume)
        self._cache: dict[tuple[str, int], bytes] = {}
        self._last_play_ms = -10**9
        self._lock = threading.Lock()

    def configure(self, *, enabled: Any = None, theme: Any = None, volume: Any = None) -> None:
        if isinstance(enabled, bool):
            self.enabled = enabled
        if isinstance(theme, str) and theme in SOUND_THEMES:
            self.theme = theme
        if volume is not None:
            self.volume = _clamp01(volume)

    def wav(self) -> bytes:
        # Quantise volume to 5% so repeated plays reuse the same buffer.
        bucket = int(round(self.volume * 20))
        key = (self.theme, bucket)
        cached = self._cache.get(key)
        if cached is None:
            cached = build_wav(self.theme, bucket / 20.0)
            self._cache[key] = cached
        return cached

    def play(self, *, force: bool = False, now_ms: int | None = None) -> bool:
        """Play asynchronously on a daemon thread.  Never raises."""
        if not force and not self.enabled:
            return False
        now = int(now_ms if now_ms is not None else _monotonic_ms())
        with self._lock:
            # Completion pulses can repeat within one visual turnaround; keep
            # them from stacking into a chord.
            if now - self._last_play_ms < 600:
                return False
            self._last_play_ms = now
        try:
            data = self.wav()
        except Exception:
            return False
        try:
            import winsound
        except Exception:
            return False
        threading.Thread(target=_play_wav, args=(data,), name="dsh-bigfish-sound", daemon=True).start()
        return True


def _monotonic_ms() -> int:
    import time

    return int(time.monotonic() * 1000)


def _play_wav(data: bytes) -> None:
    try:
        import winsound

        winsound.PlaySound(data, winsound.SND_MEMORY)
    except Exception:
        # No audio device, a remote session, or a policy block: stay silent.
        pass
