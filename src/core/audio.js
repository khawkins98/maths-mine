// core/audio.js — tiny WebAudio SFX. The AudioContext must be created inside a
// user gesture (the wake-gate tap) — call init() there. All helpers no-op
// silently until then, so games can call them freely.

// One master gain in front of the destination. Every effect was authored at a
// gain of roughly 0.05, which sits far below the speech-synthesis track and was
// close to inaudible on a tablet speaker: taps on the ground could not be heard
// at all. Trimming levels one call at a time would drift, so the whole bus is
// lifted here instead.
const MASTER = 2.6;

export function createAudio() {
  let audio = null;
  let noiseBuf = null;
  let master = null;

  function init() {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (_) { audio = null; }
    if (audio) {
      master = audio.createGain();
      master.gain.value = MASTER;
      master.connect(audio.destination);
    }
    return audio;
  }
  // everything routes through the master bus, never straight to destination
  const out = () => master || audio.destination;
  function resume() { if (audio && audio.state === 'suspended') audio.resume(); }

  function beep(freq, dur = 0.08, type = 'square', gain = 0.05) {
    if (!audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(out());
    const t = audio.currentTime;
    o.start(t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.stop(t + dur);
  }
  // a tone with a pitch glide + envelope (nicer than a flat beep)
  function beepEnv(f0, f1, dur, type, gain) {
    if (!audio) return;
    const o = audio.createOscillator(), g = audio.createGain();
    const t = audio.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out());
    o.start(t); o.stop(t + dur);
  }
  function noiseBurst(dur, gain, cutoff = 1200) {
    if (!audio) return;
    if (!noiseBuf) {
      noiseBuf = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.2), audio.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; // audio-only randomness is fine
    }
    const s = audio.createBufferSource(); s.buffer = noiseBuf;
    const f = audio.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = audio.createGain(); const t = audio.currentTime;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out());
    s.start(t); s.stop(t + dur);
  }

  // block lands: soft low thud + a little earthy noise (pitch by stack height)
  function thunk(y) { beepEnv(150 + Math.max(0, y + 3) * 6, 95, 0.12, 'sine', 0.05); noiseBurst(0.05, 0.025, 900); }
  function groupChime(g) { beepEnv(520 + g * 70, 660 + g * 70, 0.16, 'triangle', 0.06); } // rises per group
  function chordSound() { [523, 659, 784, 1046, 1319].forEach((f, i) => setTimeout(() => beepEnv(f, f, 0.3, 'triangle', 0.05), i * 80)); }
  function buzzSound() { beepEnv(300, 170, 0.22, 'sine', 0.05); } // gentle "not quite" — never harsh

  // Wooden knock for pressing a control. Everything in this world is planks and
  // dirt, so a UI click should sound like knuckles on a board, not a beep.
  // `bright` shifts the pitch so a small back button and a big answer slab feel
  // like different objects without needing separate sounds.
  function woodTap(bright = 1) {
    beepEnv(230 * bright, 96 * bright, 0.07, 'sine', 0.055);
    noiseBurst(0.045, 0.03, 1150 * bright);
  }

  return { init, resume, beep, beepEnv, noiseBurst, thunk, groupChime, chordSound, buzzSound, woodTap };
}
