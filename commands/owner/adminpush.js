/**
 * AdminPush Command — push a replied message to the admins of the security teams
 *
 * Usage:
 *   .adminpush all            DM every admin of all 5 crewTeams groups
 *   .adminpush SSRS           DM the admins of that team only
 *   .adminpush all group      post once in each group, tagging its admins
 *   .adminpush SSRS both      DM the admins AND post in the group
 *
 * Reuses announce.js internals (HD resolve, size guard, one-shot thumbnail)
 * so both commands share the same media pipeline.
 */

const config = require('../../config');
const { voice } = require('../../utils/format');
const { _internals: A } = require('./announce');

const DELIVERIES = ['dm', 'group', 'both'];

function getTeamGroups() {
  return Object.entries(config.crewTeams || {}).map(([abbrev, t]) => ({
    abbrev: abbrev.toUpperCase(),
    jid: t.jid,
    name: t.name,
  }));
}

function resolveTeam(spec) {
  if (!spec) return null;
  const s = String(spec).trim().toLowerCase().replace(/\s+/g, '');
  const teams = getTeamGroups();
  for (const t of teams) {
    if (t.abbrev.toLowerCase() === s) return t;
  }
  const matches = teams.filter(t =>
    t.name.toLowerCase().replace(/\s+/g, '').includes(s)
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return { ambiguous: matches };
  return null;
}

// DM jid for a group participant.
// Prefer phoneNumber (real number even when the id is an @lid), then a
// PN-shaped id, then the id itself as a last resort.
function adminDmJid(p) {
  const pn = String(p.phoneNumber || '').replace(/\D/g, '');
  if (pn) return `${pn}@s.whatsapp.net`;
  const id = p.id || p.jid || p.participant || '';
  if (typeof id === 'string' && id.includes('@')) return id;
  return id ? `${id}@s.whatsapp.net` : null;
}

function adminLabel(p) {
  const raw = p.name || p.notify || p.phoneNumber || p.id || '';
  return String(raw).split('@')[0];
}

function buildContent(type, quoted, mediaBuffer, mediaProps, nlCtx) {
  if (type === 'text') {
    return { text: A.getText(quoted), ...nlCtx };
  }
  if (type === 'image' && mediaBuffer) {
    return { image: mediaBuffer, caption: A.getCaption(quoted), ...mediaProps, ...nlCtx };
  }
  if (type === 'video' && mediaBuffer) {
    return { video: mediaBuffer, caption: A.getCaption(quoted), ...mediaProps, ...nlCtx };
  }
  if (type === 'document' && mediaBuffer) {
    return {
      document: mediaBuffer,
      fileName: quoted.documentMessage?.fileName || 'document',
      mimetype: quoted.documentMessage?.mimetype || 'application/octet-stream',
      ...nlCtx,
    };
  }
  if (type === 'audio' && mediaBuffer) {
    return {
      audio: mediaBuffer,
      mimetype: quoted.audioMessage?.mimetype || 'audio/ogg; codecs=opus',
      ...nlCtx,
    };
  }
  if (type === 'sticker') {
    const obj = { mimetype: quoted.stickerMessage?.mimetype || 'image/webp' };
    if (mediaBuffer) obj.sticker = mediaBuffer;
    if (nlCtx?.contextInfo) obj.contextInfo = nlCtx.contextInfo;
    return obj;
  }
  throw new Error('Unsupported type or missing media');
}

module.exports = {
  name: 'adminpush',
  aliases: ['apush'],
  category: 'owner',
  reactions: { received: '🛡️', done: '📨' },
  description: 'Push a replied message to the admins of the security teams',
  usage: '.adminpush <all|team> [dm|group|both]',
  ownerOnly: true,
  _internals: { getTeamGroups, resolveTeam, adminDmJid, adminLabel, buildContent },

  async execute(sock, msg, args, extra) {
    const prefix = config.prefix || '.';
    const usage =
      `Reply to the message you want pushed\n\n` +
      `Usage:\n` +
      `• \`${prefix}adminpush all\` — every admin, all 5 security teams\n` +
      `• \`${prefix}adminpush SSRS\` — that team's admins only\n` +
      `• \`${prefix}adminpush all group\` — post in the groups, tag admins\n` +
      `• \`${prefix}adminpush SSRS both\` — DM the admins + group post`;

    try {
      // ── Must be replying to a message ─────────────────────
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const quoted = ctx?.quotedMessage;
      if (!quoted) {
        extra.fail();
        return extra.reply(`❌ ERROR\n\n${usage}`);
      }

      // ── Parse filter + delivery ───────────────────────────
      const filter = (args?.[0] || '').toLowerCase();
      const delivery = (args?.[1] || 'dm').toLowerCase();

      if (!filter) {
        extra.fail();
        return extra.reply(`❌ ERROR\n\nWhich teams? ${usage}`);
      }
      if (!DELIVERIES.includes(delivery)) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nUnknown delivery: ${delivery}\n\nUse: \`${prefix}adminpush ${filter} dm\`, \`group\`, or \`both\``
        );
      }

      let groups;
      if (filter === 'all') {
        groups = getTeamGroups();
      } else {
        const team = resolveTeam(filter);
        if (!team || team.ambiguous) {
          extra.fail();
          const list = getTeamGroups()
            .map(t => `• ${t.abbrev} — ${t.name}`)
            .join('\n');
          const detail = team?.ambiguous
            ? `\n\n${team.ambiguous.map(t => `• ${t.abbrev} — ${t.name}`).join('\n')}\n\nBe specific, ${voice.tag('err')}`
            : '';
          return extra.reply(
            `❌ ERROR\n\nUnknown team: ${filter}${detail || `\n\nTeams:\n${list}`}`
          );
        }
        groups = [team];
      }

      // ── Collect admins from each target group ─────────────
      const adminsByGroup = new Map();
      const unique = new Map(); // dmJid -> { jid, label, teams:Set }
      const failed = [];

      for (const g of groups) {
        try {
          const meta = await sock.groupMetadata(g.jid);
          const admins = (meta.participants || []).filter(
            p => p.admin === 'admin' || p.admin === 'superadmin'
          );
          const dmJids = [];
          for (const p of admins) {
            const jid = adminDmJid(p);
            if (!jid) continue;
            dmJids.push(jid);
            const entry = unique.get(jid) || { jid, label: adminLabel(p), teams: new Set() };
            entry.teams.add(g.abbrev);
            unique.set(jid, entry);
          }
          adminsByGroup.set(g.jid, dmJids);
        } catch (e) {
          failed.push(`${g.name}: ${e.message}`);
          console.error(`[ADMINPUSH] groupMetadata failed for ${g.name} (${g.jid}):`, e.message);
        }
      }

      const adminList = [...unique.values()];
      if (!adminList.length) {
        extra.fail();
        return extra.reply(`❌ ERROR\n\nNo admins found in those groups, ${voice.tag('err')}`);
      }

      // ── Detect content type ───────────────────────────────
      const type = A.detectType(quoted);
      if (!type) {
        extra.fail();
        return extra.reply(
          `❌ ERROR\n\nThat message type won't work, ${voice.tag('err')}\n` +
          `I can push: text, photo, video, document, audio, sticker`
        );
      }

      // ── HD pairing: forward the HD rendition when one exists ──
      let store = null;
      try {
        ({ store } = require('../../index'));
      } catch (e) {
        console.error('[ADMINPUSH] store unavailable, staying on SD:', e.message);
      }
      const { ref: mediaRef, usingHd } = A.resolveMediaRef(
        store, msg.key.remoteJid, ctx, quoted, type, msg.key
      );

      // ── Size guard — a huge download takes the whole box down ──
      let mediaBytes = 0;
      if (type !== 'text') {
        mediaBytes = A.getFileLength(mediaRef.message, type);
        const limitMb = A.MEDIA_LIMITS_MB[type];
        const mediaMb = mediaBytes / (1024 * 1024);
        if (limitMb && mediaMb > limitMb) {
          extra.fail();
          return extra.reply(
            `❌ ERROR\n\nThat ${type} is ${mediaMb.toFixed(0)} MB — over my ${limitMb} MB push limit, ${voice.tag('err')}\n` +
            `Send it as a link instead`
          );
        }
      }

      const deliveryLabel = delivery === 'both' ? 'DM + GROUP' : delivery.toUpperCase();
      console.log(
        `[ADMINPUSH] filter=${filter} delivery=${delivery} type=${type} ` +
        `size=${(mediaBytes / 1048576).toFixed(1)}MB groups=${groups.length} admins=${adminList.length}`
      );

      // ── Download media once (HD first, SD fallback) ────────
      let mediaBuffer = null;
      if (type !== 'text') {
        mediaBuffer = await A.downloadOne(mediaRef);
        if (!mediaBuffer && usingHd) {
          console.error('[ADMINPUSH] HD download failed, falling back to SD');
          mediaBuffer = await A.downloadOne({ message: quoted, key: msg.key });
        }
        if (!mediaBuffer && type !== 'sticker') {
          extra.fail();
          return extra.reply(
            `❌ ERROR\n\nCouldn't grab the media, ${voice.tag('err')}\nTry a different message`
          );
        }
      }

      // ── Precompute thumbnail once (skips Baileys per-send encode) ──
      const mediaProps = await A.buildMediaProps(mediaBuffer, type);

      // ── Build the send list: DMs first, then group posts ───
      const jobs = [];
      if (delivery === 'dm' || delivery === 'both') {
        for (const a of adminList) {
          jobs.push({
            jid: a.jid,
            label: `${a.label} (${[...a.teams].join('/')})`,
            mentions: [],
            group: false,
          });
        }
      }
      if (delivery === 'group' || delivery === 'both') {
        for (const g of groups) {
          if (!adminsByGroup.has(g.jid)) continue; // metadata failed → already tallied
          jobs.push({
            jid: g.jid,
            label: g.name,
            mentions: adminsByGroup.get(g.jid),
            group: true,
          });
        }
      }

      // ── Send SEQUENTIALLY — one media encode at a time ─────
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        try {
          const nlCtx = job.group ? A.newsletterContext() : {};
          const content = buildContent(type, quoted, mediaBuffer, mediaProps, nlCtx);
          if (job.mentions.length) content.mentions = job.mentions;
          await sock.sendMessage(job.jid, content);
        } catch (err) {
          failed.push(`${job.label}: ${err.message}`);
          console.error(`[ADMINPUSH] Failed → ${job.label} (${job.jid}):`, err.message);
        }
        if (i < jobs.length - 1) {
          await new Promise(r => setTimeout(r, A.SEND_GAP_MS));
        }
      }
      mediaBuffer = null;

      // ── Summary ───────────────────────────────────────────
      const sent = jobs.length - failed.length;
      const teamNames = groups.map(g => g.abbrev).join(', ');

      const summary =
        `✅ *ADMIN PUSH COMPLETE*\n\n` +
        `📢 Delivery: *${deliveryLabel}*\n` +
        `👥 Teams: *${teamNames}* (${groups.length} of ${getTeamGroups().length})\n` +
        `👤 Admins: *${adminList.length}*\n` +
        `✅ Sent: *${sent}*\n` +
        (failed.length
          ? `❌ Failed: *${failed.length}*\n${failed.map(f => `  • ${f}`).join('\n')}\n`
          : '') +
        `\n_Slammed Society CPM_ ${voice.lead('neutral')}`;

      await extra.reply(summary);
    } catch (error) {
      console.error('AdminPush error:', error);
      extra.fail();
      await extra.reply(`❌ ERROR\n\n${voice.openErr()} — ${error.message}`);
    }
  },
};
