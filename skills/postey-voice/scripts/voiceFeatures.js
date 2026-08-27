'use strict';

// Observable features of a piece of writing, and the rule observations they imply.
//
// Everything here is COUNTABLE. "Warm but authoritative" is a judgement and belongs
// to the agent reading the corpus; this file only measures things that cannot be
// argued with, so that a rule promoted from them can always name its evidence.

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
const EMOJI = /\p{Extended_Pictographic}/gu;
const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const URL = /https?:\/\/\S+/g;
const CTA_HINT =
  /\b(link in bio|sign up|subscribe|read more|check it out|dm me|comment below|join|download|try it)\b/i;

const count = (text, re) => (text.match(re) || []).length;
const median = xs => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

/** Countable features of one document. */
function analyze(text) {
  const body = String(text || '').trim();
  const sentences = body ? body.split(SENTENCE_SPLIT).filter(s => s.trim()) : [];
  const words = body ? body.split(/\s+/).filter(Boolean) : [];
  const first = sentences[0] || '';

  return {
    words: words.length,
    sentences: sentences.length,
    median_sentence_words: median(
      sentences.map(s => s.split(/\s+/).filter(Boolean).length)
    ),
    em_dashes: count(body, /—/g),
    exclamations: count(body, /!/g),
    emoji: count(body, EMOJI),
    hashtags: count(body, HASHTAG),
    links: count(body, URL),
    opens_with_question: /\?/.test(first),
    opens_with_greeting: /^(hi|hey|hello|good (morning|afternoon|evening))\b/i.test(first),
    has_cta: CTA_HINT.test(body),
  };
}

// A pattern is only worth an observation when its absence or presence is
// unambiguous in that document. A doc with no sentences says nothing about
// openers, so it produces nothing rather than a misleading zero.
const DETECTORS = [
  { rule: 'no em-dashes',        applies: f => f.words >= 20, supports: f => f.em_dashes === 0 },
  { rule: 'no exclamation marks', applies: f => f.words >= 20, supports: f => f.exclamations === 0 },
  { rule: 'no emoji',            applies: f => f.words >= 20, supports: f => f.emoji === 0 },
  { rule: 'no hashtags',         applies: f => f.words >= 20, supports: f => f.hashtags === 0 },
  { rule: 'opens with a question', applies: f => f.sentences >= 1, supports: f => f.opens_with_question },
  { rule: 'never opens with a greeting', applies: f => f.sentences >= 1, supports: f => !f.opens_with_greeting },
  { rule: 'ends with a call to action', applies: f => f.words >= 20, supports: f => f.has_cta },
  { rule: 'short sentences (under 15 words)', applies: f => f.sentences >= 2, supports: f => f.median_sentence_words < 15 },
];

/**
 * Turn documents into rule observations the compiler can promote.
 * Each doc is `{ id, text, scope, ts }`.
 */
function observationsFrom(docs) {
  const out = [];
  for (const doc of docs) {
    const f = analyze(doc.text);
    for (const d of DETECTORS) {
      if (!d.applies(f)) continue;
      out.push({
        rule: d.rule,
        scope: doc.scope || 'all',
        post_id: doc.id,
        supports: d.supports(f),
        ts: doc.ts,
      });
    }
  }
  return out;
}

/** Corpus-level summary for the profile's `observed.features`. */
function summarise(docs) {
  const per = docs.map(d => ({ id: d.id, ...analyze(d.text) }));
  const withWords = per.filter(p => p.words >= 20);
  const denom = withWords.length || 1;
  const rate = pick => +(withWords.reduce((n, p) => n + pick(p), 0) / denom).toFixed(2);

  return [
    {
      feature: 'sentence length',
      value: `median ${median(per.map(p => p.median_sentence_words))} words`,
      from: per.map(p => p.id),
    },
    {
      feature: 'emoji rate',
      value: `${rate(p => p.emoji)} per post`,
      from: withWords.map(p => p.id),
    },
    {
      feature: 'hashtag rate',
      value: `${rate(p => p.hashtags)} per post`,
      from: withWords.map(p => p.id),
    },
    {
      feature: 'openers',
      value:
        `${per.filter(p => p.opens_with_question).length} of ${per.length} open with a question; ` +
        `${per.filter(p => p.opens_with_greeting).length} with a greeting`,
      from: per.map(p => p.id),
    },
    {
      feature: 'call to action',
      value: `${withWords.filter(p => p.has_cta).length} of ${withWords.length} carry one`,
      from: withWords.map(p => p.id),
    },
  ];
}

module.exports = { analyze, observationsFrom, summarise, DETECTORS };
