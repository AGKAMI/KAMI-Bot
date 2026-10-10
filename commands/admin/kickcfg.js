/**
 * Kickcfg — owner-only auto-kick configuration with buttons.
 * Policy engine: utils/kickSettings.js (hot-reloaded, no restart needed).
 * Scope: 'global' or per-group override (group scope only inside a crew group).
 */

const config = require('../../config');
const kickSettings = require('../../utils/kickSettings');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

// Lazy requires inside handlers — handler.js loads commands during init,
// so requiring it at top level would give a partial module (cycle).
const engine = () => require('../../utils/autoProgression');
const ownerLib = () => require('../../handler');

const KEYMAP = {
  window: 'inactiveWindow',
  grace: 'gracePeriod',
  msgs: 'minMessages',
  cooldown: 'noticeCooldown',
  maxkicks: 'maxKicksPerCycle',
};

const PRESETS = {
  window: ['1w', '2w', '1m', '2m', '3m', '6m', '1y'],
  grace: ['1d', '3d', '7d', '14d', '30d'],
  msgs: ['1', '5', '10', '20'],
  cooldown: ['3d', '7d', '14d'],
  maxkicks: ['3', '5', '10', '15', '25'],
};

const KEY_LABELS = {
  window: 'INACTIVE WINDOW',
  grace: 'GRACE PERIOD',
  msgs: 'MIN MESSAGES',
  cooldown: 'NOTICE COOLDOWN',
  maxkicks: 'KICK CAP',
};

const fmtVal = (key, val) =>
  key === 'msgs' || key === 'maxkicks' ? String(val) : kickSettings.fmtDuration(val);

const currentVal = (scope, key) => {
  const s = scope === 'global' ? kickSettings.getGlobal() : kickSettings.getEffective(scope);
  return s[KEYMAP[key]];
};

// ── Owner gate for button presses ─────────────────────────
const ownerGate = async (sock, msg, from, sender) => {
  if (msg.key?.fromMe) return true;
  if (ownerLib().isOwner(sender)) return true;
  await sock.sendMessage(from, { text: '🔒 *OWNER ONLY*\nThis panel is restricted to the bot owner.' }).catch(() => {});
  return false;
};

const ow = (fn) => async (sock, msg, from, sender, btnId) => {
  if (!(await ownerGate(sock, msg, from, sender))) return;
  try { return await fn(sock, msg, from, sender, btnId); }
  catch (e) { console.error('[KICKCFG] button error:', e.message); }
};

// ── Picker state ──────────────────────────────────────────
// Pickers live 1h in memory — button presses re-open the same session.
// _dmScope remembers which group's settings the owner is editing when the
// dashboard was opened in DMs via the group screen (scope 'g' has no chat
// context there).
const _pickers = new Map();
let _pickerSeq = 0;
const _dmScope = new Map();
const PICKER_TTL_MS = 60 * 60 * 1000;
const PAGE_SIZE = 9; // +1 slot for Back/Next = 10 buttons max

// scopeCode: 'l' = global, 'g' = the chat the button was pressed in
// (or the group remembered from the picker when pressed in DMs)
const resolveScope = (from, scopeCode, groupJidOverride) => {
  if (scopeCode === 'g') {
    const jid = groupJidOverride || _dmScope.get(from) || from;
    if (!engine().isCrewGroupJid(jid)) {
      return { error: '❌ That chat is not a crew group — group scope only works inside one.' };
    }
    return { scope: jid, label: 'This group' };
  }
  return { scope: 'global', label: 'Global' };
};

const scopeCodeOf = (scope, from) =>
  scope !== 'global' && engine().isCrewGroupJid(from) ? 'g' : 'l';

