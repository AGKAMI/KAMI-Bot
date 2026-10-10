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

// scopeCode: 'l' = global, 'g' = the chat the button was pressed in
const resolveScope = (from, scopeCode) => {
  if (scopeCode === 'g') {
    if (!engine().isCrewGroupJid(from)) {
      return { error: '❌ That chat is not a crew group — group scope only works inside one.' };
    }
    return { scope: from, label: 'This group' };
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
    `🛡️ Kick cap: *${kickSettings.getGlobal().maxKicksPerCycle}* per cycle _(global)_`,
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

const dashButtons = (from, scopeCode) => {
  const inCrew = engine().isCrewGroupJid(from);
  const { scope } = resolveScope(from, scopeCode) || {};
  const enabled = scope === 'global'
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
  b.push({ id: `kickcfg:preview:${scopeCode}`, text: '🔍 Preview' });
  b.push({ id: `kickcfg:purge:${scopeCode}`, text: '🗑️ Purge flags' });
  b.push({ id: `kickcfg:reset:${scopeCode}`, text: '♻️ Reset' });
  b.push({ id: `kickcfg:main:${scopeCode}`, text: '🔄 Refresh' });
  return b.slice(0, 10);
};

const sendDashboard = async (sock, msg, from, scopeCode) => {
  const r = resolveScope(from, scopeCode);
  const code = r.error ? 'l' : scopeCode;
  const scope = r.error ? 'global' : r.scope;
  const label = r.error ? 'Global' : r.label;
  return sendButtons(sock, from, {
    text: buildDashboardText(scope, label),
    footer: 'Auto-Kick · owner only',
    buttons: dashButtons(from, code),
  }, msg);
};

// ── Preset submenu ────────────────────────────────────────
const sendSubmenu = async (sock, msg, from, key, scopeCode) => {
  const r = resolveScope(from, scopeCode);
  if (r.error) return sock.sendMessage(from, { text: r.error }, msg ? { quoted: msg } : {});
  const cur = fmtVal(key, currentVal(r.scope, key));
  const prefix = config.prefix || '.';
  const example = key === 'msgs' ? '8' : key === 'maxkicks' ? '15' : '25d';
  const presetBtns = PRESETS[key].map(v => ({
    id: `kickcfg:set:${key}:${scopeCode}:${v}`,
    text: fmtVal(key, v),
  }));
  presetBtns.push({ id: `kickcfg:custom:${key}:${scopeCode}`, text: '✏️ Custom' });
  presetBtns.push({ id: `kickcfg:main:${scopeCode}`, text: '⬅️ Back' });

  return sendButtons(sock, from, {
    text:
      `${KEY_LABELS[key]} — *${r.label}*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `Current: *${cur}*\n\n` +
      `Pick a preset, or type:\n` +
      `_${prefix}kickcfg set${scopeCode === 'g' ? ' g' : ''} ${key} ${example}_` +
      (key === 'msgs' ? `\n_(plain number — messages required inside the window)_` : `\n_(units: d / w / m / y)_`),
    footer: 'Auto-Kick · owner only',
    buttons: presetBtns.slice(0, 10),
  }, msg);
};

// ── Preview ───────────────────────────────────────────────
const buildPreviewText = (p) => {
  const g = kickSettings.getGlobal();
  const lines = [
    `🔍 *AUTO-KICK PREVIEW (dry run)*`,
    `━━━━━━━━━━━━━━━━`,
    `Window ${kickSettings.fmtDuration(g.inactiveWindow)} · grace ${kickSettings.fmtDuration(g.gracePeriod)} · min ${g.minMessages} msg · cap ${g.maxKicksPerCycle}/cycle`,
    ``,
  ];
  for (const grp of p.perGroup) {
    const flag = grp.enabled ? '✅' : '🔕';
    lines.push(`${flag} *${grp.name}* — inactive ${grp.inactiveCount} · flagged ${grp.flaggedCount} · due ${grp.dueCount} · kicks *${grp.kickCount}*`);
    const clearedParts = Object.entries(grp.cleared || {}).map(([k, v]) => `${v} ${k}`);
    if (clearedParts.length) lines.push(`   cleared: ${clearedParts.join(', ')}`);
    for (const k of grp.kickList.slice(0, 15)) {
      lines.push(`   → @${k.digits} (flagged ${new Date(k.flaggedAt).toLocaleDateString()})`);
    }
    if (grp.kickList.length > 15) lines.push(`   … +${grp.kickList.length - 15} more`);
  }
  lines.push(
    ``,
    `*Totals:* ${p.totals.inactive} inactive · ${p.totals.flagged} flagged · ${p.totals.due} due · *${p.totals.kicks}* kicks`,
  );
  if (p.massHoldWouldApply) {
    lines.push(`⚠️ ≥10 due at once — mass-ack granted for 12h (kicks still capped ${p.maxPerCycle}/cycle)`);
  }
  lines.push(`_Nothing was removed. Ack recorded — kicks may proceed on the next scan._`);
  return lines.join('\n');
};

const doPreview = async (sock, msg, extra) => {
  const p = await engine().runKickPreview(sock);
  const text = buildPreviewText(p);
  // Owner DM first (privacy); fall back to the chat it was run in
  try {
    await sock.sendMessage(extra.sender, { text });
  } catch (e) {
    await extra.reply(text);
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

    if (sub === 'preview') return doPreview(sock, msg, extra);

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

    // Default: dashboard
    return sendDashboard(sock, msg, extra.from, 'l');
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
        : `_Units: d / w / m / y (m = 30d, y = 365d). E.g. 25d, 6w, 1m, 1y_`),
    footer: 'Auto-Kick · owner only',
    buttons: [{ id: `kickcfg:menu:${key}:${scopeCode || 'l'}`, text: '⬅️ Back' }],
  }, msg);
}));

onButton('kickcfg:preview', ow(async (sock, msg, from, sender) => {
  const p = await engine().runKickPreview(sock);
  const text = buildPreviewText(p);
  try {
    await sock.sendMessage(sender, { text });
  } catch (e) {
    await sock.sendMessage(from, { text });
  }
  return sendDashboard(sock, msg, from, 'l');
}));

onButton('kickcfg:purge', ow(async (sock, msg, from, sender, btnId) => {
  const scopeCode = btnId.split(':')[2] || 'l';
  const useGroup = scopeCode === 'g' && engine().isCrewGroupJid(from);
  engine().purgeKickFlags(useGroup ? from : null);
  await sock.sendMessage(from, {
    text: useGroup ? `🗑️ Flags purged for this group.` : `🗑️ Flags purged for ALL crew groups.`,
  });
  return sendDashboard(sock, msg, from, scopeCode);
}));

onButton('kickcfg:reset', ow(async (sock, msg, from, sender, btnId) => {
  const scopeCode = btnId.split(':')[2] || 'l';
  if (scopeCode === 'g') {
    if (!engine().isCrewGroupJid(from)) return sock.sendMessage(from, { text: '❌ Not a crew group.' });
    const had = kickSettings.resetGroup(from);
    await sock.sendMessage(from, {
      text: had ? `♻️ This group now inherits global settings.` : `ℹ️ This group had no override.`,
    });
    return sendDashboard(sock, msg, from, 'g');
  }
  kickSettings.resetGlobal();
  await sock.sendMessage(from, { text: `♻️ Global settings reset to defaults.` });
  return sendDashboard(sock, msg, from, 'l');
}));
