/**
 * Owner Hub — interactive panels for the 4 owner toggles.
 *
 * Design (final-judge locked):
 * - Every handler gates itself via isOwnerJid (forged-tap security).
 * - Handlers DELEGATE to the real command execute() with a swallowed
 *   extra.reply — single source of truth for the actual mutation.
 * - Panels are re-rendered from live state after every action;
 *   confirmation lives in the panel header (F7: one tap = one message).
 * - dmblocker on/off mutates the DB directly (its execute() sends its
 *   own unswallowable sock messages) — approve/disapprove stay typed.
 * - Typed escape hatch in every panel body (render-time prefix, F6).
 */

const database = require('../../database');
const config = require('../../config');
const { sendButtons, onButton, requireOwner, isOwnerJid } = require('../../utils/buttonHelper');
const { load: loadAutoreact } = require('../../utils/autoReact');

// Owner-only for ALL owner:hub* ids (global gate in handleButtonResponse)
requireOwner('owner');

const anticallCmd = require('./anticall');
const modeCmd = require('./mode');
const autoreactCmd = require('./autoreact');

const MENU_BTN = { id: 'menu:back:main', text: '⬅️ Menu' };

function prefix() { return (config && config.prefix) || '.'; }

// config.js may have been rewritten + cache-busted by anticall/mode —
// always re-require so panels show post-action state
function freshConfig() {
  try { return require('../../config'); } catch (e) { return config; }
}

function swallowExtra(from, sender, isGroup) {
  return { reply: async () => {}, fail: () => {}, from, sender, isGroup, pushName: 'owner' };
}

// ── HUB ──────────────────────────────────────────────────────────────
async function renderHub(sock, msg, from, note) {
  const cfg = freshConfig();
  const ar = loadAutoreact();
  const dm = database.getGlobalSettings().selfMode ? 'ON' : 'OFF';
  const body =
    `${note ? note + '\n\n' : ''}` +
    `*OWNER HUB*\n\n` +
    `📵 Anticall: *${cfg.defaultGroupSettings && cfg.defaultGroupSettings.anticall ? 'ON' : 'OFF'}*\n` +
    `🎛️ Mode: *${cfg.selfMode ? 'PRIVATE' : 'PUBLIC'}*\n` +
    `❤️ Autoreact: *${ar.enabled ? 'ON' : 'OFF'}* (${ar.mode || 'bot'})\n` +
    ` DM Blocker: *${dm}*\n\n` +
    `_tap a toggle to open its panel_\n` +
    `_or type ${prefix()}help if you get stuck_`;
  await sendButtons(sock, from, {
    text: body,
    footer: cfg.botName || 'KAMI Bot',
    buttons: [
      { id: 'owner:hub:anticall', text: '📵 Anticall' },
      { id: 'owner:hub:mode', text: '🎛️ Mode' },
      { id: 'owner:hub:autoreact', text: '❤️ Autoreact' },
      { id: 'owner:hub:dmblocker', text: ' DM Blocker' },
      MENU_BTN,
    ],
  }, msg);
}

// ── ANTICALL ─────────────────────────────────────────────────────────
async function renderAnticall(sock, msg, from, note) {
  const cfg = freshConfig();
  await sendButtons(sock, from, {
    text:
      `${note ? note + '\n\n' : ''}` +
      `*📞 ANTICALL*\n\n` +
      `Status: *${cfg.defaultGroupSettings && cfg.defaultGroupSettings.anticall ? 'ON ✅' : 'OFF ❌'}*\n\n` +
      `calls get auto-rejected & blocked when on\n` +
      `_or type ${prefix()}help if you get stuck_`,
    footer: cfg.botName || 'KAMI Bot',
    buttons: [
      { id: 'owner:hub:anticall:on', text: '✅ On' },
      { id: 'owner:hub:anticall:off', text: '❌ Off' },
      { id: 'owner:hub', text: '⬅️ Back' },
    ],
  }, msg);
}

onButton('owner:hub:anticall:on', async (sock, msg, from, sender) => {
  const cfg = freshConfig();
  if (!isOwnerJid(msg, sender)) return;
  let note = '✅ _anticall set to ON_';
  try {
    await anticallCmd.execute(sock, msg, ['on'], swallowExtra(from, sender, from.endsWith('@g.us')));
  } catch (e) {
    console.error('[ownerHub] anticall on failed:', e.message);
    note = '❌ _couldn\u2019t update anticall — check logs_';
  }
  await renderAnticall(sock, msg, from, note);
});

