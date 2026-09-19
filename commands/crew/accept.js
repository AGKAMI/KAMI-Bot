/**
 * Crew Accept Command — Accept applicant into Slammed Society crew
 */

const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');

const TEAMS = {
  'SSRS': '🟢🔵🟡 Royal Security',
  'KSSPS': '⚫🔴⚪ Private Security',
  'Meet Control': '🔴⚪⚫ Meet Control',
  'KSSMP': '🔵⚪🩵 Metro Police',
  'KSSMS': '⚫⚪🔴 Maganyeni Security',
};

const ROLE_EMOJIS = {
  'leader': '👑',
  'co-leader': '⭐',
  'officer': '🎖️',
  'member': '👤',
};

module.exports = {
  name: 'accept',
  aliases: ['hire'],
  category: 'crew',
  description: 'Accept applicant into crew roster',
  usage: '.crew accept @user [team]',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nTag the person you wanna accept ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew accept @user [team]\n` +
          `Teams: SSRS, KSSPS, Meet Control, KSSMP, KSSMS`
        );
      }

      const target = mentioned[0];
      const targetNum = target.split('@')[0];

      const applicants = database.getApplicants(extra.from);
      const applicant = applicants[target];

      if (!applicant) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} has no pending application ${pick(SLANG.vibe)}\n` +
          `Tell them to use .crew apply first`
        );
      }

      let team = applicant.team;

      if (args.length >= 2) {
        const teamInput = args.slice(1).join(' ');
        const teamKey = Object.keys(TEAMS).find(
          k => k.toLowerCase() === teamInput.toLowerCase()
        );
        if (teamKey) {
          team = teamKey;
        }
      }

      database.removeApplicant(extra.from, target);

      database.addCrewMember(extra.from, target, {
        role: 'member',
        team,
        joined: Date.now(),
        addedBy: extra.sender,
      });

      const teamDisplay = TEAMS[team] || team;

      await sock.sendMessage(extra.from, {
        text:
          `✅ *HIRED*\n\n` +
          `🎉 @${targetNum} has been accepted into Slammed Society!\n\n` +
          `----------\n\n` +
          `🏢 Team: *${team}*\n` +
          `${teamDisplay}\n` +
          `👤 Role: *member*\n` +
          `📅 Joined: ${new Date().toLocaleDateString('en-ZA')}\n\n` +
          `----------\n\n` +
          `Welcome to the crew ${pick(SLANG.vibe)}! 🔥\n` +
          `_Use .crew checkin to start earning activity points_`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew accept error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't accept applicant`);
    }
  },
};