// ── Dashboard ─────────────────────────────────────────────
const buildDashboardText = (scope, label) => {
  const summary = engine().getKickStateSummary();
  const s = scope === 'global' ? summary.global : kickSettings.getEffective(scope);
  const crew = engine().isCrewGroupJid(scope === 'global' ? null : scope);

  const lines = [
    `⚙️ *AUTO-KICK CONFIG — ${label}*`,
    `━━━━━━━━━━━━━━━━`,
    `Status: ${s.enabled ? '✅ enabled' : '🔕 disabled'}`,
    `⏳ Inactive window: *${kickSettings.fmtDuration(s.inactiveWindow)}*`,
    `⏰ Grace after notice: *${kickSettings.fmtDuration(s.gracePeriod)}*`,
    `💬 Min messages in window: *${s.minMessages}*`,
    `🔁 Notice cooldown: *${kickSettings.fmtDuration(s.noticeCooldown)}*`,
    `🛡️ Kick cap: *${s.maxKicksPerCycle}* per cycle`,
  ];

  if (scope === 'global') {
    lines.push(`🚩 Flags pending: *${summary.totalFlags}*`);
    const withOv = summary.per.filter(g => g.overridden);
    if (withOv.length) {
      lines.push('', `*Group overrides:*`);
      for (const g of withOv) {
        lines.push(`• ${g.name} — ${g.flags} flag(s) — [${g.overrideKeys.join(', ')}]`);
      }
    }
    if (summary.massAckAt && Date.now() - summary.massAckAt < 12 * 60 * 60 * 1000) {
      lines.push('', `⚠️ Mass-ack active — large kick batches allowed for 12h`);
    }
  } else {
    const g = summary.per.find(x => x.jid === scope);
    lines.push(`🚩 Flags pending: *${g ? g.flags : 0}*`);
    const ov = kickSettings.getOverrides()[scope];
    lines.push(ov ? `📌 Overriding: [${Object.keys(ov).join(', ')}]` : `📌 No override — inheriting global`);
  }

  lines.push('', `_Values save instantly — engine picks them up on the next scan._`);
  return lines.join('\n');
};

const dashButtons = (from, scopeCode, groupJidOverride) => {
  const ctxJid = groupJidOverride || _dmScope.get(from) || from;
  const inCrew = engine().isCrewGroupJid(ctxJid);
  const { scope } = resolveScope(from, scopeCode, groupJidOverride) || {};
  const enabled = !scope || scope === 'global'
    ? kickSettings.getGlobal().enabled
    : kickSettings.getEffective(scope).enabled;

  const b = [];
  if (inCrew) {
    b.push({ id: `kickcfg:view:${scopeCode === 'g' ? 'l' : 'g'}`, text: scopeCode === 'g' ? '🌐 Global scope' : '👥 This group' });
  }
  b.push({ id: `kickcfg:toggle:${scopeCode}`, text: enabled ? '🔕 Disable' : '✅ Enable' });
  b.push({ id: `kickcfg:menu:window:${scopeCode}`, text: '⏳ Window' });
  b.push({ id: `kickcfg:menu:grace:${scopeCode}`, text: '⏰ Grace' });
  b.push({ id: `kickcfg:menu:msgs:${scopeCode}`, text: '💬 Min msgs' });
  b.push({ id: `kickcfg:menu:cooldown:${scopeCode}`, text: '🔁 Cooldown' });
  b.push({ id: `kickcfg:menu:maxkicks:${scopeCode}`, text: '🛡️ Kick cap' });
  b.push({ id: `kickcfg:preview:${scopeCode}`, text: '🔍 Preview' });
  b.push({ id: `kickcfg:purge:${scopeCode}`, text: '🗑️ Purge flags' });
  b.push({ id: `kickcfg:reset:${scopeCode}`, text: '♻️ Reset' });
  if (!inCrew) b.push({ id: `kickcfg:main:${scopeCode}`, text: '🔄 Refresh' });
  return b.slice(0, 10);
};

