// core/speech.js — spoken narration, via the browser's own speech synthesis.
//
// On the engine: there is no better *offline* option in a browser. The
// alternatives are worse (meSpeak and espeak ports sound robotic) or need a
// network round trip, an API key and a bill per sentence, which is the wrong
// trade for a toy that should work on a tablet with the wifi off. What actually
// moves quality is picking the best voice the device already has, and giving
// the child time to hear it.
//
// PACING IS THE POINT, and getting it right is mostly a state problem. The Web
// Speech API is a shared, asynchronous, singleton queue that lies to you:
//
//   * `cancel()` is not synchronous. Utterances submitted later in the SAME
//     task fall inside the cancelled window and die too. Callers naturally
//     write `reset(); speak(...)` at a round boundary, which silently killed
//     the line they had just queued. This is why a child heard "five times ten
//     is—" then silence then "true, or false?".
//   * A cancelled utterance still fires an event, and `onerror` looks exactly
//     like `onend` unless you inspect `e.error`. Treating them alike advanced
//     the queue on a phrase that never played.
//   * Callbacks from an abandoned round still arrive afterwards and, without an
//     identity check, write to the CURRENT round's state.
//   * Engines drop events: an utterance can be garbage collected mid-speech and
//     never fire anything, wedging the queue forever.
//   * Some engines fire `onerror` AND `onend` for the same utterance.
//
// So: every asynchronous callback carries the epoch it was born in and does
// nothing if the epoch has moved on; one `speak()` call is one atomic GROUP, so
// a sentence is never half-spoken; the queue sheds whole old groups rather than
// individual phrases; nothing is submitted inside a cancel window; and a
// watchdog un-wedges the queue if the engine goes silent.

const GAP_MS = 340;        // silence between separate lines
const SENTENCE_GAP = 210;  // slightly tighter within one line
const MAX_GROUPS = 3;      // never let narration lag far behind the game
const CANCEL_SETTLE_MS = 80; // how long a cancel() keeps eating new utterances

