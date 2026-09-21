/**
 * Shared Formatting Utilities for KAMI Bot
 * WhatsApp-compatible text formatting + tsotsitaal slang
 *
 * NOTE: NO box-drawing characters (╭━┐│ etc) — these render as broken ???? blocks
 * on Android WhatsApp. Use *BOLD* headers + ---------- separators + - bullets.
 */

const config = require('../config');

// ─── WhatsApp Formatting Helpers ──────────────────────────────────────────────

const bold = (text) => `*${text}*`;
const italic = (text) => `_${text}_`;
const strike = (text) => `~${text}~`;
const mono = (text) => '`' + text + '`';
const mention = (jid) => `@${jid.split('@')[0]}`;

// ─── Separators ───────────────────────────────────────────────────────────────

const SEP = '----------';

/** Horizontal rule / separator line */
const line = (width = 16) => SEP;

// ─── Structured Message Builders ──────────────────────────────────────────────

/**
 * Build a section with a header line, divider, and content lines
 */
const section = (header, lines = [], opts = {}) => {
  const { divider = true, footer = null } = opts;
  const parts = [];

  if (header) {
    parts.push(bold(header.toUpperCase()));
  }

  for (const lineItem of lines) {
    parts.push(lineItem);
  }

  if (divider) {
    parts.push(SEP);
  }

  if (footer) {
    parts.push(footer);
  }

  return parts.join('\n');
};

/**
 * Build a labeled field:  📝 *Label:* value
 */
const field = (emoji, label, value) => `${emoji} ${bold(`${label}:`)} ${value}`;

/**
 * Build a key-value pair without emoji
 */
const kv = (label, value) => `${bold(`${label}:`)} ${value}`;

// ─── Status Messages ──────────────────────────────────────────────────────────

const status = {
  wait: (msg = 'Loading...') => `⏳ ${bold(msg)}`,
  success: (msg = 'Done!') => `✅ ${bold(msg)}`,
  error: (msg = 'Something went wrong') => `❌ ${msg}`,
  warn: (msg) => `⚠️ ${msg}`,
  info: (msg) => `ℹ️ ${msg}`,
};

// ─── Tsotsitaal / Kasi Slang Dictionary ───────────────────────────────────────
// Safe, broadly recognised terms. Applied to bot casual messages.
// DO NOT use: sharp (Kermes rejected as closer), mampara (too offensive),
//             naai (too aggressive), gashu (confusing across regions)

const SLANG = {
  // Greetings
  greeting: ['howzit', 'aweh', 'heita', 'heita mbokodo', 'yoh wena'],

  // Positive feedback
  good: ['lekke', 'kiff', 'kwaai', 'scores', 'clocked it', 'sharp sharp'],

  // Addressing users
  friend: ['laaitie', 'my bru', 'wena', 'mbokodo', 'sisi', 'baba'],

  // Errors / negative
  error: ['moegoe', 'sleg', 'stukkend', 'yoh', 'haiibo', 'cima'],

  // Intensity
  intensifier: ['lank', 'lekker', 'phanda', 'yoh'],

  // General
  yes: ['yebo', 'yebo shame', 'sho', 'aweh'],
  no: ['awu', 'hayi', 'yoh nah', 'khona into e-off'],
  thanks: ['enkosi', 'ke a leboha', 'thanks shame', 'sho lekke'],
  bye: ['totsiens', 'later hey', 'shiya gentleman'],

  // Filler / vibe
  vibe: ['sho', 'yazi', 'manje', 'nje', 'bathong', 'mos'],

  // Protection / roast energy
  roast: [
    'yoh the audacity 💀',
    'not you trying that 💀',
    'shame man... cima 😭',
    'you thought hey 💀',
    'bathong the boldness 😭',
    'agine the nerve 💀',
    'hao khonahale bru 💀',
  ],

  // Dismissal energy
  dismiss: [
    'nah not happening 💀',
    'try again boet 💀',
    'yoh nice try tho 😭',
    'not today laaitie 💀',
    'wena you really tried 😭',
    'sho... anyway 💀',
    'cima man, cima 😭',
  ],

  // Protection success
  protected: [
    'sorted lekke ✅',
    'handled, don\'t worry about it 💪',
    'KAMI\'s people stay protected 🔒',
    'caught in 4k, handled 📸',
    'yebo, that\'s how we do it 💪',
  ],
};

/**
 * Pick a random item from an array
 */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Get a random greeting
 */
const greet = () => pick(SLANG.greeting);

/**
 * Get a random positive response
 */
const lekker = () => pick(SLANG.good);

/**
 * Get a random friend address
 */
const chommie = () => pick(SLANG.friend);

/**
 * Get a random casual closer
 */
const closer = () => pick(['sho', 'lekker', 'yazi']);

// ─── Pre-built Message Templates ──────────────────────────────────────────────

const templates = {
  /**
   * Bot header — used at top of most responses
   */
  botHeader: (title = 'KAMI BOT') => {
    return `${SEP}\n${bold(title.toUpperCase())}\n${SEP}`;
  },

  /**
   * Welcome message for new group members
   */
  welcome: (name, group, memberCount) => {
    return [
      SEP,
      bold('KAMI BOT'),
      SEP,
      '',
      `${bold(greet().toUpperCase())} @${name}! 👋`,
      '',
      `- 👤 ${bold('Welcome to')} ${group}`,
      `- 💀 ${bold('Member')} #${memberCount}`,
      `- ⏰ ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`,
      '',
      SEP,
      '',
      bold('RULES'),
      '- No spam',
      '- No illegal content',
      '- No toxic behavior',
      '',
      `_${pick(SLANG.greeting)}, you're in good hands_`,
    ].join('\n');
  },

  /**
   * Goodbye message for leaving members
   */
  goodbye: (name) => {
    return [
      `${bold('TOTSIENS')} @${name} 👋`,
      '',
      `${pick(SLANG.vibe)}, we'll miss you hey.`,
      `_Go well, chommie._`,
    ].join('\n');
  },

  /**
   * Error message with tsotsitaal flair
   */
  errorMsg: (detail = null) => {
    const base = `${pick(SLANG.error)} — something went stukkend`;
    return detail ? `${base}\n${italic(detail)}` : base;
  },

  /**
   * Permission denied
   */
  permDenied: (role = 'owner') => {
    return `${bold('NO ACCESS')} — this one's for the ${role} only`;
  },

  /**
   * Group-only command
   */
  groupOnly: () => {
    return `${bold('Group only')} — this needs to run in a group, ${pick(SLANG.vibe)}`;
  },

  /**
   * Admin-only command
   */
  adminOnly: () => {
    return `${bold('Admins only')} — you need to be an admin for this`;
  },
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Formatting
  bold, italic, strike, mono, mention,

  // Separators
  SEP, line,

  // Message builders
  section, field, kv, status,

  // Slang
  SLANG, pick, greet, lekker, chommie, closer,

  // Templates
  templates,
};