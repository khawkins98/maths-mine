// games/nightDefense/facts.js — adaptive challenges for Night Defence.

import { buildChoiceSet } from '../../core/choices.js';

export function createFactPicker(mastery) {
  function pickFact() {
    // Use the same scheduler as every other game. This keeps a new child on
    // small 2/5/10-table facts and only introduces division once its
    // multiplication sibling is known.
    const q = mastery.nextQuestion();
    if (q.op === 'div') {
      return {
        a: q.a,
        b: q.b,
        op: '÷',
        dividend: q.dividend,
        divisor: q.divisor,
        target: q.answer,
        text: `${q.dividend} ÷ ${q.divisor} = ?`,
        answerText: `${q.dividend} ÷ ${q.divisor} = ${q.answer}`,
        choices: buildChoiceSet(q.answer, 1),
      };
    }
    return {
      a: q.a,
      b: q.b,
      op: '×',
      target: q.answer,
      text: `${q.a} × ${q.b} = ?`,
      answerText: `${q.a} × ${q.b} = ${q.answer}`,
      choices: buildChoiceSet(q.answer, q.b),
    };
  }

  return { pickFact };
}
