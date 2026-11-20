/**
 * Subtle retro Win95 / AIM-inspired message notification ping using Web Audio API.
 * Gracefully no-ops in headless/SSR environments or before audio context unlock.
 */
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export function playMessagePing(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Gentle two-note classic IM chime (E6 -> B6) with soft sine/triangle decay
    const notes = [
      { freq: 1318.51, start: 0, dur: 0.09, peak: 0.055 },
      { freq: 1975.53, start: 0.065, dur: 0.14, peak: 0.045 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, now + note.start);

      gain.gain.setValueAtTime(0.0001, now + note.start);
      gain.gain.exponentialRampToValueAtTime(note.peak, now + note.start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + note.start);
      osc.stop(now + note.start + note.dur + 0.02);
    }
  } catch {
    // Ignore autoplay-policy rejections prior to user interaction
  }
}
