/**
 * Member picker — paginated group-member buttons for target-taking commands
 * (promote, demote, kick, ban, warn, resetwarn, warnings).
 *
 * - Hard cap: 10 buttons/message → 7 members + ◀️/▶️ nav + ⬅️ Back.
 * - Role-aware lists: promote shows non-admins only, demote shows admins
 *   only, moderation commands show everyone. Sorted by display name.
 * - Names come from nameCache (fallback: "user …123" — never raw jids).
 * - Sessions are per-chat, 10-min TTL; `pick:*` ids are admin-gated
 *   globally via requireAdmin('pick').
 * - On select: the target command's execute() runs with a synthetic
 *   message whose contextInfo.mentionedJid = [picked member] — the exact
 *   shape those commands already parse for @mentions.
 */

const config = require('../config');
const nameCache = require('./nameCache');
const { sendButtons, onButton, requireAdmin, isOwnerJid } = require('./buttonHelper');

requireAdmin('pick');

const PAGE_SIZE = 7;
const TTL_MS = 10 * 60 * 1000;
const sessions = new Map();
let seq = 0;

setInterval(() => {
  const now = Date.now();
  for (const [k, s] of sessions) if (now - s.t > TTL_MS) sessions.delete(k);
}, 300000).unref();

const isAdminRole = (p) => p.admin === 'admin' || p.admin === 'superadmin';

function label(p) {
  const jid = p.id || p.lid;
  const base = nameCache.who(jid) || `user …${String(jid || '').replace(/\D/g, '').slice(-3)}`;
  return isAdminRole(p) ? `👑 ${base}` : base;
}

// Role-aware member list for a command (bot itself is never a candidate)
function membersFor(meta, cmdName, botJid) {
  const bot = String(botJid || '').replace(/:\d+@/, '@');
  const all = (meta.participants || [])
    .filter(p => p.id || p.lid)
    .filter(p => !bot || (p.id !== bot && p.lid !== bot))
    .map(p => ({ jid: p.id || p.lid, admin: p.admin, label: label(p) }));
  let list;
  if (cmdName === 'promote') list = all.filter(p => !isAdminRole(p));
  else if (cmdName === 'demote') list = all.filter(p => isAdminRole(p));
  else list = all;
  return list.sort((a, b) => a.label.localeCompare(b.label));
}

async function renderPicker(sock, msg, from, s) {
  const total = s.members.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(s.page, pages - 1);
  const slice = s.members.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const buttons = slice.map((m, i) => ({
    id: `pick:${s.nonce}:u:${page * PAGE_SIZE + i}`,
    text: m.label.slice(0, 24),
  }));
  if (page > 0) buttons.push({ id: `pick:${s.nonce}:p:${page - 1}`, text: '◀️ Prev' });
  if (page < pages - 1) buttons.push({ id: `pick:${s.nonce}:p:${page + 1}`, text: 'Next ▶️' });
  buttons.push({ id: s.backId, text: '⬅️ Back' });

  await sendButtons(sock, from, {
    text:
      `${s.title}\n\n` +
      `*${total}* ${total === 1 ? 'person' : 'people'} — tap to pick ` +
      `(page ${page + 1}/${pages})\n\n` +
      `_or type ${config.prefix || '.'}${s.cmdName} @user_`,
    footer: config.botName || 'KAMI Bot',
    buttons,
  }, msg);
}

/**
 * Open the picker for cmdName in `from`. Returns true if rendered,
 * false if it couldn't (caller falls back to its usage text).
 */
async function openPicker(sock, msg, from, cmdName, opts = {}) {
  let meta = opts.groupMetadata || null;
  if (!meta) {
    try { meta = await sock.groupMetadata(from); } catch (e) { return false; }
  }
  const botJid = (sock.user && sock.user.id) || '';
  const members = membersFor(meta, cmdName, botJid);
  if (members.length === 0) {
    await sock.sendMessage(from, {
      text: `❌ *NO CANDIDATES*\n\n_Nobody in this group fits ${cmdName}_`,
    }, { quoted: msg });
    return true;
  }
  const nonce = `${Date.now().toString(36)}${(seq++).toString(36)}`;
  const s = {
    nonce,
    from,
    cmdName,
    members,
    page: 0,
    t: Date.now(),
    backId: opts.backId || 'admin:hub',
    title: opts.title || `*PICK SOMEONE*\n\n_action: ${cmdName}_`,
  };
  sessions.set(nonce, s);
  await renderPicker(sock, msg, from, s);
  return true;
}

async function runOn(sock, msg, s, member) {
  const { loadCommands } = require('./commandLoader');
  const cmd = loadCommands().get(s.cmdName);
  if (!cmd || typeof cmd.execute !== 'function') return;

  // Synthetic message: same key (so replies quote the tap), but the
  // contextInfo the target commands parse for @mentions now points at
  // the picked member.
  const tapMsg = {
    ...msg,
    message: {
      extendedTextMessage: {
        contextInfo: { mentionedJid: [member.jid] },
      },
    },
  };
  const sender = (msg.key && msg.key.participant) || msg.key.remoteJid;
  let isBotAdmin = false;
  try {
    const meta = await sock.groupMetadata(s.from).catch(() => null);
    const botId = String((sock.user && sock.user.id) || '').replace(/:\d+@/, '@');
    const bot = meta && (meta.participants || []).find(p => p.id === botId || p.lid === botId);
    isBotAdmin = !!(bot && bot.admin);
  } catch (e) { /* leave false */ }

  const extra = {
    from: s.from,
    sender,
    isGroup: String(s.from).endsWith('@g.us'),
    isOwner: (msg.key && msg.key.fromMe) || isOwnerJid(msg, sender),
    isAdmin: true, // pick:* ids are admin-gated before any handler runs
    isBotAdmin,
    sock,
    pushName: msg.pushName || null,
    who: nameCache.who,
    reply: (text, opts2) => sock.sendMessage(s.from, { text, ...(opts2 || {}) }, { quoted: msg }),
    fail: () => {},
    deny: () => {},
  };
  try {
    await cmd.execute(sock, tapMsg, [], extra);
  } catch (e) {
    console.error(`[picker] ${s.cmdName} failed:`, e.message);
    await sock.sendMessage(s.from, {
      text: `❌ _${s.cmdName} failed — check logs_`,
    }, { quoted: msg });
  }
}

onButton('pick:', async (sock, msg, from, sender, btnId) => {
  const parts = btnId.split(':'); // pick, nonce, kind, arg
  const s = sessions.get(parts[1]);
  // Stale/expired or another chat's session — drop silently (the pick
  // message is old by definition if this fires)
  if (!s || s.from !== from) return;

  if (parts[2] === 'p') {
    const page = parseInt(parts[3], 10);
    if (!Number.isInteger(page) || page < 0) return;
    s.page = page;
    s.t = Date.now();
    await renderPicker(sock, msg, from, s);
    return;
  }

  if (parts[2] === 'u') {
    const idx = parseInt(parts[3], 10);
    const member = Number.isInteger(idx) ? s.members[idx] : null;
    if (!member) return;
    sessions.delete(s.nonce); // one shot — re-open for another target
    await runOn(sock, msg, s, member);
    return;
  }
});

module.exports = { openPicker, membersFor };
