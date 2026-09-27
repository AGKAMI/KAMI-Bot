/**
 * KAMI Bot — South African lexicon (research-backed)
 *
 * Word/phrase level data only. Phrase banks + helpers live in utils/slang.js.
 *
 * Sources consulted:
 *  - DSAE (Dictionary of South African English) — 'hey' tag, 'shame', 'mos'
 *  - Huddlestone & Fairhurst 2013, Stellenbosch Papers in Linguistics 42 — 'shame' as pragmatic marker
 *  - Degruyter "Eish, it's getting really interesting" (2024) — clause positions of eish/yho/tjo/sho/hayi/hau/mxm
 *  - Gunnink, Sowetan tsotsitaal (SALAS) / Mesthrie, tsotsitaals (JPCL) / Hurst & Mesthrie 'stylect'
 *  - Wikipedia: List of South African slang words / SAE regionalisms / Tsotsitaal
 *  - capecolouredculture.co.za Kaaps dictionary, colourdots.co.za, capetownmagazine.com
 *  - loxionlifestlye 'Kasi Lingo 101', news24 2025 teen slang
 *
 * HARD RULES (from project + research):
 *  - never: mampara, naai, gashu, sharp (as closer) — project bans
 *  - never: slurs, sexual anatomy, 'voetsek', 'moer/bliksem/donner', 'sybau' — too rude
 *  - 'mxm' (kiss-teeth) is corpus-proven NON-initial — never start a line with it
 *  - 'eish/yho/tjo/sho/hayi/hau' are corpus-proven clause-INITIAL — never hang them at the end
 *  - 'shame' is warmth/solidarity in SA, never sarcasm
 */

/**
 * Register/region tags:
 *  all    = safe everywhere in SA
 *  joburg = kasi/tsotsitaal/iscaMtho (Soweto, Tembisa, Reef)
 *  cpt    = Kaaps / Cape Flats
 *  durban = SAIE / isiTsotsi (KZN)
 *  afk    = Afrikaans-leaning, reads fine in the Cape/Western Transvaal
 *  urban  = young/online SA (cross-provincial)
 *
 * pos (natural slot in a sentence):
 *  open   = clause-initial interjection (corpus-verified position)
 *  tag    = sentence-final tag
 *  mid    = inserted mid-clause
 *  addr   = term of address
 *  adj    = predicate adjective / stand-alone exclamation
 *  line   = already a complete utterance
 */