const sendDashboard = async (sock, msg, to, scopeCode, groupJidOverride) => {
  const r = resolveScope(to, scopeCode, groupJidOverride);
  const code = r.error ? 'l' : scopeCode;
  const scope = r.error ? 'global' : r.scope;
  let label = r.error ? 'Global' : r.label;
  if (scope !== 'global') {
    // Remember the group so submenu/toggle buttons pressed in a DM still
    // resolve to it; label with the live name, not a generic string.
    _dmScope.set(to, scope);
    try { label = await engine().getLiveGroupName(sock, scope); } catch (e) {}
  }
  return sendButtons(sock, to, {
    text: buildDashboardText(scope, label),
    footer: 'Auto-Kick · owner only',
    buttons: dashButtons(to, code, groupJidOverride),
  }, msg);
};

// ── Preset submenu ────────────────────────────────────────
const sendSubmenu = async (sock, msg, from, key, scopeCode) => {
  const r = resolveScope(from, scopeCode);
  if (r.error) return sock.sendMessage(from, { text: r.error }, msg ? { quoted: msg } : {});
  let label = r.label;
  if (r.scope !== 'global') {
    try { label = await engine().getLiveGroupName(sock, r.scope); } catch (e) {}
  }
  const cur = fmtVal(key, currentVal(r.scope, key));
  const prefix = config.prefix || '.';
  const example = key === 'msgs' ? '8' : key === 'maxkicks' ? '15' : '25d';
  const presetBtns = PRESETS[key].map(v => ({
    id: `kickcfg:set:${key}:${scopeCode}:${v}`,
    text: key === 'msgs' ? `${v} msgs` : key === 'maxkicks' ? `${v} kicks` : fmtVal(key, kickSettings.parseDuration(v)),
  }));
  presetBtns.push({ id: `kickcfg:custom:${key}:${scopeCode}`, text: '✏️ Custom' });
  presetBtns.push({ id: `kickcfg:main:${scopeCode}`, text: '⬅️ Back' });

  const unitsHint = key === 'msgs'
    ? `\n_(plain number — messages required inside the window)_`
    : key === 'maxkicks'
      ? `\n_(kicks allowed per hourly cycle)_`
      : `\n_(units: d / w / m / y)_`;

  return sendButtons(sock, from, {
    text:
      `${KEY_LABELS[key]} — *${label}*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `Current: *${cur}*\n\n` +
      `Pick a preset, or type:\n` +
      `_${prefix}kickcfg set${scopeCode === 'g' ? ' g' : ''} ${key} ${example}_` +
      unitsHint,
    footer: 'Auto-Kick · owner only',
    buttons: presetBtns.slice(0, 10),
  }, msg);
};

// ── Preview: paged group picker → per-group screen ────────
// Every group gets its own button (live names), auto-paginated at 9 + a
// More/Back slot. Tapping a group opens its full status with quick actions.

const buildGroupScreenText = (name, g, eff) => {
  const lines = [
    `🔍 *${name}*`,
    `━━━━━━━━━━━━━━━━`,
    `Status: ${g.enabled ? '✅ enabled' : '🔕 disabled'}`,
    `⏳ Window *${kickSettings.fmtDuration(eff.inactiveWindow)}* · grace *${kickSettings.fmtDuration(eff.gracePeriod)}* · min *${eff.minMessages}* msg · cap *${g.cap}*/cycle`,
    ``,
    `👥 Inactive: *${g.inactiveCount}* · flagged: *${g.flaggedCount}* · due now: *${g.dueCount}* · kicks: *${g.kickCount}*`,
  ];
  const clearedParts = Object.entries(g.cleared || {}).map(([k, v]) => `${v} ${k}`);
  if (clearedParts.length) lines.push(`_Cleared this scan: ${clearedParts.join(', ')}_`);
  if (g.kickList.length) {
    lines.push('', `*Due for kick:*`);
    for (const k of g.kickList.slice(0, 20)) {
      lines.push(`→ @${k.digits} (flagged ${new Date(k.flaggedAt).toLocaleDateString()})`);
    }
    if (g.kickList.length > 20) lines.push(`… +${g.kickList.length - 20} more`);
  }
  lines.push('', `_Kicks respect the cap · failed kicks retry next scan._`);
  return lines.join('\n');
};

const sendGroupScreen = async (sock, msg, to, groupJid, pickerId) => {
  const name = await engine().getLiveGroupName(sock, groupJid);
  const p = await engine().runKickPreview(sock); // dry run; acks the mass guard
  const g = p.perGroup.find(x => x.jid === groupJid);
  if (!g) {
    return sock.sendMessage(to, { text: `⚠️ *${name}* is no longer a crew group — dropped from the list.` });
  }
  const eff = kickSettings.getEffective(groupJid);

  const btns = [];
  if (g.kickCount > 0) btns.push({ id: `kickcfg:gk:${groupJid}`, text: `👢 Kick ${g.kickCount} due` });
  if (g.inactiveCount > 0) btns.push({ id: `kickcfg:gn:${groupJid}`, text: `🔔 Notice ${g.inactiveCount} inactive` });
  btns.push({ id: `kickcfg:gs:${groupJid}`, text: '⚙️ Settings' });
  if (pickerId) btns.push({ id: `kickcfg:gpb:${pickerId}`, text: '⬅️ Groups' });

  return sendButtons(sock, to, {
    text: buildGroupScreenText(name, g, eff),
    footer: 'Auto-Kick · owner only',
    buttons: btns.slice(0, 10),
  }, msg);
};

const sendGroupPicker = async (sock, msg, to, page = 0, cachedEntries = null, fallbackJid = null) => {
  let entries = cachedEntries;
  if (!entries) {
    const summary = engine().getKickStateSummary();
    entries = [];
    for (const gp of summary.per) {
      entries.push({
        jid: gp.jid,
        name: await engine().getLiveGroupName(sock, gp.jid),
        enabled: gp.enabled,
        flags: gp.flags,
      });
    }
  }
  if (!entries.length) {
    return sock.sendMessage(to, { text: '⚠️ No crew groups registered — map one with `.crew setteam` first.' });
  }

  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const p = Math.min(Math.max(0, page), pages - 1);
  const slice = entries.slice(p * PAGE_SIZE, (p + 1) * PAGE_SIZE);

  const pickerId = `pk${Date.now().toString(36)}${(_pickerSeq++).toString(36)}`;
  _pickers.set(pickerId, { entries, page: p, at: Date.now() });
  for (const [k, v] of _pickers) {
    if (k !== pickerId && Date.now() - v.at > PICKER_TTL_MS) _pickers.delete(k);
  }

  const listLines = slice.map((e, i) => {
    const n = p * PAGE_SIZE + i + 1;
    const flagBit = e.flags ? ` — ${e.flags} flag${e.flags === 1 ? '' : 's'}` : '';
    return `*${n}.* ${e.enabled ? '✅' : '🔕'} ${e.name}${flagBit}`;
  });

  const btns = slice.map((e, i) => ({
    id: `kickcfg:gp:${pickerId}:${i}`,
    text: `${p * PAGE_SIZE + i + 1}. ${e.name}`.slice(0, 40),
  }));
  if (p > 0) btns.push({ id: `kickcfg:gpp:${pickerId}:${p - 1}`, text: '⬅️ Back' });
  if (p < pages - 1) btns.push({ id: `kickcfg:gpp:${pickerId}:${p + 1}`, text: '➡️ More' });

  const text =
    `🔍 *AUTO-KICK — PICK A GROUP*\n` +
    `━━━━━━━━━━━━━━━━\n` +
    listLines.join('\n') +
    (pages > 1 ? `\n\n_Page ${p + 1} of ${pages}_` : '') +
    `\n\n_Tap a group for its status + quick actions._`;

  const opts = { text, footer: 'Auto-Kick · owner only', buttons: btns.slice(0, 10) };
  try {
    return await sendButtons(sock, to, opts, msg);
  } catch (e) {
    if (fallbackJid && fallbackJid !== to) return sendButtons(sock, fallbackJid, opts, msg);
    throw e;
  }
};

// ── Command ───────────────────────────────────────────────
module.exports = {
  name: 'kickcfg',
  aliases: ['autokick'],
  category: 'admin',
  description: 'Configure the inactive auto-kick engine (owner only)',
  usage: '.kickcfg [on|off|preview|purge|reset|set <key> <value>] · set g = this group',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    const sub = (args[0] || '').toLowerCase();
    const crewHere = extra.isGroup && engine().isCrewGroupJid(extra.from);

    if (sub === 'preview') return sendGroupPicker(sock, msg, extra.sender, 0, null, extra.from);

    if (sub === 'on' || sub === 'off') {
      const res = kickSettings.update('global', { enabled: sub === 'on' });
      if (!res.ok) return extra.reply(`❌ ${res.error}`);
      return extra.reply(sub === 'on'
        ? `✅ *AUTO-KICK ON*\n\n_Engine enabled for all crew groups (per-group overrides still apply)_`
        : `🔕 *AUTO-KICK OFF*\n\n_Engine paused — flags are kept, resume any time with ${prefix}kickcfg on_`);
    }

    if (sub === 'purge') {
      const useGroup = (args[1] || '').toLowerCase() === 'g';
      if (useGroup && !crewHere) return extra.reply('❌ Run that inside a crew group.');
      engine().purgeKickFlags(useGroup ? extra.from : null);
      return extra.reply(useGroup
        ? `🗑️ Flags purged for this group — notice cooldown untouched.`
        : `🗑️ Flags purged for ALL crew groups — notice cooldowns untouched.`);
    }

    if (sub === 'reset') {
      const useGroup = (args[1] || '').toLowerCase() === 'g';
      if (useGroup) {
        if (!crewHere) return extra.reply('❌ Run that inside a crew group.');
        const had = kickSettings.resetGroup(extra.from);
        return extra.reply(had ? `♻️ This group now inherits global settings.` : `ℹ️ This group had no override.`);
      }
      kickSettings.resetGlobal();
      return extra.reply(`♻️ Global settings reset to defaults (30d window · 14d grace · 1 msg · 7d cooldown · cap 10).`);
    }

    if (sub === 'set') {
      let rest = args.slice(1);
      let scope = 'global';
      if ((rest[0] || '').toLowerCase() === 'g') {
        if (!crewHere) return extra.reply('❌ Group scope only works inside a crew group.');
        scope = extra.from;
        rest = rest.slice(1);
      }
      const key = (rest[0] || '').toLowerCase();
      const value = rest.slice(1).join(' ').trim();
      if (!KEYMAP[key] || !value) {
        return extra.reply(
          `❌ *USAGE*\n` +
          `_${prefix}kickcfg set <window|grace|msgs|cooldown|maxkicks> <value>_\n` +
          `_${prefix}kickcfg set g grace 7d_  _(g = this group)_\n\n` +
          `_Examples:_ _25d · 6w · 1m · 1y · msgs 5 · maxkicks 10_`
        );
      }
      const patch = { [KEYMAP[key]]: value };
      const res = kickSettings.update(scope, patch);
      if (!res.ok) return extra.reply(`❌ ${res.error}`);
      const label = scope === 'global' ? 'Global' : 'This group';
      return extra.reply(`✅ *${KEY_LABELS[key]}* → *${fmtVal(key, kickSettings.validate(KEYMAP[key], value).value || currentVal(scope, key))}* _(${label})_`);
    }

    // Default: dashboard — the group you're in when in a crew group, else global
    return sendDashboard(sock, msg, extra.from, crewHere ? 'g' : 'l');
  },
};

// ── Button handlers ───────────────────────────────────────
onButton('kickcfg:main', ow(async (sock, msg, from, sender, btnId) => {
  const scopeCode = btnId.split(':')[2] || 'l';
  return sendDashboard(sock, msg, from, scopeCode);
}));

onButton('kickcfg:view', ow(async (sock, msg, from, sender, btnId) => {
  const scopeCode = btnId.split(':')[2] || 'l';
  return sendDashboard(sock, msg, from, scopeCode);
}));

onButton('kickcfg:toggle', ow(async (sock, msg, from, sender, btnId) => {
  const scopeCode = btnId.split(':')[2] || 'l';
  const r = resolveScope(from, scopeCode);
  if (r.error) return sock.sendMessage(from, { text: r.error });
  const cur = r.scope === 'global'
    ? kickSettings.getGlobal().enabled
    : kickSettings.getEffective(r.scope).enabled;
  const res = kickSettings.update(r.scope, { enabled: !cur });
  if (!res.ok) return sock.sendMessage(from, { text: `❌ ${res.error}` });
  return sendDashboard(sock, msg, from, scopeCode);
}));

onButton('kickcfg:menu', ow(async (sock, msg, from, sender, btnId) => {
  const [, , key, scopeCode] = btnId.split(':');
  if (!PRESETS[key]) return;
  return sendSubmenu(sock, msg, from, key, scopeCode || 'l');
}));

onButton('kickcfg:set', ow(async (sock, msg, from, sender, btnId) => {
  const [, , key, scopeCode, value] = btnId.split(':');
  if (!PRESETS[key] || !value) return;
  const r = resolveScope(from, scopeCode || 'l');
  if (r.error) return sock.sendMessage(from, { text: r.error });
  const res = kickSettings.update(r.scope, { [KEYMAP[key]]: value });
  if (!res.ok) return sock.sendMessage(from, { text: `❌ ${res.error}` });
  await sock.sendMessage(from, {
    text: `✅ *${KEY_LABELS[key]}* → *${fmtVal(key, currentVal(r.scope, key))}* _(${r.label})_`,
  });
  return sendDashboard(sock, msg, from, scopeCode || 'l');
}));

onButton('kickcfg:custom', ow(async (sock, msg, from, sender, btnId) => {
  const [, , key, scopeCode] = btnId.split(':');
  const prefix = config.prefix || '.';
  const scopeBit = (scopeCode === 'g') ? ' g' : '';
  const example = key === 'msgs' ? '8' : key === 'maxkicks' ? '15' : '25d';
  return sendButtons(sock, from, {
    text:
      `✏️ *CUSTOM ${KEY_LABELS[key] || 'VALUE'}*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `Type it as a command:\n\n` +
      `_${prefix}kickcfg set${scopeBit} ${key} ${example}_\n\n` +
      (key === 'msgs'
        ? `_Plain number = messages required inside the window._`
        : key === 'maxkicks'
          ? `_Plain number = kicks allowed per hourly cycle._`
          : `_Units: d / w / m / y (m = 30d, y = 365d). E.g. 25d, 6w, 1m, 1y_`),
    footer: 'Auto-Kick · owner only',
    buttons: [{ id: `kickcfg:menu:${key}:${scopeCode || 'l'}`, text: '⬅️ Back' }],
  }, msg);
}));

