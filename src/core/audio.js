// core/audio.js — tiny WebAudio SFX. The AudioContext must be created inside a
// user gesture (the wake-gate tap) — call init() there. All helpers no-op
// silently until then, so games can call them freely.

// Effects were authored around a gain of 0.05 while speech synthesis plays at
// full scale, leaving them roughly 25 dB down: inaudible next to Bolt's voice.
//
// Measured at the bus rather than guessed at. A first pass at 9x brought the
// five-note chordSound to 0.46 but left the common short effects at 0.07-0.09,
// because their authored gains were both lower and inconsistent, and because
// the limiter threshold was set below the signal and simply squashed it back
// down. So: the bus is louder, the individual gains are levelled against each
// other, and the limiter now sits just under full scale where it only catches
// genuine overlap instead of acting as a permanent volume cut.
const MASTER = 15;

export function createAudio() {
  let audio = null;
  let noiseBuf = null;
  let master = null;

  // Every sounding node, so a game switch can silence the ones still ringing.
  // Nodes remove themselves on 'ended', so this stays small.
  const live = new Set();
  function track(node) {
    live.add(node);
    node.addEventListener?.('ended', () => live.delete(node));
  }

  function init() {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (_) { audio = null; }
    if (audio) {
      master = audio.createGain();
      master.gain.value = MASTER;
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -1.5; // just under full scale, not under the signal
      limiter.knee.value = 2;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      master.connect(limiter);
      limiter.connect(audio.destination);
    }
    return audio;
  }
  // everything routes through the master bus, never straight to destination
  const out = () => master || audio.destination;
  function resume() { if (audio && audio.state === 'suspended') audio.resume(); }

  // Browsers suspend an AudioContext when the tab goes to the background, and
  // do not always resume it on return. resume() was only ever called once, at
  // the wake gate, so coming back to the tab left the game silent.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
    window.addEventListener?.('focus', resume);
  }

  function beep(freq, dur = 0.08, type = 'square', gain = 0.05) {
    if (!audio) return;
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(out());
    track(o);
    const t = audio.currentTime;
    o.start(t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.stop(t + dur);
  }
  // a tone with a pitch glide + envelope (nicer than a flat beep)
  // `delay` schedules ahead on the audio clock. Sample accurate, and it needs
  // no JS timer that could outlive the game that started it.
  function beepEnv(f0, f1, dur, type, gain, delay = 0) {
    if (!audio) return;
    const o = audio.createOscillator(), g = audio.createGain();
    const t = audio.currentTime + delay;
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out());
    track(o);
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
    track(s);
    s.start(t); s.stop(t + dur);
  }

  // block lands: soft low thud + a little earthy noise (pitch by stack height)
  function thunk(y) { beepEnv(150 + Math.max(0, y + 3) * 6, 95, 0.14, 'sine', 0.058); noiseBurst(0.06, 0.038, 900); }
  function groupChime(g) { beepEnv(520 + g * 70, 660 + g * 70, 0.18, 'triangle', 0.061); } // rises per group
  // The win chord: five notes 80ms apart. Scheduled on the AUDIO clock rather
  // than with setTimeout, so it cannot drift under load and leaves no JS timer
  // running after the game that fired it has been torn down.
  function chordSound() {
    [523, 659, 784, 1046, 1319].forEach((f, i) => beepEnv(f, f, 0.3, 'triangle', 0.046, i * 0.08));
  }
  function buzzSound() { beepEnv(300, 170, 0.24, 'sine', 0.062); } // gentle "not quite" — never harsh

  // Wooden knock for pressing a control. Everything in this world is planks and
  // dirt, so a UI click should sound like knuckles on a board, not a beep.
  // `bright` shifts the pitch so a small back button and a big answer slab feel
  // like different objects without needing separate sounds.
  function woodTap(bright = 1) {
    beepEnv(230 * bright, 96 * bright, 0.08, 'sine', 0.053);
    noiseBurst(0.05, 0.041, 1150 * bright);
  }

  // Silence whatever is still sounding. Called when a game is torn down: a
  // celebration chord ringing out over the next screen is disorienting.
  function hush() {
    for (const n of live) { try { n.stop(0); } catch (_) { /* already stopped */ } }
    live.clear();
  }

  return {
    init, resume, hush, beep, beepEnv, noiseBurst, thunk, groupChime, chordSound, buzzSound, woodTap,
    // the mixer bus, so output level can actually be measured rather than guessed at
    context: () => audio,
    bus: () => master,
  };
}
