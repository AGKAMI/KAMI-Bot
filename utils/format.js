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
const mention = (jid) => {
  if (!jid) return '@unknown';
  return `@${String(jid).split(':')[0].split('@')[0]}`;
};

// ─── Separators ───────────────────────────────────────────────────────────────

const SEP = '----------';

/** Horizontal rule / separator line */
const line = (width = 16) => '-'.repeat(width);

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
  wait: (msg = 'One mo, loading...') => `⏳ ${bold(msg)}`,
  success: (msg = 'Done, lekke') => `✅ ${bold(msg)}`,
  error: (msg = 'Eish, something went stukkend') => `❌ ${msg}`,
  warn: (msg) => `⚠️ ${msg}`,
  info: (msg) => `ℹ️ ${msg}`,
};

// ─── South African voice ─────────────────────────────────────────────────────
// Lexicon + phrase banks + position-aware helpers live in utils/slang.js
// (and utils/slang-lex.js). Re-exported here so existing
// `const { SLANG, pick } = require('../../utils/format')` keeps working.

const { voice, SLANG, pick } = require('./slang');


/**
 * Get a random greeting
 */
const greet = () => voice.hi();

/**
 * Get a random positive response
 */
const lekker = () => voice.ok();

/**
 * Get a random friend address
 */
const chommie = () => voice.addr();

/**
 * Get a random casual closer
 */
const closer = () => voice.tag('neutral');

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
      `${bold(voice.greetOpen())} @${name}! 👋`,
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
      `_Sho, you are in good hands here_`,
    ].join('\n');
  },

  /**
   * Goodbye message for leaving members
   */
  goodbye: (name) => {
    return [
      `${bold('TOTSIENS')} @${name} 👋`,
      '',
      `_Sala kahle, we will miss you hey._`,
      `_Go well, ${voice.mate()}._`,
    ].join('\n');
  },

  /**
   * Error message in a natural SA voice
   */
  errorMsg: (detail = null) => {
    const base = `${voice.openErr()} — something went stukkend, ${voice.tag('err')}`;
    return detail ? `${base}\n${italic(detail)}` : base;
  },

  /**
   * Permission denied
   */
  permDenied: (role = 'owner') => {
    return `${bold('NO ACCESS')} — this one is for the ${role} only, ${voice.tag('err')}`;
  },

  /**
   * Group-only command
   */
  groupOnly: () => {
    return `${bold('Group only')} — this needs to run in a group, ${voice.tag('neutral')}`;
  },

  /**
   * Admin-only command
   */
  adminOnly: () => {
    return `${bold('Admins only')} — you need to be an admin for this one, ${voice.tag('neutral')}`;
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
  SLANG, pick, greet, lekker, chommie, closer, voice,

  // Templates
  templates,
};