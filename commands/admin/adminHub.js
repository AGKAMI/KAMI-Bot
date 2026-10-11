/**
 * Admin Hub — paginated ROUTER to existing admin panels (audit-first,
 * final-judge locked: no 14-panel rebuild, no input sessions).
 *
 * - `admin:*` button ids are globally admin-gated (handler.js requireAdmin('admin')).
 * - Tap a row → that command's execute([], extra) runs; its own panel/usage
 *   surface renders. The hub never reimplements panel logic.
 * - Info page carries the free cta_url buttons (grouplink, github) — no
 *   extra command surface needed.
 * - Every page body ends with a typed escape hatch (render-time prefix, F6).
 */

const config = require('../../config');
const { sendButtons, onButton, isOwnerJid } = require('../../utils/buttonHelper');
const { passesGates } = require('../../utils/againDispatch');
// Static require so pick:* handlers register at load (lazy require inside
// route() would leave them missing until the first picker opens).
require('../../utils/memberPicker');
const { loadCommands } = require('../../utils/commandLoader');

let _cmds = null;
function getCmd(name) {
  if (!_cmds) _cmds = loadCommands();
  return _cmds.get(name);
}

function prefix() { return (config && config.prefix) || '.'; }

// ── Hub pages ────────────────────────────────────────────────────────
// Page 1 — group-protection panels (each routes to its existing surface).
// Page sizes respect the hard 10-button cap INCLUDING nav buttons.
const PAGE1 = ['antilink', 'antibadword', 'antiflood', 'antitag', 'antigroupmention', 'welcome', 'goodbye'];
// Page 2 — moderation panels (kickcfg hidden from plain admins at render)
const PAGE2 = ['autosticker', 'slowmode', 'lock', 'mute', 'unmute', 'kickcfg', 'groupsettings', 'ban'];
// Page 3 — more moderation + public info
const PAGE3 = ['unban', 'warn', 'warnings', 'promote', 'demote', 'rules', 'groupstatus'];
// Page 4 (rendered below) — info + free cta buttons

const LABELS = {
  antilink: '🔗 Antilink', antibadword: '🚫 Antibadword', antiflood: '💧 Antiflood',
  antitag: '🏷️ Antitag', antigroupmention: '👻 Antigroupmention', welcome: '👋 Welcome',
  goodbye: '👋 Goodbye', autosticker: '🖼️ Autosticker', slowmode: '⏳ Slowmode',
  lock: '🔒 Lock', mute: '🔇 Mute', unmute: '🔈 Unmute', kickcfg: '⚙️ Kickcfg',
  groupsettings: '🛠️ Group settings', ban: '🔨 Ban', unban: '🕊️ Unban',
  warn: '⚠️ Warn', warnings: '📜 Warnings', promote: '⬆️ Promote', demote: '⬇️ Demote',
  rules: '📜 Rules', groupstatus: '📊 Group status', uptime: '⏱️ Uptime', help: '🆘 Help',
};

const BACK_MENU = { id: 'menu:admin', text: '⬅️ Back to Admin' };

// Commands that target a specific person — the hub opens a member picker
// instead of a usage message (see utils/memberPicker.js).
const TARGET_CMDS = new Set(['promote', 'demote', 'kick', 'ban', 'warn', 'resetwarn', 'warnings']);

function hubPageFor(name) {
  if (PAGE1.includes(name)) return 'admin:hub';
  if (PAGE2.includes(name)) return 'admin:hub:2';
  if (PAGE3.includes(name)) return 'admin:hub:3';
  return 'admin:hub';
}

async function route(sock, msg, from, name) {
  const cmd = getCmd(name);
  if (!cmd || typeof cmd.execute !== 'function') {
    return sendButtons(sock, from, {
      text: `❌ _couldn't find ${name} — type ${prefix()}help instead_`,
      footer: config.botName || 'KAMI Bot',
      buttons: [{ id: 'admin:hub', text: '⬅️ Hub' }],
    }, msg);
  }
  // Defense in depth (edge #22): programmatic execute() bypasses handler.js
  // gates — re-check the TARGET command's flags (e.g. kickcfg is ownerOnly).
  const sender = (msg.key && msg.key.participant) || from;
  if (!(await passesGates(cmd, sock, msg, from, sender))) {
    return sendButtons(sock, from, {
      text: cmd.ownerOnly
        ? '👑 *OWNER ONLY*\n\n_This panel is restricted to the bot owner._'
        : '🛡️ *ADMINS ONLY*\n\n_This panel is restricted to group admins._',
      footer: config.botName || 'KAMI Bot',
      buttons: [{ id: 'admin:hub', text: '⬅️ Hub' }],
    }, msg);
  }
  let groupMetadata = null;
  try { groupMetadata = await sock.groupMetadata(from); } catch (e) { /* DM or fetch fail — command handles */ }

  // Target-taking commands → member picker (tap a person, not type a tag)
  if (TARGET_CMDS.has(name)) {
    const { openPicker } = require('../../utils/memberPicker');
    const opened = await openPicker(sock, msg, from, name, {
      groupMetadata,
      backId: hubPageFor(name),
      title: `*PICK SOMEONE*\n\n_action: ${LABELS[name] || name}_`,
    });
    if (opened) return;
    // no metadata (DM?) — fall through to the command's own usage reply
  }

  const extra = {
    reply: async (text, opts) => sock.sendMessage(from, typeof text === 'string' ? { text, ...(opts && opts.mentions ? { mentions: opts.mentions } : {}) } : text, { quoted: msg }),
    fail: () => {},
    from,
    sender: (msg.key && msg.key.participant) || from,
    isGroup: String(from).endsWith('@g.us'),
    groupMetadata,
    pushName: (msg.pushName || ''),
  };
  try {
    await cmd.execute(sock, msg, [], extra);
  } catch (e) {
    console.error(`[adminHub] route ${name} failed:`, e.message);
    await sendButtons(sock, from, {
      text: `❌ _${name} failed — check logs, or type ${prefix()}${name}_`,
      footer: config.botName || 'KAMI Bot',
      buttons: [{ id: 'admin:hub', text: '⬅️ Hub' }],
    }, msg);
  }
}