onButton('owner:hub:anticall:off', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note = '❌ _anticall set to OFF_';
  try {
    await anticallCmd.execute(sock, msg, ['off'], swallowExtra(from, sender, from.endsWith('@g.us')));
  } catch (e) {
    console.error('[ownerHub] anticall off failed:', e.message);
    note = '❌ _couldn\u2019t update anticall — check logs_';
  }
  await renderAnticall(sock, msg, from, note);
});

onButton('owner:hub:anticall', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  await renderAnticall(sock, msg, from);
});

// ── MODE ─────────────────────────────────────────────────────────────
async function renderMode(sock, msg, from, note) {
  const cfg = freshConfig();
  const priv = !!cfg.selfMode;
  await sendButtons(sock, from, {
    text:
      `${note ? note + '\n\n' : ''}` +
      `*🤖 BOT MODE*\n\n` +
      `Mode: *${priv ? 'PRIVATE 🔒' : 'PUBLIC 🌐'}*\n` +
      `${priv ? 'Only owner and sudo can use commands' : 'Everyone can use commands'}\n\n` +
      `_or type ${prefix()}help if you get stuck_`,
    footer: cfg.botName || 'KAMI Bot',
    buttons: [
      { id: 'owner:hub:mode:private', text: '🔒 Private' },
      { id: 'owner:hub:mode:public', text: '🌐 Public' },
      { id: 'owner:hub', text: '⬅️ Back' },
    ],
  }, msg);
}

onButton('owner:hub:mode:private', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note = '🔒 _bot is PRIVATE now_';
  try {
    await modeCmd.execute(sock, msg, ['private'], swallowExtra(from, sender, from.endsWith('@g.us')));
  } catch (e) {
    console.error('[ownerHub] mode private failed:', e.message);
    note = '❌ _couldn\u2019t change mode — check logs_';
  }
  await renderMode(sock, msg, from, note);
});

onButton('owner:hub:mode:public', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note = '🌐 _bot is PUBLIC now_';
  try {
    await modeCmd.execute(sock, msg, ['public'], swallowExtra(from, sender, from.endsWith('@g.us')));
  } catch (e) {
    console.error('[ownerHub] mode public failed:', e.message);
    note = '❌ _couldn\u2019t change mode — check logs_';
  }
  await renderMode(sock, msg, from, note);
});

onButton('owner:hub:mode', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  await renderMode(sock, msg, from);
});

// ── AUTOREACT ────────────────────────────────────────────────────────
async function renderAutoreact(sock, msg, from, note) {
  const cfg = freshConfig();
  const ar = loadAutoreact();
  await sendButtons(sock, from, {
    text:
      `${note ? note + '\n\n' : ''}` +
      `*🤖 AUTO-REACT*\n\n` +
      `Status: *${ar.enabled ? 'ON ✅' : 'OFF ❌'}*\n` +
      `Mode: *${(ar.mode || 'bot') === 'bot' ? 'bot commands only 🤖' : 'every message 🌟'}*\n\n` +
      `_or type ${prefix()}help if you get stuck_`,
    footer: cfg.botName || 'KAMI Bot',
    buttons: [
      { id: 'owner:hub:autoreact:on', text: '🔴 On' },
      { id: 'owner:hub:autoreact:off', text: '⚫ Off' },
      { id: 'owner:hub:autoreact:set:bot', text: '🤖 Bot mode' },
      { id: 'owner:hub:autoreact:set:all', text: '🌟 All mode' },
      { id: 'owner:hub', text: '⬅️ Back' },
    ],
  }, msg);
}

onButton('owner:hub:autoreact:on', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note = '✅ _auto-react ON_';
  try {
    await autoreactCmd.execute(sock, msg, ['on'], swallowExtra(from, sender, from.endsWith('@g.us')));
  } catch (e) {
    console.error('[ownerHub] autoreact on failed:', e.message);
    note = '❌ _couldn\u2019t update auto-react — check logs_';
  }
  await renderAutoreact(sock, msg, from, note);
});

onButton('owner:hub:autoreact:off', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note = '❌ _auto-react OFF_';
  try {
    await autoreactCmd.execute(sock, msg, ['off'], swallowExtra(from, sender, from.endsWith('@g.us')));
  } catch (e) {
    console.error('[ownerHub] autoreact off failed:', e.message);
    note = '❌ _couldn\u2019t update auto-react — check logs_';
  }
  await renderAutoreact(sock, msg, from, note);
});