const LEX = [
  // ── Clause-initial interjections (NEVER move to the end) ──────────────────
  { w: 'Eish', pos: 'open', reg: ['all'], mean: 'resignation, frustration, sympathy', ex: 'Eish, loadshedding again.' },
  { w: 'Ag no man', pos: 'open', reg: ['all', 'afk'], mean: 'irritation at something going wrong', ex: 'Ag no man, the taxi is late!' },
  { w: 'Ag shame', pos: 'open', reg: ['all', 'afk'], mean: 'warmth / pity / solidarity', ex: 'Ag shame, you worked all day?' },
  { w: 'Hayibo', pos: 'open', reg: ['all'], mean: 'disbelief, disapproval', ex: 'Hayibo, you ghosted me?' },
  { w: 'Awu', pos: 'open', reg: ['joburg'], mean: 'mild dismay', ex: 'Awu, that one stung.' },
  { w: 'Yoh', pos: 'open', reg: ['all'], mean: 'surprise, shock, emphasis', ex: 'Yoh, you gave me a fright!' },
  { w: 'Tjo', pos: 'open', reg: ['all'], mean: 'surprise, respect', ex: 'Tjo, that was a goal.' },
  { w: 'Sjoe', pos: 'open', reg: ['all'], mean: 'amazement, heavy feeling', ex: 'Sjoe, that water bill!' },
  { w: 'Bathong', pos: 'open', reg: ['joburg'], mean: 'really? come on', ex: 'Bathong, not again.' },
  { w: 'Jissie', pos: 'open', reg: ['all'], mean: 'startled surprise', ex: 'Jissie, you scared me.' },
  { w: 'No ways', pos: 'open', reg: ['all'], mean: 'no chance, disbelief', ex: 'No ways, not today.' },
  { w: 'Jirre', pos: 'open', reg: ['afk', 'cpt'], mean: 'gosh, damn', ex: 'Jirre, that is hot.' },
  { w: 'Jo', pos: 'open', reg: ['all'], mean: 'exclamation', ex: 'Jo, that was rude.' },
  { w: 'Ai', pos: 'open', reg: ['all'], mean: 'resignation, sympathy', ex: 'Ai, shame, hey.' },
  { w: 'Neh', pos: 'open', reg: ['all'], mean: 'surprise, checking you heard', ex: 'Neh? Lekke djy.' },
  { w: 'Hosh', pos: 'open', reg: ['joburg', 'urban'], mean: 'greeting / hello', ex: 'Hosh, my bru!' },
  { w: 'Heita', pos: 'open', reg: ['joburg'], mean: 'hello / hi', ex: 'Heita mbokodo!' },
  { w: 'Howzit', pos: 'open', reg: ['all'], mean: 'hello (not really a question)', ex: 'Howzit, chommie.' },
  { w: 'Aweh', pos: 'open', reg: ['all', 'cpt'], mean: 'hello / yes / cool / goodbye', ex: 'Aweh, my bru.' },
  { w: 'Sho', pos: 'open', reg: ['all'], mean: 'acknowledged, ok, hey there', ex: 'Sho, I hear you.' },
  { w: 'Ja-nee', pos: 'open', reg: ['all', 'afk'], mean: 'indeed / well then', ex: 'Ja-nee, that is how it is.' },
  { w: 'Yebo', pos: 'open', reg: ['all'], mean: 'yes', ex: 'Yebo, let us go.' },
  { w: 'Uyaphila', pos: 'open', reg: ['joburg'], mean: 'you good? (kasi greeting)', ex: 'Uyaphila, mfo?' },

  // ── Sentence-final tags (corpus: 'hey' softens, seeks agreement) ──────────
  { w: 'hey', pos: 'tag', reg: ['all'], mean: 'softens, asks agreement — THE SAE tag', ex: 'It is cold, hey?' },
  { w: 'man', pos: 'tag', reg: ['all'], mean: 'mate, emphasis, warmth', ex: 'Shame, man, that is hectic.' },
  { w: 'ne', pos: 'tag', reg: ['all', 'afk'], mean: 'isn\'t it / you know', ex: 'You like tea, ne?' },
  { w: 'mos', pos: 'tag', reg: ['all', 'afk'], mean: 'obviously / after all / of course', ex: 'It is lekker mos.' },
  { w: 'shame', pos: 'tag', reg: ['all'], mean: 'solidarity, sympathy, endearment', ex: 'No events, shame.' },
  { w: 'ek sê', pos: 'tag', reg: ['cpt', 'afk'], mean: 'I tell you — start OR end of statement', ex: 'Antitag is on, ek sê.' },
  { w: 'boet', pos: 'tag', reg: ['all', 'afk'], mean: 'bro, friendly address', ex: 'Tag someone, boet.' },
  { w: 'nje', pos: 'mid', reg: ['joburg'], mean: 'just / focus / you know', ex: 'It is just broken nje.' },
  { w: 'vaina', pos: 'tag', reg: ['joburg'], mean: 'right? (isiZulu tag)', ex: 'It is done, vaina?' },
  { w: 'he', pos: 'tag', reg: ['cpt', 'durban'], mean: 'huh? (question tag)', ex: 'Wait, he?' },
  { w: 'word', pos: 'tag', reg: ['joburg', 'urban'], mean: 'agreed / sorted', ex: 'Done, word.' },
  { w: '100', pos: 'tag', reg: ['urban'], mean: 'agreed, for real', ex: 'That is the one, 100.' },
  { w: 'salute', pos: 'tag', reg: ['urban'], mean: 'respect, thanks, bye', ex: 'Good lookin out, salute.' },
  { w: 'sure', pos: 'tag', reg: ['all'], mean: 'ok then', ex: 'Later, sure.' },

  // ── Predicate adjectives / stand-alone approval ──────────────────────────
  { w: 'lekke', pos: 'adj', reg: ['all'], mean: 'great, nice, good', ex: 'The braai was lekker.' },
  { w: 'kiff', pos: 'adj', reg: ['all'], mean: 'cool, wicked', ex: 'That move was kiff.' },
  { w: 'kwaai', pos: 'adj', reg: ['joburg'], mean: 'cool, excellent', ex: 'Kwaai moves!' },
  { w: 'ngeke', pos: 'adj', reg: ['joburg'], mean: 'no ways! (impressed)', ex: 'Ngeke ke!' },
  { w: 'phanda', pos: 'adj', reg: ['joburg'], mean: 'proper, for real', ex: 'Phanda, that is how.' },
  { w: 'bakgat', pos: 'adj', reg: ['afk', 'cpt'], mean: 'well done, brilliant', ex: 'Bakgat, ou!' },
  { w: 'moja', pos: 'adj', reg: ['joburg'], mean: 'nice, good (tsotsitaal)', ex: 'Moja, my bru.' },
  { w: 'nca', pos: 'adj', reg: ['all'], mean: 'lekker squared — best', ex: 'Nca, that is the one.' },
  { w: 'ayoba', pos: 'adj', reg: ['all', 'urban'], mean: 'cooler than cool', ex: 'Ayoba, my china!' },
  { w: 'duidelik', pos: 'adj', reg: ['cpt'], mean: 'cool, clear, awesome (Kaaps)', ex: 'Duidelik, let us go.' },
  { w: 'hundreds', pos: 'adj', reg: ['all'], mean: 'all good, agreed (repetition required)', ex: 'Everything is hundreds, bru.' },
  { w: 'solid', pos: 'adj', reg: ['all', 'urban'], mean: 'good, reliable', ex: 'Solid, thanks bru.' },
  { w: 'oke shem', pos: 'adj', reg: ['joburg'], mean: 'respectable, proper guy', ex: 'Oke shem, he delivered.' },
  { w: 'stukkend', pos: 'adj', reg: ['all', 'afk'], mean: 'broken / (praise) insane', ex: 'The bot went stukkend.' },
  { w: 'gatvol', pos: 'adj', reg: ['all', 'afk'], mean: 'fed up', ex: 'I am gatvol of this queue.' },

  // ── Terms of address ─────────────────────────────────────────────────────
  { w: 'my bru', pos: 'addr', reg: ['all'], mean: 'my bro (warm, safe)', ex: 'Howzit, my bru.' },
  { w: 'chommie', pos: 'addr', reg: ['all'], mean: 'friend', ex: 'Chommie, come here.' },
  { w: 'china', pos: 'addr', reg: ['all'], mean: 'mate (cockney rhyme: china plate = best mate)', ex: 'My china, you saved me.' },
  { w: 'laaitie', pos: 'addr', reg: ['all'], mean: 'young guy', ex: 'Careful, laaitie.' },
  { w: 'boet', pos: 'addr', reg: ['all', 'afk'], mean: 'brother', ex: 'Nice one, boet.' },
  { w: 'bra', pos: 'addr', reg: ['all'], mean: 'bro', ex: 'Bra, that is wild.' },
  { w: 'sisi', pos: 'addr', reg: ['all'], mean: 'sister (young woman)', ex: 'Aweh, sisi.' },
  { w: 'mbokodo', pos: 'addr', reg: ['joburg'], mean: 'rock — strong woman', ex: 'Sho, mbokodo.' },
  { w: 'baba', pos: 'addr', reg: ['all'], mean: 'father — respectful / playful', ex: 'Eish, baba.' },
  { w: 'makhulu', pos: 'addr', reg: ['all'], mean: 'gog / elder', ex: 'Sharp, makhulu.' },
  { w: 'mfo', pos: 'addr', reg: ['joburg'], mean: 'dude (isiZulu)', ex: 'Yoh, mfo.' },
  { w: 'gents', pos: 'addr', reg: ['all'], mean: 'guys', ex: 'Le sante, gents.' },
  { w: 'ou', pos: 'addr', reg: ['all', 'afk'], mean: 'guy, bloke', ex: 'This ou is sharp.' },
  { w: 'oom', pos: 'addr', reg: ['all', 'afk'], mean: 'uncle — older man', ex: 'Thanks, oom.' },
  { w: 'antie', pos: 'addr', reg: ['all'], mean: 'auntie — older woman', ex: 'Sorry, antie.' },

  // ── Sentence-medial particles ────────────────────────────────────────────
  { w: 'yazi', pos: 'mid', reg: ['joburg'], mean: 'you know (isiZulu)', ex: 'It is broken, yazi.' },
  { w: 'manje', pos: 'mid', reg: ['joburg'], mean: 'now / so', ex: 'I cannot, manje.' },
  { w: 'kanti', pos: 'mid', reg: ['joburg'], mean: 'but / so it turns out', ex: 'Kanti it was off already.' },
  { w: 'mara', pos: 'mid', reg: ['joburg'], mean: 'but / though', ex: 'It works, mara slowly.' },
  { w: 'vele', pos: 'mid', reg: ['joburg'], mean: 'of course / indeed', ex: 'Vele, you knew.' },
  { w: 'mxm', pos: 'mid', reg: ['all'], mean: 'kiss-teeth — annoyance (NON-initial only)', ex: 'That queue, mxm.' },

  // ── Complete utterances worth reusing verbatim ───────────────────────────
  { w: 'dala what you must', pos: 'line', reg: ['all'], mean: 'do what you have to do', ex: 'Bad spot — dala what you must.' },
  { w: 'by fire by force', pos: 'line', reg: ['all'], mean: 'doing it regardless', ex: 'We going by fire by force.' },
  { w: 'now now', pos: 'line', reg: ['all'], mean: 'in a few minutes', ex: 'I am coming now now.' },
  { w: 'just now', pos: 'line', reg: ['all'], mean: 'hours from now (NOT right away)', ex: 'I will sort it just now.' },
  { w: 'ja well no fine', pos: 'line', reg: ['all'], mean: 'shrug, it is what it is', ex: 'Ja well no fine.' },
  { w: 'same WhatsApp group', pos: 'line', reg: ['all'], mean: 'two things alike', ex: 'Those two are the same WhatsApp group.' },
  { w: 'not make sure', pos: 'line', reg: ['all'], mean: 'not convincing, not it', ex: 'That answer is not make sure.' },
];