onButton('kickcfg:preview', ow(async (sock, msg, from, sender) => {
  return sendGroupPicker(sock, msg, sender, 0, null, from);
}));

onButton('kickcfg:purge', ow(async (sock, msg, from, sender, btnId) => {
  const scopeCode = btnId.split(':')[2] || 'l';
  const r = resolveScope(from, scopeCode);
  const useGroup = scopeCode === 'g' && r.scope;
  engine().purgeKickFlags(useGroup ? r.scope : null);
  await sock.sendMessage(from, {
    text: useGroup ? `🗑️ Flags purged for this group.` : `🗑️ Flags purged for ALL crew groups.`,
  });
  return sendDashboard(sock, msg, from, scopeCode);
}));

onButton('kickcfg:reset', ow(async (sock, msg, from, sender, btnId) => {
  const scopeCode = btnId.split(':')[2] || 'l';
  if (scopeCode === 'g') {
    const r = resolveScope(from, 'g');
    if (r.error) return sock.sendMessage(from, { text: '❌ Not a crew group.' });
    const had = kickSettings.resetGroup(r.scope);
    await sock.sendMessage(from, {
      text: had ? `♻️ This group now inherits global settings.` : `ℹ️ This group had no override.`,
    });
    return sendDashboard(sock, msg, from, 'g');
  }
  kickSettings.resetGlobal();
  await sock.sendMessage(from, { text: `♻️ Global settings reset to defaults.` });
  return sendDashboard(sock, msg, from, 'l');
}));

