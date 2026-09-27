/**
 * KAMI Bot — South African voice
 *
 * Complete-utterance phrase banks + position-aware helpers.
 * Lexicon/metadata lives in utils/slang-lex.js.
 *
 * Design rule (why this file exists):
 *   The old SLANG dict threw single words at English sentences, so you got
 *   "yoh — couldn't add them" and "Antitag turned ON moegoe". Real SA speech
 *   is not a word salad — it is an interjection at the FRONT (eish, ag no man,
 *   hayibo), or a short tag at the END (hey, shame, man, mos, boet), or a
 *   complete line. These helpers return the whole natural chunk.
 *
 * Position facts taken from corpus research:
 *   - clause-initial: eish, yho, tjo, sho, hayi, hau   (Degruyter 2024)
 *   - non-initial:    mxm (kiss-teeth)                  (Degruyter 2024)
 *   - sentence-final: hey (softener/agreement), shame (solidarity), mos
 *   - 'ek sê' sits at the start OR the end of a statement
 */

const { LEX } = require('./slang-lex');

const pick = (arr) => (arr && arr.length ? arr[Math.floor(Math.random() * arr.length)] : '');

// ─── Openers (clause-initial — never move these to the end) ─────────────────

const OPEN_ERR = [
  'Eish', 'Ag no man', 'Hayibo', 'Awu', 'Yoh', 'Tjo', 'No ways',
  'Jissie', 'Bathong', 'Ai', 'Sjoe', 'Eish man', 'Ag shame',
];

const OPEN_INFO = [
  'Sho', 'Eish', 'Ja-nee', 'Sjoe', 'Yoh', 'Ai',
];

const OPEN_WARN = [
  'Ag no', 'Ai', 'Eish', 'Hayibo', 'No ways', 'Jo',
];

const OPEN_GREET = [
  'Howzit', 'Aweh', 'Heita', 'Hosh', 'Sho', 'Uyaphila', 'Dumela',
];

// ─── Sentence-final tags ────────────────────────────────────────────────────
// kind: affirm | neutral | err | hype | soften

const TAG_AFFIRM = [
  'lekke', 'kiff', 'kwaai', 'nca', 'hundreds', 'solid', 'bakgat',
  'moja', 'ayoba', 'word', '100', 'phanda', 'duidelik', 'oke shem',
  'sho lekke', 'ngeke',
];

const TAG_NEUTRAL = [
  'hey', 'man', 'ne', 'boet', 'chommie', 'sure', 'salute', 'mos',
  'ek sê', 'yazi', 'hey?',
];

const TAG_ERR = [
  'shame', 'man', 'hey', 'boet', 'chommie', 'shame man',
  'ag shame', 'sorry', 'ne',
];

const TAG_HYPE = [
  'ngeke ke', 'lekker gents', 'yebo shame', 'hundreds', 'phanda',
  'kwaai moves', 'moja', 'bakgat',
];

const TAG_SOFTEN = ['hey', 'man', 'shame', 'ne', 'boet'];

// ─── Sentence-initial particles (used where the slot starts a line) ─────────

const LEAD_AFFIRM = ['Lekke', 'Kiff', 'Sho', 'Aweh', 'Moja', 'Bakgat', 'Nca', 'Solid'];
const LEAD_NEUTRAL = ['Sho', 'Eish', 'Yoh', 'Ja-nee', 'Aweh', 'Sjoe'];
const LEAD_HYPE = ['Ngeke ke', 'Yebo shame', 'Lekker', 'Phanda', 'Hundred percent'];

// ─── Stand-alone reactions (the whole message is the slang) ────────────────

const REACT_OK = [
  'Sho, sorted lekke', 'Yebo, that is how we do it', 'Lekker, done and dusted',
  'Bakgat, handled', 'Hundred percent, sorted', 'Kiff, it went through',
  'Phanda, that is the one', 'Moja, clean work', 'Ngeke, proper',
];

const REACT_FAIL = [
  'Eish, that did not go', 'Ag no man, it broke on me',
  'Hayibo, no ways that worked', 'Awu, something went stukkend',
  'Tjo, that one failed', 'No ways, try again hey',
  'Jissie, that went sideways', 'Bathong, not today',
];

const REACT_DUNNO = [
  'Sho... I got nothing', 'Eish, that is a funny one',
  'Bathong, where did that come from', 'Yoh, okay I see you',
];

// ─── Terms of address ───────────────────────────────────────────────────────

const ADDR = [
  'my bru', 'chommie', 'china', 'laaitie', 'boet', 'bra', 'sisi',
  'mbokodo', 'baba', 'makhulu', 'mfo', 'gents', 'ou', 'oom', 'antie',
  'ndoda', 'gogo', 'boytjie',
];

/**
 * Age-/gender-neutral subset — use when addressing someone you know nothing
 * about (goodbyes, welcomes, generic pings). The full ADDR list is fine for
 * playful teasing where the mismatch is part of the joke.
 */
