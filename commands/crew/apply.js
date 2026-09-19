/**
 * Crew Apply Command — Open tryout applications for Slammed Society
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

const QUESTIONS = [
  '1️⃣ ⏱️ *ACTIVITY* — How many hours per day do you play CPM?',
  '2️⃣ 🎂 *AGE* — How old are you?',
  '3️⃣ 🎯 *EXPERIENCE* — Have you done security/VIP work in CPM before?',
  '4️⃣ 🔰 *LOYALTY* — Will you prioritize SS events over other crews?',
  '5️⃣ 📲 *COMMUNICATION* — Are you active on WhatsApp daily?',
  '6️⃣ 🚨 *SCENARIO* — A VIP car gets rammed during an event. What do you do?',
];

module.exports = {
  subName: 'apply',
  name: null,
  aliases: ['tryout'],
  category: 'crew',
  description: 'Open tryout applications for Slammed Society',
  usage: '.crew apply <team>',
  groupOnly: true,
  ownerOnly: false,

  async execute(sock, msg, args, extra) {
    try {
      if (args.length === 0) {
        return extra.reply(
          `❌ ERROR\n\nProvide a team ${pick(SLANG.friend)}\n\n` +
          `Usage: .crew apply <team>\n` +
          `Teams: SSRS, KSSPS, Meet Control, KSSMP, KSSMS`
        );
      }

      const teamInput = args.join(' ');
      const teamKey = Object.keys(TEAMS).find(
        k => k.toLowerCase() === teamInput.toLowerCase()
      );

      if (!teamKey) {
        return extra.reply(
          `❌ ERROR\n\nInvalid team ${pick(SLANG.error)}\n\n` +
          `Teams: SSRS, KSSPS, Meet Control, KSSMP, KSSMS`
        );
      }

      const sender = msg.key.remoteJid;
      const jid = msg.key.participant || sender;

      const existing = database.getApplicants(extra.from)[jid];
      if (existing) {
        return extra.reply(
          `❌ ERROR\n\nYou already have a pending application ${pick(SLANG.vibe)}\n` +
          `Team: ${bold(existing.team)}\n\n` +
          `Wait for leadership to review it first`
        );
      }

      const crewMember = database.getCrewMember(extra.from, jid);
      if (crewMember) {
        return extra.reply(
          `❌ ERROR\n\nYou're already in the crew ${pick(SLANG.vibe)}\n` +
          `Team: ${bold(crewMember.team || 'Unassigned')}\n` +
          `Role: ${bold(crewMember.role)}`
        );
      }

      const teamDisplay = TEAMS[teamKey];

      const questionsText = QUESTIONS.join('\n\n');

      await sock.sendMessage(extra.from, {
        text:
          `📋 *APPLICATION*\n\n` +
          `🏢 Team: *${teamKey}*\n` +
          `${teamDisplay}\n\n` +
          `----------\n\n` +
          `📝 *ANSWER ALL 6 QUESTIONS BELOW*\n\n` +
          `${questionsText}\n\n` +
          `----------\n\n` +
          `⚠️ Send ALL your answers in *ONE message*\n` +
          `Format each answer with the number (1-6)\n\n` +
          `_${pick(SLANG.greeting)}, good luck with the tryout!_`,
        mentions: [jid],
      }, { quoted: msg });

      database.addApplicant(extra.from, jid, {
        team: teamKey,
        answers: null,
      });

    } catch (error) {
      console.error('Crew apply error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — couldn't process application`);
    }
  },
};
