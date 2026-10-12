/**
 * CPM (Car Parking Multiplayer) domain constants for the event-card wizard.
 * Data-only module — NO name/subName exports so the crew.js auto-loader
 * and commandLoader both skip it as a command (questionPools.js precedent).
 *
 * SERVERS: the in-game server list, A–Z, each { key, flag, name } — flags
 * for language-named servers are deliberate choices, never derived:
 *   Arabic→🇸🇦, English→🇬🇧, Basque/Catalan→🇪🇸, Afrikaans→🇿🇦,
 *   Serbo-Croatian→🇷🇸, Other→❓ (no ZWJ question-flag exists).
 * Keys are canonical uppercase text — flags/labels can be tweaked here
 * without corrupting stored event records (records store keys, not glyphs).
 */

const SERVERS = [
  { key: 'AFRIKAANS',      flag: '🇿🇦', name: 'AFRIKAANS' },
  { key: 'ALBANIAN',       flag: '🇦🇱', name: 'ALBANIAN' },
  { key: 'ALGERIAN',       flag: '🇩🇿', name: 'ALGERIAN' },
  { key: 'ARABIC',         flag: '🇸🇦', name: 'ARABIC' },
  { key: 'ARGENTINIAN',    flag: '🇦🇷', name: 'ARGENTINIAN' },
  { key: 'ARMENIAN',       flag: '🇦🇲', name: 'ARMENIAN' },
  { key: 'AUSTRALIAN',     flag: '🇦🇺', name: 'AUSTRALIAN' },
  { key: 'AZERBAIJANI',    flag: '🇦🇿', name: 'AZERBAIJANI' },
  { key: 'BANGLADESHI',    flag: '🇧🇩', name: 'BANGLADESHI' },
  { key: 'BASQUE',         flag: '🇪🇸', name: 'BASQUE' },
  { key: 'BELARUSIAN',     flag: '🇧🇾', name: 'BELARUSIAN' },
  { key: 'BELGIAN',        flag: '🇧🇪', name: 'BELGIAN' },
  { key: 'BOSNIAN',        flag: '🇧🇦', name: 'BOSNIAN' },
  { key: 'BRAZILIAN',      flag: '🇧🇷', name: 'BRAZILIAN' },
  { key: 'BULGARIAN',      flag: '🇧🇬', name: 'BULGARIAN' },
  { key: 'CAMBODIAN',      flag: '🇰🇭', name: 'CAMBODIAN' },
  { key: 'CANADIAN',       flag: '🇨🇦', name: 'CANADIAN' },
  { key: 'CATALAN',        flag: '🇪🇸', name: 'CATALAN' },
  { key: 'CHILEAN',        flag: '🇨🇱', name: 'CHILEAN' },
  { key: 'CHINESE',        flag: '🇨🇳', name: 'CHINESE' },
  { key: 'COLOMBIAN',      flag: '🇨🇴', name: 'COLOMBIAN' },
  { key: 'CROATIAN',       flag: '🇭🇷', name: 'CROATIAN' },
  { key: 'CZECH',          flag: '🇨🇿', name: 'CZECH' },
  { key: 'DANISH',         flag: '🇩🇰', name: 'DANISH' },
  { key: 'DUTCH',          flag: '🇳🇱', name: 'DUTCH' },
  { key: 'ECUADORIAN',     flag: '🇪🇨', name: 'ECUADORIAN' },
  { key: 'EGYPTIAN',       flag: '🇪🇬', name: 'EGYPTIAN' },
  { key: 'ENGLISH',        flag: '🇬🇧', name: 'ENGLISH' },
  { key: 'ESTONIAN',       flag: '🇪🇪', name: 'ESTONIAN' },
  { key: 'FAROESE',        flag: '🇫🇴', name: 'FAROESE' },
  { key: 'FINNISH',        flag: '🇫🇮', name: 'FINNISH' },
  { key: 'FRENCH',         flag: '🇫🇷', name: 'FRENCH' },
  { key: 'GEORGIAN',       flag: '🇬🇪', name: 'GEORGIAN' },
  { key: 'GERMAN',         flag: '🇩🇪', name: 'GERMAN' },
  { key: 'GREEK',          flag: '🇬🇷', name: 'GREEK' },
  { key: 'HEBREW',         flag: '🇮🇱', name: 'HEBREW' },
  { key: 'HUNGARIAN',      flag: '🇭🇺', name: 'HUNGARIAN' },
  { key: 'ICELANDIC',      flag: '🇮🇸', name: 'ICELANDIC' },
  { key: 'INDIAN',         flag: '🇮🇳', name: 'INDIAN' },
  { key: 'INDONESIAN',     flag: '🇮🇩', name: 'INDONESIAN' },
  { key: 'IRANIAN',        flag: '🇮🇷', name: 'IRANIAN' },
  { key: 'IRAQI',          flag: '🇮🇶', name: 'IRAQI' },
  { key: 'IRISH',          flag: '🇮🇪', name: 'IRISH' },
  { key: 'ITALIAN',        flag: '🇮🇹', name: 'ITALIAN' },
  { key: 'JAMAICAN',       flag: '🇯🇲', name: 'JAMAICAN' },
  { key: 'JORDANIAN',      flag: '🇯🇴', name: 'JORDANIAN' },
  { key: 'KAZAKH',         flag: '🇰🇿', name: 'KAZAKH' },
  { key: 'KOREAN',         flag: '🇰🇷', name: 'KOREAN' },
  { key: 'KUWAITI',        flag: '🇰🇼', name: 'KUWAITI' },
  { key: 'KYRGYZ',         flag: '🇰🇬', name: 'KYRGYZ' },
  { key: 'LATVIAN',        flag: '🇱🇻', name: 'LATVIAN' },
  { key: 'LEBANESE',       flag: '🇱🇧', name: 'LEBANESE' },
  { key: 'LITHUANIAN',     flag: '🇱🇹', name: 'LITHUANIAN' },
  { key: 'MALAY',          flag: '🇲🇾', name: 'MALAY' },
  { key: 'MEXICAN',        flag: '🇲🇽', name: 'MEXICAN' },
  { key: 'MONGOLIAN',      flag: '🇲🇳', name: 'MONGOLIAN' },
  { key: 'MOROCCAN',       flag: '🇲🇦', name: 'MOROCCAN' },
  { key: 'NIGERIAN',       flag: '🇳🇬', name: 'NIGERIAN' },
  { key: 'NORWEGIAN',      flag: '🇳🇴', name: 'NORWEGIAN' },
  { key: 'PAKISTANI',      flag: '🇵🇰', name: 'PAKISTANI' },
  { key: 'FILIPINO',       flag: '🇵🇭', name: 'FILIPINO' },
  { key: 'POLISH',         flag: '🇵🇱', name: 'POLISH' },
  { key: 'PORTUGUESE',     flag: '🇵🇹', name: 'PORTUGUESE' },
  { key: 'QATARI',         flag: '🇶🇦', name: 'QATARI' },
  { key: 'ROMANIAN',       flag: '🇷🇴', name: 'ROMANIAN' },
  { key: 'RUSSIAN',        flag: '🇷🇺', name: 'RUSSIAN' },
  { key: 'SERBO-CROATIAN', flag: '🇷🇸', name: 'SERBO-CROATIAN' },
  { key: 'SINGAPOREAN',    flag: '🇸🇬', name: 'SINGAPOREAN' },
  { key: 'SLOVAK',         flag: '🇸🇰', name: 'SLOVAK' },
  { key: 'SLOVENIAN',      flag: '🇸🇮', name: 'SLOVENIAN' },
  { key: 'SPANISH',        flag: '🇪🇸', name: 'SPANISH' },
  { key: 'SWEDISH',        flag: '🇸🇪', name: 'SWEDISH' },
  { key: 'SWISS',          flag: '🇨🇭', name: 'SWISS' },
  { key: 'TAJIK',          flag: '🇹🇯', name: 'TAJIK' },
  { key: 'THAI',           flag: '🇹🇭', name: 'THAI' },
  { key: 'TUNISIAN',       flag: '🇹🇳', name: 'TUNISIAN' },
  { key: 'TURKISH',        flag: '🇹🇷', name: 'TURKISH' },
  { key: 'TURKMEN',        flag: '🇹🇲', name: 'TURKMEN' },
  { key: 'UKRAINIAN',      flag: '🇺🇦', name: 'UKRAINIAN' },
  { key: 'UZBEK',          flag: '🇺🇿', name: 'UZBEK' },
  { key: 'VIETNAMESE',     flag: '🇻🇳', name: 'VIETNAMESE' },
  { key: 'ZIMBABWEAN',     flag: '🇿🇼', name: 'ZIMBABWEAN' },
  { key: 'OTHER',          flag: '❓', name: 'OTHER' },
];