const ADDR_SAFE = [
  'my bru', 'chommie', 'china', 'boet', 'bra', 'sisi', 'mfo',
  'gents', 'laaitie', 'ou',
];

// ─── Complete lines per speech act ──────────────────────────────────────────
// Use these wherever the message is fixed and has no variable detail.

const SAY = {
  greeting: [
    'Howzit, my bru 👋', 'Aweh! Heita 👋', 'Sho, sisi! 👋',
    'Yoh, you here again 💀', 'Heita mbokodo 👋', 'Hosh, chommie 👋',
    'Uyaphila, mfo? 👋', 'Howzit — good to see you 👋',
  ],
  success: [
    'Lekker, sorted ✅', 'Yebo, done and dusted ✅', 'Sho, it is handled 💪',
    'Bakgat, that is how we do it 💪', 'Hundred percent, done ✅',
    'Moja, it went through ✅', 'Phanda, clean work 💪',
  ],
  fail: [
    'Eish, that did not go through 😕', 'Ag no man, it broke 💀',
    'Hayibo, no ways that worked 😭', 'Awu, something went stukkend',
    'Tjo, that one failed on me', 'No ways, try that again hey',
  ],
  wait: [
    'Sho, I am on it ⏳', 'Eish, this one is heavy ⏳',
    'Now now, I am getting there ⏳', 'Sho give me a mo, it is coming ⏳',
    'Working on it, shame it takes a minute ⏳',
  ],
  deny: [
    'Ag no, that one is not for you 💀', 'Nah, this is owner-only, sorry',
    'Hayi, you cannot do that boet', 'Not on KAMI\'s watch, no ways 💀',
    'Ai, you need a higher rank for that',
  ],
  usage: [
    'Sho, this is how you use it 👇', 'Eish, look at the usage below 👇',
    'Here is how, hey 👇', 'Ja-nee, check the pattern below 👇',
  ],
  notFound: [
    'Eish, nothing here hey 😕', 'Sho, no results, shame',
    'Hayibo, that one comes up empty', 'No ways, I cannot find that',
  ],
  thanks: [
    'Enkosi, appreciate it 🙏', 'Ke a leboha! 🙏', 'Sho, thanks shame 🙏',
    'Dankie san 🙏', 'Solid, thanks bru 🙏',
  ],
  bye: [
    'Sala kahle, chommie 👋', 'Later hey 👋', 'Hamba kahle 👋',
    'Sho, catch you later 👋', 'Totsiens 👋', 'Enkosi, bye 👋',
  ],
  hype: [
    'NGEKE KE! 🔥', 'Lekker gents! 🎉', 'Yebo shame! 🥳',
    'Bakgat! 💯', 'Hundred percent! 💯', 'Phanda! 🔥',
    'Kwaai moves! 👏', 'Moja! 🎊',
  ],
  sympathy: [
    'Ag shame, that is heavy 😔', 'Eish, sorry about that 😢',
    'Shame man, take it easy 💪', 'Bathong, that is not nice 😔',
    'Ai, yoh shame, I feel you 💔',
  ],
  dismiss: [
    'Nah, not happening 💀', 'Ag no, try again laaitie 💀',
    'Yoh, nice try tho 😭', 'Sho... anyway 💀',
    'No ways, not on this bot 💀', 'Zero aura points for that attempt 😭',
  ],
  tease: [
    'Wena, you really tried 😭', 'Caught in 4k my guy 💀',
    'You thought hey 💀', 'Yoh, the audacity 💀',
    'Not you trying that 💀', 'Ag shame, the boldness 😭',
    'And you thought we would not notice 😭',
  ],
  warn: [
    'One more time and see what happens 💀', 'Push your luck why do not you 😭',
    'Yoh, you are on thin ice laaitie 💀', 'Test KAMI and find out 😭',
    'Not twice hey, once was enough 😭', 'Keep that energy and see 💀',
  ],
  protected: [
    'Sorted lekke ✅', 'Handled, do not worry about it 💪',
    'KAMI\'s people stay protected 🔒', 'Caught and dealt with 📸',
    'Yebo, that is how we do it 💪', 'Handled with the quickness 💪',
  ],
  confused: [
    'Bathong, what just happened 💀', 'Yoh, I am confused 😭',
    'Wait... what? 💀', 'Hayibo, seriously? 😭',
    'Eish, that does not add up 💀', 'Mos... what is going on here 😭',
  ],
};

// ─── Speech-act inference from a message header ─────────────────────────────

const actOf = (text = '') => {
  const t = String(text);
  if (/❌|\bERROR\b|\bfailed?\b|\bcouldn'?t\b|\bwon'?t\b|\bno (results|access|profile|upcoming|stored|users|media|events)\b/i.test(t)) return 'err';
  if (/✅|\bSUCCESS\b|\bturned ON\b|\bsorted\b|\bdone\b|\bexempted\b|\bset\b/i.test(t)) return 'ok';
  if (/⚠️|\bWARNING\b/i.test(t)) return 'warn';
  return 'neutral';
};