export function createSpeech() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let voiceOn = true;
  let chosenVoice = null;
  let pendingVoice = null;
  // Firefox can expose voices synchronously on first load, so pickVoice() may
  // read this during initialization. Declare it before the first pickVoice()
  // call instead of leaving it in the temporal dead zone below.
  let current = null;    // { u, epoch, done, timer } — also holds the utterance

  // Score the available voices rather than taking the first English one. Device
  // voice lists vary wildly; the "Enhanced"/"Premium"/"Neural" variants are a
  // large step up in quality and are what a child actually has to follow.
  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    if (!vs.length) return;
    const score = (v) => {
      if (!/^en/i.test(v.lang)) return -1;
      let s = 0;
      if (/enhanced|premium|natural|neural/i.test(v.name)) s += 6;
      if (/samantha|karen|serena|moira|tessa|kate|fiona|daniel/i.test(v.name)) s += 3;
      if (/^en-GB/i.test(v.lang)) s += 2;   // the rest of the app is British
      if (v.localService) s += 1;           // no network hitch mid-sentence
      if (/compact|eloquence|novelty|whisper|bells|bubbles|zarvox/i.test(v.name)) s -= 8;
      return s;
    };
    const best = vs
      .map((v) => ({ v, s: score(v) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.v)[0] || vs[0];
    // Don't swap voices mid-sentence if the list reloads while we are talking.
    if (!current) chosenVoice = best;
    else pendingVoice = best;
  }
  if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }

  // ---- state ----
  // `epoch` is the identity of the current run of narration. reset() bumps it,
  // which invalidates every callback still in flight from the previous one.
  let epoch = 0;
  const queue = [];      // groups: { parts: [{ text, gap }] } — one per speak()
  let gapTimer = null;
  let resumeAt = 0;      // no speaking before this: the cancel window

  function utter(part, myEpoch) {
    const u = new SpeechSynthesisUtterance(part.text);
    if (chosenVoice) u.voice = chosenVoice;
    u.rate = 0.92; u.pitch = 1.12; u.volume = 1; // friendly, unhurried

    // Held in `current` rather than left to the garbage collector: a collected
    // utterance never fires its events and wedges the queue for good.
    const rec = { u, epoch: myEpoch, done: false, timer: null };

    const finish = (interrupted) => {
      if (rec.done) return;              // some engines fire error AND end
      rec.done = true;
      clearTimeout(rec.timer);
      if (rec.epoch !== epoch) return;   // a dead round must not touch live state
      current = null;
      if (pendingVoice) { chosenVoice = pendingVoice; pendingVoice = null; }
      clearTimeout(gapTimer);
      if (interrupted) return;           // it never played; do not advance
      gapTimer = setTimeout(pump, part.gap);
    };

    u.onend = () => finish(false);
    u.onerror = (e) => finish(!!e && (e.error === 'interrupted' || e.error === 'canceled'));

    // If the engine goes silent without telling us, recover. Generous, so it
    // only ever fires on a genuine stall.
    rec.timer = setTimeout(() => finish(false), 2500 + part.text.length * 110);

    current = rec;
    try { synth.speak(u); } catch (_) { finish(false); }
  }

  function pump() {
    if (!synth || !voiceOn) return;
    if (current && !current.done) return;

    // Never submit inside a cancel window: the browser would eat it.
    const wait = resumeAt - Date.now();
    if (wait > 0) {
      clearTimeout(gapTimer);
      gapTimer = setTimeout(pump, wait);
      return;
    }

    const group = queue[0];
    if (!group) return;
    const part = group.parts.shift();
    if (!group.parts.length) queue.shift();
    utter(part, epoch);
  }

  // Split a line so each sentence gets its own breath. Keeps the punctuation,
  // because the engine's own prosody uses it.
  function phrases(text) {
    return String(text)
      .split(/(?<=[.!?…])\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  function speak(text) {
    if (!synth || !voiceOn || !text) return;
    const parts = phrases(text);
    if (!parts.length) return;

    // One call is one atomic group. Shedding happens a WHOLE group at a time,
    // oldest first: stale chatter is dropped, and the line just asked always
    // survives. Dropping individual phrases is what produced half-sentences.
    queue.push({
      parts: parts.map((p, i) => ({ text: p, gap: i < parts.length - 1 ? SENTENCE_GAP : GAP_MS })),
    });
    while (queue.length > MAX_GROUPS) queue.shift();
    pump();
  }

  // prime synthesis synchronously inside a user gesture (iOS needs it)
  function prime() {
    if (!synth) return;
    try { synth.speak(new SpeechSynthesisUtterance(' ')); } catch (_) {}
  }

  // Drop everything and go quiet. For a real change of context — a new round, a
  // game teardown — never merely for the next line.
  function reset() {
    epoch++;                     // orphan every callback still in flight
    queue.length = 0;
    if (current) { current.done = true; clearTimeout(current.timer); current = null; }
    clearTimeout(gapTimer);
    gapTimer = null;
    try { synth?.cancel(); } catch (_) {}
    // Anything submitted right now dies with the cancel, so hold off briefly.
    resumeAt = Date.now() + CANCEL_SETTLE_MS;
  }

  function setVoiceOn(on) { voiceOn = !!on; if (!voiceOn) reset(); }
  function isVoiceOn() { return voiceOn; }

  // spoken form of an equation: "2 times 2" / "2 times 2 is 4"
  function eqWords(a, b, ans) { return `${a} times ${b}${ans != null ? ` is ${ans}` : ''}`; }
  // spoken form of a division fact: "12 divided by 3" / "12 divided by 3 is 4"
  function divWords(d, s, ans) { return `${d} divided by ${s}${ans != null ? ` is ${ans}` : ''}`; }

  // rotate through phrasings so the narration doesn't get repetitive
  let vSeed = 0;
  const pickPhrase = (arr) => arr[(vSeed++) % arr.length];

  return {
    speak, prime, setVoiceOn, isVoiceOn, reset, cancel: reset,
    eqWords, divWords, pickPhrase,
    voiceName: () => (chosenVoice ? `${chosenVoice.name} (${chosenVoice.lang})` : null),
    // for tests: what is queued and whether anything is speaking
    debugState: () => ({ epoch, groups: queue.length, speaking: !!(current && !current.done) }),
  };
}