// Server picker layout: AFRIKAANS pinned page 1 slot 1 (home server —
// 90% of meets), then A–Z pages of 7, OTHER riding at the end of the
// last page. 7 rows + Prev + Next + Cancel = 10 buttons max, so the
// buttonHelper slice(0,10) can never drop navigation.
const PAGE_SIZE = 7;

function buildServerPages() {
  const [home, ...rest] = SERVERS.filter(s => s.key !== 'OTHER');
  const other = SERVERS.find(s => s.key === 'OTHER');
  const list = [home, ...rest, other]; // home first, OTHER last
  const pages = [];
  for (let i = 0; i < list.length; i += PAGE_SIZE) {
    pages.push(list.slice(i, i + PAGE_SIZE));
  }
  return pages;
}

function serverByKey(key) {
  return SERVERS.find(s => s.key === key) || null;
}

// ── Title templates ─────────────────────────────────────────
// Each template seeds the CAR TYPE step with its own presets.
// Ordered array drives the title buttons (7 + Custom + Cancel = 9).
const TEMPLATES = [
  { key: 'STANCE',   label: 'Stance Meet',    emoji: '🏁', carOptions: ['Any Stance Car', 'JDM only', 'Euro only', 'Static only', 'Bagged only'] },
  { key: 'COLOUR',   label: 'Colour Meet',    emoji: '🎨', carOptions: ['Pink cars only', 'Red only', 'Blue only', 'White only', 'Black only', 'Neon/glow only', 'Any colour'] },
  { key: 'BMW',      label: 'BMW Meet',       emoji: '🔵', carOptions: ['BMW only', 'M-Power only', 'Alpina only'] },
  { key: 'MERCEDES', label: 'Mercedes Meet',  emoji: '⭐', carOptions: ['Mercedes only', 'AMG only'] },
  { key: 'HONDA',    label: 'Honda Meet',     emoji: '🚗', carOptions: ['Honda only', 'Type R only'] },
  { key: 'LUXURY',   label: 'Luxury Meet',    emoji: '💎', carOptions: ['Luxury cars only', 'VIP style only'] },
  { key: 'SUPERCAR', label: 'Supercar Meet',  emoji: '🚀', carOptions: ['Supercars only', 'Hypercars only', 'Track builds only'] },
];