const tagKindFor = (act) => (act === 'ok' ? 'affirm' : act === 'err' ? 'err' : act === 'warn' ? 'soften' : 'neutral');

// ─── Public API ─────────────────────────────────────────────────────────────

const voice = {
  /** clause-initial opener for a failure line: `❌ _Eish — couldn't add them_` */
  openErr: () => pick(OPEN_ERR),

  /** clause-initial opener for a neutral/informational line */
  open: () => pick(OPEN_INFO),

  /** clause-initial opener for a warning */
  openWarn: () => pick(OPEN_WARN),

  /** greeting opener */
  greetOpen: () => pick(OPEN_GREET),

  /**
   * sentence-final tag.
   * kind: 'affirm' | 'neutral' | 'err' | 'hype' | 'soften'
   * Auto-picks from the surrounding message when kind is omitted.
   */
  tag: (kind, context = '') => {
    const k = kind || tagKindFor(actOf(context));
    if (k === 'affirm') return pick(TAG_AFFIRM);
    if (k === 'err') return pick(TAG_ERR);
    if (k === 'hype') return pick(TAG_HYPE);
    if (k === 'soften') return pick(TAG_SOFTEN);
    return pick(TAG_NEUTRAL);
  },

  /**
   * sentence-initial particle (the slot begins the line).
   * kind: 'affirm' | 'neutral' | 'hype'
   */
  lead: (kind = 'neutral') => {
    if (kind === 'affirm') return pick(LEAD_AFFIRM);
    if (kind === 'hype') return pick(LEAD_HYPE);
    return pick(LEAD_NEUTRAL);
  },

  /** whole-message reaction, no surrounding sentence */
  react: (kind = 'ok') => {
    if (kind === 'fail') return pick(REACT_FAIL);
    if (kind === 'dunno') return pick(REACT_DUNNO);
    return pick(REACT_OK);
  },

  /** term of address */
  addr: () => pick(ADDR),

  /** age/gender-neutral term of address — safe for strangers */
  mate: () => pick(ADDR_SAFE),

  /** complete natural line for a speech act */
  say: (act) => pick(SAY[act] || SAY.neutral || REACT_OK),

  /**
   * Compose a natural single line: opener + exact body + tag.
   * Keeps `body` byte-identical (links, numbers, @mentions stay exact).
   */
  line: (act, body) => {
    const a = actOf(body);
    if (a === 'err') return `${pick(OPEN_ERR)} — ${body}, ${pick(TAG_ERR)}`;
    if (a === 'ok') return `${pick(OPEN_INFO)}, ${body}, ${pick(TAG_AFFIRM)}`;
    return `${pick(OPEN_INFO)} — ${body}, ${pick(TAG_NEUTRAL)}`;
  },

  /** greeting (whole line) */
  hi: () => pick(SAY.greeting),
  /** sign-off (whole line) */
  bye: () => pick(SAY.bye),
  /** success line */
  ok: () => pick(SAY.success),
  /** failure line */
  bad: () => pick(SAY.fail),
  /** waiting line */
  wait: () => pick(SAY.wait),
  /** hype line */
  hype: () => pick(SAY.hype),

  /** speech-act classifier, exported so call sites can branch on it */
  act: actOf,
};

// ─── Legacy shape (kept so nothing breaks mid-migration) ────────────────────
// NOTE: every value here is now a natural, position-correct chunk — but the
// old dict mixed leading/trailing slots. Call sites are being migrated to
// voice.* so this object will shrink and eventually go away.

const SLANG = {
  greeting: OPEN_GREET,
  good: TAG_AFFIRM,
  friend: ADDR,
  error: OPEN_ERR,
  intensifier: ['lank', 'lekker', 'phanda', 'yoh', 'ngeke ke', 'honestly'],
  yes: ['Yebo', 'Sho', 'Aweh', 'Ja-nee', 'Ybo', 'Ngo'],
  no: ['Hayi', 'Nah', 'Awu', 'No ways', 'Haye', 'Hayibo'],
  thanks: ['Enkosi', 'Ke a leboha', 'Dankie san', 'Sho lekke', 'Ncawe'],
  bye: ['Sala kahle', 'Later hey', 'Hamba kahle', 'Shiya gentleman', 'Totsiens'],
  vibe: TAG_NEUTRAL,
  roast: SAY.tease,
  dismiss: SAY.dismiss,
  protected: SAY.protected,
  warning: SAY.warn,
  hype: SAY.hype,
  confused: SAY.confused,
  sad: SAY.sympathy,
};

module.exports = {
  voice,
  SLANG,
  pick,
  // raw banks (exposed for audits/tests)
  banks: {
    OPEN_ERR, OPEN_INFO, OPEN_WARN, OPEN_GREET,
    TAG_AFFIRM, TAG_NEUTRAL, TAG_ERR, TAG_HYPE, TAG_SOFTEN,
    LEAD_AFFIRM, LEAD_NEUTRAL, LEAD_HYPE,
    REACT_OK, REACT_FAIL, REACT_DUNNO, ADDR, ADDR_SAFE, SAY,
  },
  LEX,
};