onButton('owner:hub:autoreact:set:bot', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note = '🤖 _mode: bot commands only_';
  try {
    await autoreactCmd.execute(sock, msg, ['set', 'bot'], swallowExtra(from, sender, from.endsWith('@g.us')));
  } catch (e) {
    console.error('[ownerHub] autoreact set bot failed:', e.message);
    note = '❌ _couldn\u2019t update auto-react — check logs_';
  }
  await renderAutoreact(sock, msg, from, note);
});

onButton('owner:hub:autoreact:set:all', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note = '🌟 _mode: every message_';
  try {
    await autoreactCmd.execute(sock, msg, ['set', 'all'], swallowExtra(from, sender, from.endsWith('@g.us')));
  } catch (e) {
    console.error('[ownerHub] autoreact set all failed:', e.message);
    note = '❌ _couldn\u2019t update auto-react — check logs_';
  }
  await renderAutoreact(sock, msg, from, note);
});

onButton('owner:hub:autoreact', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  await renderAutoreact(sock, msg, from);
});

// ── DM BLOCKER ───────────────────────────────────────────────────────
async function renderDmblocker(sock, msg, from, note) {
  const cfg = freshConfig();
  const on = !!database.getGlobalSettings().selfMode;
  const approved = database.getApprovedNumbers();
  const list = approved.length
    ? approved.slice(0, 8).map(n => `  • ${database.canonicalNumber(n) || n}`).join('\n')
    : '  _None_';
  const more = approved.length > 8 ? `\n  _+${approved.length - 8} more_` : '';
  await sendButtons(sock, from, {
    text:
      `${note ? note + '\n\n' : ''}` +
      `* DM BLOCKER*\n\n` +
      `Status: *${on ? 'ON ✅' : 'OFF ❌'}*\n\n` +
      `*Approved:*\n${list}${more}\n\n` +
      `_approve/disapprove stays typed:_\n` +
      `_${prefix()}dmblocker approve <number>_\n` +
      `_or type ${prefix()}help if you get stuck_`,
    footer: cfg.botName || 'KAMI Bot',
    buttons: [
      { id: 'owner:hub:dmblocker:on', text: '✅ On' },
      { id: 'owner:hub:dmblocker:off', text: '❌ Off' },
      { id: 'owner:hub', text: '⬅️ Back' },
    ],
  }, msg);
}

onButton('owner:hub:dmblocker:on', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note;
  try {
    if (database.getGlobalSettings().selfMode) {
      note = '⚠️ _already ON_';
    } else {
      database.updateGlobalSettings({ selfMode: true });
      note = '✅ _DM blocker ON — only approved numbers_';
    }
  } catch (e) {
    console.error('[ownerHub] dmblocker on failed:', e.message);
    note = '❌ _couldn\u2019t update DM blocker — check logs_';
  }
  await renderDmblocker(sock, msg, from, note);
});

onButton('owner:hub:dmblocker:off', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  let note;
  try {
    if (!database.getGlobalSettings().selfMode) {
      note = '⚠️ _already OFF_';
    } else {
      database.updateGlobalSettings({ selfMode: false });
      note = '❌ _DM blocker OFF — anyone can use the bot_';
    }
  } catch (e) {
    console.error('[ownerHub] dmblocker off failed:', e.message);
    note = '❌ _couldn\u2019t update DM blocker — check logs_';
  }
  await renderDmblocker(sock, msg, from, note);
});

onButton('owner:hub:dmblocker', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  await renderDmblocker(sock, msg, from);
});

// ── BACK TO HUB ──────────────────────────────────────────────────────
onButton('owner:hub', async (sock, msg, from, sender) => {
  if (!isOwnerJid(msg, sender)) return;
  await renderHub(sock, msg, from);
});

module.exports = {
  name: 'ohub',
  reactions: { received: '🎛️', done: '⚙️' },
  aliases: ['ownerhub'],
  category: 'owner',
  ownerOnly: true,
  description: 'Interactive owner panels — anticall, mode, autoreact, DM blocker',
  usage: '.ohub',
  execute: async (sock, msg, args, ctx) => {
    await renderHub(sock, msg, ctx.from);
  },
};
