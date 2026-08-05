// core/speech.js — system TTS narration. Friendly, slightly higher-pitched
// voice, with phrase-variety helpers so narration doesn't get repetitive.
// speak() no-ops safely when speech is unavailable or muted.

export function createSpeech() {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let voiceOn = true;
  let chosenVoice = null;

  function pickVoice() {
    if (!synth) return;
    const vs = synth.getVoices();
    if (!vs.length) return;
    chosenVoice =
      vs.find((v) => /^en/i.test(v.lang) && /(samantha|karen|google|zira|female|kid|child)/i.test(v.name)) ||
      vs.find((v) => /^en/i.test(v.lang)) || vs[0];
  }
  if (synth) { pickVoice(); synth.addEventListener?.('voiceschanged', pickVoice); }

  function speak(text) {
    if (!synth || !voiceOn || !text) return;
    try {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (chosenVoice) u.voice = chosenVoice;
      u.rate = 0.95; u.pitch = 1.15; u.volume = 1; // friendly, slightly higher
      synth.speak(u);
    } catch (_) { /* speech not available — silent */ }
  }

  // prime synthesis synchronously inside a user gesture (iOS needs it)
  function prime() { if (synth) { try { synth.cancel(); synth.speak(new SpeechSynthesisUtterance(' ')); } catch (_) {} } }

  function setVoiceOn(on) { voiceOn = !!on; if (!voiceOn) synth?.cancel(); }
  function isVoiceOn() { return voiceOn; }
  function cancel() { synth?.cancel(); }

  // spoken form of an equation: "2 times 2" / "2 times 2 is 4"
  function eqWords(a, b, ans) { return `${a} times ${b}${ans != null ? ` is ${ans}` : ''}`; }
  // spoken form of a division fact: "12 divided by 3" / "12 divided by 3 is 4"
  function divWords(d, s, ans) { return `${d} divided by ${s}${ans != null ? ` is ${ans}` : ''}`; }

  // rotate through phrasings so the narration doesn't get repetitive
  let vSeed = 0;
  const pickPhrase = (arr) => arr[(vSeed++) % arr.length];

  return { speak, prime, setVoiceOn, isVoiceOn, cancel, eqWords, divWords, pickPhrase };
}