// ── Group picker (DM) ─────────────────────────────────────
onButton('kickcfg:gp', ow(async (sock, msg, from, sender, btnId) => {
  const [, , pickerId, idxStr] = btnId.split(':');
  const picker = _pickers.get(pickerId);
  const jid = picker ? picker.entries[parseInt(idxStr, 10)]?.jid : null;
  if (!jid) {
    return sock.sendMessage(sender, { text: '⚠️ That list expired — press Preview again.' });
  }
  return sendGroupScreen(sock, msg, sender, jid, pickerId);
}));

onButton('kickcfg:gpp', ow(async (sock, msg, from, sender, btnId) => {
  const [, , pickerId, pageStr] = btnId.split(':');
  const picker = _pickers.get(pickerId);
  if (!picker) {
    return sock.sendMessage(sender, { text: '⚠️ That list expired — press Preview again.' });
  }
  return sendGroupPicker(sock, msg, sender, parseInt(pageStr, 10) || 0, picker.entries, from);
}));

onButton('kickcfg:gpb', ow(async (sock, msg, from, sender, btnId) => {
  const [, , pickerId] = btnId.split(':');
  const picker = _pickers.get(pickerId);
  if (!picker) {
    return sock.sendMessage(sender, { text: '⚠️ That list expired — press Preview again.' });
  }
  return sendGroupPicker(sock, msg, sender, picker.page, picker.entries, from);
}));