/**
 * Never use these. Kept as a checked list so nothing sneaks back in.
 */
const AVOID = [
  { w: 'mampara', why: 'project ban — too offensive' },
  { w: 'naai', why: 'project ban — too aggressive' },
  { w: 'sharp', why: 'project ban — rejected as a closer' },
  { w: 'gashu', why: 'project ban — confusing across regions' },
  { w: 'voetsek', why: 'rude, used to chase dogs' },
  { w: 'sybau', why: 'rude — 2025 net-slang, avoid' },
  { w: 'moer', why: 'assault profanity' },
  { w: 'bliksem', why: 'assault profanity' },
  { w: 'donner', why: 'assault profanity' },
  { w: 'doos', why: 'close to a slur' },
  { w: 'poes', why: 'strongest profanity' },
  { w: 'kaffer', why: 'racial slur — never' },
  { w: 'goffel', why: 'insults women' },
  { w: 'moffie', why: 'derogatory' },
  { w: 'bergie', why: 'mocks homeless people' },
  { w: 'wena', why: 'only as a friendly address with a name, never alone as "you!"' },
  { w: 'mxm', why: 'ok, but never sentence-initial (corpus)' },
];

// Indexes used by utils/slang.js
const byPos = (pos) => LEX.filter((e) => e.pos === pos && e.reg.includes('all'));
const byReg = (reg) => LEX.filter((e) => e.reg.includes(reg));

module.exports = { LEX, AVOID, byPos, byReg };
