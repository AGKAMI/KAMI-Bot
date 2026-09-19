const database = require('../../database');
const { bold, pick, SLANG } = require('../../utils/format');
const { resolveUser } = require('./crewHelpers');

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
  description: 'Accept applicant to crew',
  usage: '.crew accept @user|number [role]',
  groupOnly: false,
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const ctx = msg.message?.extendedTextMessage?.contextInfo;
      const mentioned = ctx?.mentionedJid || [];
      const resolved = resolveUser(args, mentioned);

      if (!resolved.jid) {
        return extra.reply(
          '❌ ERROR\n\nTag or add a number\n\nUsage: .crew accept @user|number [role]'
        );
      }

      const target = resolved.jid;
      const targetNum = target.split('@')[0];

      const applicants = database.getApplicants(extra.from);
      const applicant = applicants[target];

      if (!applicant) {
        return extra.reply('❌ ERROR\n\n@' + targetNum + ' hasn\'t applied');
      }

      const validRoles = database.getCustomRoles(extra.from);
      let role = validRoles[0];

      if (resolved.args[0]) {
        const inputRole = resolved.args[0].toLowerCase();
        if (validRoles.includes(inputRole)) {
          role = inputRole;
        } else {
          return extra.reply(
            '❌ ERROR\n\nInvalid role: ' + inputRole + '\n\n' +
            'Valid roles:\n' + validRoles.map(r => '• ' + r).join('\n')
          );
        }
      }

      database.addCrewMember(extra.from, target, {
        role,
        joined: Date.now(),
        addedBy: extra.sender,
      });

      database.removeApplicant(extra.from, target);

      const roleEmoji = ROLE_EMOJIS[role] || '👤';

      await sock.sendMessage(extra.from, {
        text:
          '✅ SUCCESS\n\n🎉 MEMBER ACCEPTED\n\n' +
          '@' + targetNum + ' has been accepted\n\n' +
          '🏷️ Role: ' + bold(role),
        mentions: [target],
      }, { quoted: msg });

    } catch (error) {
      console.error('Crew accept error:', error);
      await extra.reply('❌ ERROR\n\n' + pick(SLANG.error) + ' — couldn\'t accept member');
    }
  },
};
