/**
 * Crew Accept Command — accept an applicant by their Application ID (UID).
 * Usage: .crew accept <UID> [role]
 * Only the team's group admins (or the owner) can accept.
 * On accept: adds to crew + DMs the applicant the "hired" message + group invite.
 */

const database = require('../../database');
const config = require('../../config');
const axios = require('axios');
const { getTeamDisplayName } = require('../../utils/teamName');
const { sendButtons } = require('../../utils/buttonHelper');
const { bold, pick, SLANG, mention } = require('../../utils/format');
const { TEAMS, buildHiredMessage } = require('./crewForms');
const { buildComparableIds, normalizeJidWithLid } = require('../../utils/jidHelper');

// Dynamic emoji mapping — first role gets 👤, last gets 👑
const getRoleEmoji = (role, roles) => {
  const idx = roles.indexOf(role);
  if (idx === roles.length - 1) return '👑';
  if (idx === roles.length - 2) return '⭐';
  if (idx === 0) return '👤';
  return '🎖️';
};

module.exports = {
  subName: 'accept',
  name: null,
  aliases: ['hire'],
  category: 'crew',
  description: 'Accept an applicant by App ID',
  usage: '.crew accept <UID> [role]',
  groupOnly: false,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
    try {
      const uid = (args[0] || '').toUpperCase();
      if (!uid) {
        return extra.reply(
          `❌ ERROR\n\nProvide the applicant's App ID\n\nUsage: \`${prefix}crew accept SS-XXXXX [role]\``
        );
      }

      const app = database.getApplicantByUid(uid);
      if (!app) {
        // Check if it was already processed
        const processed = database.getProcessedApp(uid);
        if (processed) {
          const time = new Date(processed.processedAt).toLocaleString('en-ZA');
          if (processed.action === 'accepted') {
            return extra.reply(
              `❌ ERROR\n\nApplication *${uid}* was already *accepted* by ${mention(processed.admin)} on ${time}` +
              (processed.role ? `\n🏷️ Role given: ${processed.role}` : '')
            );
          } else {
            return extra.reply(
              `❌ ERROR\n\nApplication *${uid}* was already *denied* by ${mention(processed.admin)} on ${time}` +
              (processed.reason ? `\n📝 Reason: ${processed.reason}` : '')
            );
          }
        }
        return extra.reply(
          `❌ ERROR\n\nNo application found for *${uid}*\nCheck the App ID and try again`
        );
      }

      // Atomic: remove app immediately to prevent double-accept race condition
      database.removeApplicant(app.team, uid);

      // Resolve LID → phone JID for DMs (WhatsApp can't DM LID JIDs)
      const rawJid = app.jid;
      const applicantJid = (() => {
        if (!rawJid) return rawJid;
        // If already @s.whatsapp.net, use as-is
        if (rawJid.includes('@s.whatsapp.net')) return rawJid;
        // Try LID → PN mapping
        const resolved = normalizeJidWithLid(rawJid);
        if (resolved && resolved.includes('@s.whatsapp.net')) return resolved;
        // Try stripping device suffix
        const stripped = rawJid.replace(/:\d+@/, '@');
        if (stripped.includes('@s.whatsapp.net')) return stripped;
        // Last resort — return original
        return rawJid;
      })();

      // Resolve teamKey — verify app.team matches the stored groupJid
      let teamKey = app.team;
      const appGroupJid = app.groupJid;
      const configTeam = config.crewTeams[teamKey];

      // If app.team's config JID doesn't match the stored groupJid, find the correct team
      if (appGroupJid && configTeam && configTeam.jid !== appGroupJid) {
        for (const [key, team] of Object.entries(config.crewTeams)) {
          if (team.jid === appGroupJid) {
            teamKey = key;
            break;
          }
        }
      }

      const teamGroupJid = config.crewTeams[teamKey]?.jid || appGroupJid;

      // Permission: owner, a team admin (DM-approved), or a group admin of the team's group
      let isTeamAdmin = database.isTeamAdmin(extra.sender);
      let isGroupAdmin = false;
      if (!extra.isOwner && !isTeamAdmin) {
        try {
          const meta = await sock.groupMetadata(teamGroupJid).catch(() => null);
          if (meta && meta.participants) {
            isGroupAdmin = meta.participants.some(p =>
              p.id === extra.sender && (p.admin === 'admin' || p.admin === 'superadmin')
            );
          } else {
            // Metadata fetch failed — fall back to team admin check only
            console.error(`[ACCEPT] metadata fetch failed for ${teamGroupJid}`);
          }
        } catch (e) {
          console.error('[ACCEPT] metadata error:', e.message);
        }
      }
      if (!extra.isOwner && !isTeamAdmin && !isGroupAdmin) {
        return extra.reply(
          '❌ ERROR\n\nOnly ' + getTeamDisplayName(teamKey) + ' admins can accept applications'
        );
      }

      // Role (default: lowest custom role)
      const validRoles = teamGroupJid ? database.getCustomRoles(teamGroupJid) : ['member'];
      let role = validRoles[0];
      let roleWarn = '';
      for (const arg of args.slice(1)) {
        const lower = arg.toLowerCase();
        if (validRoles.includes(lower)) {
          role = lower;
        } else if (arg.toLowerCase() !== role) {
          roleWarn = `\n⚠️ _"${arg}" isn't a valid role. Available roles: ${validRoles.join(', ')}. Using *${role}* instead._`;
        }
      }

      // Add the applicant to the team's WhatsApp group FIRST
      let addedToGroup = false;
      let addErrorMsg = '';
      if (teamGroupJid) {
        // Build candidate JIDs — same method as !add (prefer @s.whatsapp.net)
        const candidateJids = [];
        // 1. Strip device suffix: 27683993925:0@s.whatsapp.net → 27683993925@s.whatsapp.net
        const stripped = applicantJid.replace(/:\d+@/, '@');
        if (stripped !== applicantJid) candidateJids.push(stripped);
        // 2. LID → PN mapping
        const resolved = normalizeJidWithLid(applicantJid);
        if (resolved && resolved !== applicantJid && resolved !== stripped) candidateJids.push(resolved);
        // 3. buildComparableIds variants
        for (const v of buildComparableIds(applicantJid)) {
          if (!candidateJids.includes(v)) candidateJids.push(v);
        }
        // 4. Original as last resort
        candidateJids.push(applicantJid);

        for (const jid of candidateJids) {
          try {
            await sock.groupParticipantsUpdate(teamGroupJid, [jid], 'add');
            addedToGroup = true;
            addErrorMsg = '';
            break;
          } catch (e) {
            addErrorMsg = e.message || 'unknown error';
          }
        }
        if (!addedToGroup) {
          console.error('[CREW ACCEPT] group add failed:', addErrorMsg);
        }
      }

      // Always update DB — person is accepted regardless of group add success
      // If group add failed, admin can manually add them later and DB is already correct
      if (teamGroupJid) {
        database.addCrewMember(teamGroupJid, applicantJid, {
          role,
          joined: Date.now(),
          addedBy: extra.sender,
          accepted: true,
          inGroup: addedToGroup,
        });

        // Track owner-added members for protection
        if (extra.isOwner) {
          database.addOwnerAddedMember(teamGroupJid, applicantJid, extra.sender);
        }
      }

      // Track as processed before removing
      database.trackProcessedApp(teamGroupJid, app.appUid, {
        action: 'accepted',
        admin: extra.sender,
        role,
        applicantJid,
        team: teamKey,
      });

      // Log admin action for audit trail
      database.logAdminAction({
        action: 'accepted',
        appUid: app.appUid,
        team: teamKey,
        admin: extra.sender,
        applicant: applicantJid,
        role: role,
      });

      // Remove the pending application
      database.removeApplicant(teamGroupJid, app.appUid);

      // Build the hired message with the team's invite link
      const inviteLink = config.crewTeams[teamKey]?.invite
        ? 'https://chat.whatsapp.com/' + config.crewTeams[teamKey].invite
        : null;
      const hiredText = buildHiredMessage(teamKey, inviteLink);

      // Join/copy buttons — they're accepted, so the direct link is correct
      const hiredButtons = [];
      if (inviteLink) {
        hiredButtons.push({ text: '🔗 Join the Group', url: inviteLink });
        hiredButtons.push({ text: '📋 Copy Invite Link', displayText: inviteLink });
      }

      // DM the applicant the hired message, attaching the team group's profile pic as the caption image
      try {
        let sent = false;
        try {
          const ppUrl = await sock.profilePictureUrl(teamGroupJid, 'image');
          if (ppUrl) {
            const picRes = await axios.get(ppUrl, { responseType: 'arraybuffer' });
            await sendButtons(sock, applicantJid, {
              image: Buffer.from(picRes.data),
              caption: hiredText,
              text: hiredText,
              footer: config.botName || 'KAMI Bot',
              buttons: hiredButtons,
            });
            sent = true;
          }
        } catch (ppErr) {
          console.error('[CREW ACCEPT] pp fetch failed:', ppErr.message);
        }
        if (!sent) {
          if (hiredButtons.length > 0) {
            await sendButtons(sock, applicantJid, {
              text: hiredText,
              footer: config.botName || 'KAMI Bot',
              buttons: hiredButtons,
            });
          } else {
            await sock.sendMessage(applicantJid, { text: hiredText });
          }
        }
      } catch (dmErr) {
        console.error('[CREW ACCEPT] hired DM failed:', dmErr.message);
      }

      const roleEmoji = getRoleEmoji(role, validRoles);
      const ownerVIP = extra.isOwnerMentioned;

      await sock.sendMessage(extra.from, {
        text:
          '✅ SUCCESS\n\n' +
          (ownerVIP
            ? '👑 THE BOSS HAS SPOKEN 👑\n\n'
            : '🎉 MEMBER ACCEPTED\n\n') +
          '🆔 App ID: ' + bold(uid) + '\n' +
          '👤 ' + mention(applicantJid) + '\n' +
          '🏷️ Role: ' + roleEmoji + ' ' + bold(role) + '\n\n' +
          (addedToGroup
            ? '✅ Added to the ' + teamKey + ' group\n'
            : '⚠️ Couldn\'t add them to the group' +
              (addErrorMsg ? ` (${addErrorMsg})` : '') +
              '\n Invite link sent to them in DM') +
          roleWarn + '\n' +
          (ownerVIP
            ? '_The owner himself has accepted this member. Welcome to the squad._ 👑'
            : '_Hired message + group pic + invite sent to them_' + pick(SLANG.vibe)),
        mentions: applicantJid ? [applicantJid] : [],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew accept error:', error);
      console.error('Crew accept error stack:', error.stack);
      await extra.reply('❌ ERROR\n\n' + pick(SLANG.error) + ' — couldn\'t accept applicant\n\n`' + error.message + '`');
    }
  },
};