// ── Group screen actions ──────────────────────────────────
onButton('kickcfg:gk', ow(async (sock, msg, from, sender, btnId) => {
  const groupJid = btnId.split(':')[2];
  const name = await engine().getLiveGroupName(sock, groupJid);
  const res = await engine().runGroupKick(sock, groupJid);
  if (res.error) {
    return sock.sendMessage(sender, { text: `❌ *${name}*\n${res.error}${res.due ? `\n(${res.due} due once resolved)` : ''}` });
  }
  const cappedNote = res.capped ? `\n⚠️ Cap hit — the rest roll to the next scan.` : '';
  await sock.sendMessage(sender, {
    text: res.kicked
      ? `👢 Kicked *${res.kicked}* inactive member${res.kicked === 1 ? '' : 's'} from *${name}*${cappedNote}`
      : `ℹ️ Nobody due for kick in *${name}* right now.`,
  });
  return sendGroupScreen(sock, msg, sender, groupJid, null);
}));

onButton('kickcfg:gn', ow(async (sock, msg, from, sender, btnId) => {
  const groupJid = btnId.split(':')[2];
  const name = await engine().getLiveGroupName(sock, groupJid);
  const res = await engine().sendGroupNotice(sock, groupJid);
  if (res.error) {
    return sock.sendMessage(sender, { text: `❌ *${name}*\n${res.error}` });
  }
  if (!res.notified) {
    return sock.sendMessage(sender, { text: `ℹ️ Nobody inactive in *${name}* right now.` });
  }
  await sock.sendMessage(sender, {
    text: `🔔 Notice posted in *${name}* — ${res.notified} member${res.notified === 1 ? '' : 's'} flagged, grace clock running.`,
  });
  return sendGroupScreen(sock, msg, sender, groupJid, null);
}));

onButton('kickcfg:gs', ow(async (sock, msg, from, sender, btnId) => {
  const groupJid = btnId.split(':')[2];
  return sendDashboard(sock, msg, sender, 'g', groupJid);
}));
