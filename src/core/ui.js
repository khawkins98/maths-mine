// core/ui.js — HUD helpers over the DOM defined in index.html. Games drive the
// shared chrome (status, tally, equation, answer choices, toast, the big
// surviving-total badge, the Next/Re-center buttons) through this thin layer so
// no game reaches into document.getElementById itself.
//
// The raw elements are also exposed as `els` for game-specific extras (e.g. the
// first-touch demo finger). Element IDs are kept in sync with index.html.

const el = (id) => document.getElementById(id);

export function createUI() {
  const els = {
    gate: el('gate'),
    hudTop: el('hud-top'),
    hudBottom: el('hud-bottom'),
    status: el('status'),
    tally: el('tally'),
    askEq: el('askeq'),
    claimEq: el('claimeq'),
    choices: el('choices'),
    btnConfirm: el('btn-confirm'),
    btnRecenter: el('btn-recenter'),
    btnVoice: el('btn-voice'),
    btnWake: el('btn-wake'),
    btnBack: el('btn-back'),
    hub: el('hub'),
    hubCards: el('hub-cards'),
    boltsCount: el('bolts-count'),
    btnBuildHouse: el('btn-build-house'),
    houseStageText: el('house-stage-text'),
    houseCostText: el('house-cost-text'),
    toast: el('toast'),
    bigTotal: el('bigtotal'),
    hint: el('hint'),
    finger: el('finger'),
    bubble: el('bubble'),
  };

  function hideGate() { els.gate.classList.add('hidden'); }

  function showGameHud() {
    els.gate.classList.add('hidden');
    els.hudTop.classList.remove('hidden');
    els.hudBottom.classList.remove('hidden');
  }
  // hide the in-game HUD chrome entirely (top pill/score + bottom status/actions)
  // so none of it bleeds onto the hub menu, which draws its own chrome.
  function hideGameHud() {
    els.hudTop.classList.add('hidden');
    els.hudBottom.classList.add('hidden');
  }

  // ---- hub (game picker) overlay ----
  function showHub() { if (els.hub) els.hub.classList.remove('hidden'); }
  function hideHub() { if (els.hub) els.hub.classList.add('hidden'); }

  // ---- back-to-menu affordance (top-left, shown while a game is active) ----
  function showBack(onClick) { if (!els.btnBack) return; els.btnBack.classList.remove('hidden'); els.btnBack.onclick = onClick; }
  function hideBack() { if (!els.btnBack) return; els.btnBack.classList.add('hidden'); els.btnBack.onclick = null; }

  function setStatus(t) { els.status.textContent = t; }
  // skip-count caption: wrap it in a readable chip (high contrast on the grass)
  function setTally(t) { els.tally.textContent = t || ''; els.tally.classList.toggle('show', !!t); }


  function setAskEq(text) {
    if (text == null) { els.askEq.classList.add('hidden'); return; }
    els.askEq.textContent = text;
    els.askEq.classList.remove('hidden');
  }
  // brief '?' → answer scale pop when the equation sign resolves.
  function popAskEq() { els.askEq.classList.remove('pop'); void els.askEq.offsetWidth; els.askEq.classList.add('pop'); }

  // ---- Truth Check claim headline (the question's big DOM home) ----
  let _claimFadeT = null;
  let _choicesFadeT = null;
  function cancelClaimFade() { clearTimeout(_claimFadeT); _claimFadeT = null; }
  function cancelChoicesFade() { clearTimeout(_choicesFadeT); _choicesFadeT = null; }

  function setClaim(text) {
    cancelClaimFade();
    if (text == null) { els.claimEq.classList.add('hidden'); return; }
    els.claimEq.textContent = text;
    els.claimEq.classList.remove('hidden', 'faded');
  }
  function hideClaim() { cancelClaimFade(); els.claimEq.classList.add('hidden'); els.claimEq.classList.remove('faded'); }
  // brief scale-pop when the claim headline updates (e.g. each group landing).
  function popClaim() { els.claimEq.classList.remove('pop'); void els.claimEq.offsetWidth; els.claimEq.classList.add('pop'); }
  // fade the claim out during the reveal beat, then remove it from layout.
  function fadeClaim() {
    cancelClaimFade();
    els.claimEq.classList.add('faded');
    _claimFadeT = setTimeout(() => { _claimFadeT = null; els.claimEq.classList.add('hidden'); }, 420);
  }

  // Build the three big answer cards. `onPick(value, buttonEl)` fires on tap.
  function showChoices(values, onPick) {
    cancelChoicesFade();
    els.choices.classList.remove('fading');
    els.choices.innerHTML = '';
    for (const v of values) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice';
      b.textContent = v;
      b.addEventListener('click', () => onPick(v, b));
      els.choices.appendChild(b);
    }
    els.choices.classList.remove('hidden');
  }
  function hideChoices() {
    cancelChoicesFade();
    els.choices.classList.add('hidden');
    els.choices.classList.remove('fading');
    els.choices.innerHTML = '';
  }
  // fade the whole answer slab row out (~380ms) then remove it — used after the
  // green flash so no dead distractor button survives onto the reveal.
  function fadeChoices() {
    cancelChoicesFade();
    els.choices.classList.add('fading');
    _choicesFadeT = setTimeout(() => {
      _choicesFadeT = null;
      els.choices.classList.add('hidden');
      els.choices.classList.remove('fading');
      els.choices.innerHTML = '';
    }, 380);
  }
  function choiceButtons() { return [...els.choices.querySelectorAll('.choice')]; }
  // A real disabled state blocks keyboard activation as well as pointer taps.
  // Pointer-events alone allowed Enter/Space to submit an answer repeatedly.
  function lockChoices() { choiceButtons().forEach((c) => { c.disabled = true; }); }
  function currentChoiceValues() { return choiceButtons().map((c) => Number(c.textContent)); }

  function showBigTotal(text) { els.bigTotal.textContent = text; els.bigTotal.className = 'show'; }
  function pulseBigTotal() { els.bigTotal.className = 'show pulse'; }
  function hideBigTotal() { els.bigTotal.className = ''; }

  function showConfirm(label) { els.btnConfirm.textContent = label; els.btnConfirm.classList.remove('hidden'); els.btnConfirm.disabled = false; }
  function hideConfirm() { els.btnConfirm.classList.add('hidden'); }
  function setConfirmEnabled(on) { els.btnConfirm.disabled = !on; }

  let _toastT = null;
  function showToast(text, kind) {
    els.toast.textContent = text;
    els.toast.className = `toast show ${kind || ''}`;
    clearTimeout(_toastT);
    _toastT = setTimeout(() => { els.toast.className = 'toast'; }, 1400);
  }



  return {
    els,
    hideGate, showGameHud, hideGameHud,
    showHub, hideHub, showBack, hideBack,
    setStatus, setTally, setAskEq, popAskEq,
    setClaim, hideClaim, fadeClaim, popClaim,
    showChoices, hideChoices, fadeChoices, choiceButtons, lockChoices, currentChoiceValues,
    showBigTotal, pulseBigTotal, hideBigTotal,
    showConfirm, hideConfirm, setConfirmEnabled,
    showToast,
  };
}