// Custom-title meets get the owner's named brand set
const DEFAULT_CAR_OPTIONS = ['BMW only', 'Mercedes only', 'Audi only', 'VW only', 'Any Stance Car'];

function templateByKey(key) {
  return TEMPLATES.find(t => t.key === key) || null;
}

// ── Validators ──────────────────────────────────────────────

/**
 * CPM player ID: accept the crew-tag shape (VR401128) AND plain numeric
 * in-game IDs (5–8 digits) — strip "id:" prefixes, spaces, dashes first.
 * Returns the normalized uppercase ID, or null when it's garbage.
 */
function normalizeCpmId(raw) {
  const cleaned = String(raw || '')
    .replace(/^id\s*[:\-]?\s*/i, '')
    .replace(/[\s\-_.]/g, '')
    .toUpperCase();
  if (!cleaned || cleaned.length > 12) return null;
  if (/^[A-Z]{0,3}\d{4,10}$/.test(cleaned)) return cleaned; // VR401128 / 401128
  if (/^[A-Z0-9]{4,12}$/.test(cleaned)) return cleaned;     // other game IDs
  return null;
}

/**
 * Free-text sanitizer for HOST / custom title / custom car type.
 * The card is sent fromMe so antitag/antibadword never scan it — this
 * function is the ONLY defense against injection: strips control + bidi
 * + zero-width chars, WhatsApp markdown, @-mention bait; collapses
 * whitespace; rejects blank/emoji-only; clamps length.
 */
function sanitizeEventText(raw, maxLen = 32) {
  let t = String(raw ?? '');
  t = t.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, ''); // control, zero-width, bidi
  t = t.replace(/[*_~`>#=]/g, '');      // WhatsApp markdown
  t = t.replace(/@/g, '');              // mention bait
  t = t.replace(/\s+/g, ' ').trim();
  if (!t || !/\p{L}|\p{N}/u.test(t)) return null; // blank / emoji-only
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

// 24-hour HH:MM — strict (rejects 99:99 and 23:60)
const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

module.exports = {
  SERVERS,
  TEMPLATES,
  DEFAULT_CAR_OPTIONS,
  PAGE_SIZE,
  buildServerPages,
  serverByKey,
  templateByKey,
  normalizeCpmId,
  sanitizeEventText,
  TIME_RE,
};