async function renderPage(sock, msg, from, page) {
  const cfg = config;
  const sender = (msg.key && msg.key.participant) || from;
  const isOwner = (msg.key && msg.key.fromMe) || isOwnerJid(msg, sender);
  let ids, body, buttons;
  if (page === 1) {
    ids = PAGE1;
    body = `*🛡️ ADMIN HUB — PAGE 1*\n\n_group protection — tap a panel_\n\n_typed escape:_ \`${prefix()}help\``;
    buttons = [
      ...ids.map(n => ({ id: `admin:hub:go:${n}`, text: LABELS[n] || n })),
      { id: 'admin:hub:2', text: '➡️ Page 2' },
      BACK_MENU,
    ];
  } else if (page === 2) {
    // kickcfg is ownerOnly — hide the row from plain admins
    ids = PAGE2.filter(n => n !== 'kickcfg' || isOwner);
    body = `*🛡️ ADMIN HUB — PAGE 2*\n\n_moderation — tap a panel_\n\n_typed escape:_ \`${prefix()}help\``;
    buttons = [
      ...ids.map(n => ({ id: `admin:hub:go:${n}`, text: LABELS[n] || n })),
      { id: 'admin:hub:3', text: '➡️ Page 3' },
      { id: 'admin:hub', text: '⬅️ Page 1' },
    ];
  } else if (page === 3) {
    ids = PAGE3;
    body = `*🛡️ ADMIN HUB — PAGE 3*\n\n_more actions & info_\n\n_typed escape:_ \`${prefix()}help\``;
    buttons = [
      ...ids.map(n => ({ id: `admin:hub:go:${n}`, text: LABELS[n] || n })),
      { id: 'admin:hub:4', text: '➡️ Info' },
      { id: 'admin:hub:2', text: '⬅️ Page 2' },
    ];
  } else {
    // Page 4 — misc + free info buttons
    let linkRow = [];
    try {
      const code = await sock.groupInviteCode(from);
      linkRow = [{ text: '🔗 Grouplink', url: `https://chat.whatsapp.com/${code}` }];
    } catch (e) { /* not a group or no permission — skip */ }
    const gh = (config.socials && config.socials.github) || 'https://github.com/AGKAMI/KAMI-Bot';
    body = `*🛡️ ADMIN HUB — INFO*\n\n_misc & links_\n\n_typed escape:_ \`${prefix()}help\``;
    buttons = [
      { id: 'admin:hub:go:uptime', text: LABELS.uptime },
      { id: 'admin:hub:go:help', text: LABELS.help },
      { text: '🐙 GitHub', url: gh },
      ...linkRow,
      { id: 'admin:hub:3', text: '⬅️ Page 3' },
      BACK_MENU,
    ];
  }
  await sendButtons(sock, from, {
    text: body,
    footer: cfg.botName || 'KAMI Bot',
    buttons,
  }, msg);
}

// ── Button handlers ──────────────────────────────────────────────────
onButton('admin:hub', async (sock, msg, from) => renderPage(sock, msg, from, 1));
onButton('admin:hub:2', async (sock, msg, from) => renderPage(sock, msg, from, 2));
onButton('admin:hub:3', async (sock, msg, from) => renderPage(sock, msg, from, 3));
onButton('admin:hub:4', async (sock, msg, from) => renderPage(sock, msg, from, 4));

onButton('admin:hub:go:', async (sock, msg, from, sender, btnId) => {
  const name = btnId.split(':').pop();
  if (!name || !/^[a-z][a-z0-9]{0,20}$/.test(name)) return;
  await route(sock, msg, from, name);
});

module.exports = {
  name: 'ahub',
  reactions: { received: '🛡️', done: '⚙️' },
  aliases: ['adminhub'],
  category: 'admin',
  groupOnly: true,
  adminOnly: true,
  description: 'Interactive admin hub — every admin panel one tap away',
  usage: '.ahub',
  execute: async (sock, msg, args, ctx) => {
    await renderPage(sock, msg, ctx.from, 1);
  },
};
