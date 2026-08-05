// core/speech.js — spoken narration, via the browser's own speech synthesis.
//
// On the engine: there is no better *offline* option in a browser. The
// alternatives are worse (meSpeak and espeak ports sound robotic) or need a
// network round trip, an API key and a bill per sentence, which is the wrong
// trade for a toy that should work on a tablet with the wifi off. What actually
// moves quality is picking the best voice the device already has instead of
// taking whatever getVoices() lists first, and giving the child time to hear it.
//
// PACING IS THE POINT. The old version called synth.cancel() at the top of
// every speak(), so each new line guillotined the one before it: a child heard
// "two groups of six, not si-" and then the next fragment, with no pauses
// anywhere. Lines are now queued and separated by a real gap, and long lines
// are split at sentence boundaries so a number lands on its own beat:
//
//   "Let's count. Twelve! So two times six is twelve, not six."
//    ^--- pause ---^  ^--- pause ---^
//
// Only a genuine change of context (a new round) clears the queue, via reset().

const GAP_MS = 340;        // silence between phrases
const SENTENCE_GAP = 210;  // slightly tighter within one line
const MAX_PENDING = 4;     // never let narration lag behind the game

export function createSpeech() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let voiceOn = true;
  let chosenVoice = null;

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
    chosenVoice = vs
      .map((v) => ({ v, s: score(v) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.v)[0] || vs[0];
  }
  if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }

  // ---- the queue ----
  const pending = [];
  let busy = false;
  let gapTimer = null;

  function utter(text, onDone) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (chosenVoice) u.voice = chosenVoice;
      u.rate = 0.92; u.pitch = 1.12; u.volume = 1; // friendly, unhurried
      u.onend = onDone;
      u.onerror = onDone; // a failed utterance must not stall the queue
      synth.speak(u);
    } catch (_) { onDone(); }
  }

  function pump() {
    if (busy || !pending.length) return;
    if (!voiceOn) { pending.length = 0; return; }
    busy = true;
    const { text, gap } = pending.shift();
    utter(text, () => {
      busy = false;
      clearTimeout(gapTimer);
      gapTimer = setTimeout(pump, gap);
    });
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
    parts.forEach((p, i) => {
      pending.push({ text: p, gap: i < parts.length - 1 ? SENTENCE_GAP : GAP_MS });
    });
    // If the game gets far ahead of the narration, drop the backlog rather than
    // narrating a round the child has already finished.
    while (pending.length > MAX_PENDING) pending.shift();
    pump();
  }

  // prime synthesis synchronously inside a user gesture (iOS needs it)
  function prime() {
    if (!synth) return;
    try { synth.cancel(); synth.speak(new SpeechSynthesisUtterance(' ')); } catch (_) {}
  }

  // Drop everything and go quiet. For a real change of context (a new round),
  // never merely for the next line.
  function reset() {
    pending.length = 0;
    busy = false;
    clearTimeout(gapTimer);
    try { synth?.cancel(); } catch (_) {}
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
  };
}
