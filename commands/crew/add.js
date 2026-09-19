/**
 * Crew Add Command — Add member to Slammed Society roster
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
  name: 'add',
  aliases: ['join'],
  category: 'crew',
  description: 'Add member to crew roster',
  usage: '.crew add @user <role> [team]',
  groupOnly: true,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];

      if (mentioned.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nTag the person you wanna add ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew add @user <role> [team]\n` +
          `Roles: leader, co-leader, officer, member\n` +
          `Teams: SSRS, KSSPS, Meet Control, KSSMP, KSSMS`
        );
      }

      const target = mentioned[0];
      const targetNum = target.split('@')[0];

      const existing = database.getCrewMember(extra.from, target);
      if (existing) {
        return extra.reply(
          `❌ ERROR\n\n@${targetNum} is already in the crew ${pick(SLANG.vibe)}\n` +
          `Role: ${ROLE_EMOJIS[existing.role] || '👤'} ${existing.role}\n` +
          `Team: ${existing.team || 'None'}`
        );
      }

      let role = 'member';
      let team = '';

      if (args.length >= 2) {
        role = args[1].toLowerCase();
        const validRoles = ['leader', 'co-leader', 'officer', 'member'];
        if (!validRoles.includes(role)) {
          return extra.reply(
            `❌ ERROR\n\nInvalid role ${pick(SLANG.error)}\n` +
            `Valid roles: ${validRoles.join(', ')}`
          );
        }
      }

      if (args.length >= 3) {
        const teamInput = args.slice(2).join(' ');
        const teamKey = Object.keys(TEAMS).find(
          k => k.toLowerCase() === teamInput.toLowerCase()
        );
        if (!teamKey) {
          return extra.reply(
            `❌ ERROR\n\nInvalid team ${pick(SLANG.error)}\n` +
            `Teams: SSRS, KSSPS, Meet Control, KSSMP, KSSMS`
          );
        }
        team = teamKey;
      }

      database.addCrewMember(extra.from, target, {
        role,
        team,
        joined: Date.now(),
        addedBy: extra.sender,
      });

      const teamDisplay = team ? TEAMS[team] : 'None';
      const roleEmoji = ROLE_EMOJIS[role] || '👤';

      await sock.sendMessage(extra.from, {
        text:
          `✅ SUCCESS\n\n` +
          `👤 MEMBER ADDED\n\n` +
          `${roleEmoji} @${targetNum} has been added to Slammed Society\n\n` +
          `🏷️ Role: ${bold(role)}\n` +
          `🏢 Team: ${bold(team || 'Unassigned')}\n` +
          `📅 Joined: ${new Date().toLocaleDateString('en-ZA')}`,
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew add error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't add member`);
    }
  },
};
