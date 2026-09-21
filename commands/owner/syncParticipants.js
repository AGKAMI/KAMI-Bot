/**
 * Sync Participants — Pull WhatsApp group members into crew database
 * Usage: .syncparticipants
 * Owner only. Uses the bot's live connection.
 */

const database = require('../../database');
const config = require('../../config');

module.exports = {
  name: 'syncparticipants',
  aliases: ['synccrew', 'pullmembers'],
  category: 'owner',
  description: 'Sync WhatsApp group members into crew database',
  usage: '.syncparticipants',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      await extra.reply('🔄 Syncing participants from all crew groups...');

      let totalAdded = 0;
      let totalSkipped = 0;
      const crew = database.getCrew();

      for (const [teamKey, teamInfo] of Object.entries(config.crewTeams || {})) {
        const groupJid = teamInfo.jid;
        const ranks = teamInfo.ranks;
        if (!ranks || ranks.length === 0) continue;

        try {
          const metadata = await sock.groupMetadata(groupJid);
          const participants = metadata.participants || [];

          for (const p of participants) {
            const jid = p.id;

            // Skip if already in crew DB
            const existing = database.getCrewMember(groupJid, jid);
            if (existing) {
              totalSkipped++;
              continue;
            }

            // Add with lowest rank
            database.addCrewMember(groupJid, jid, {
              role: ranks[0],
              joined: Date.now(),
              addedBy: 'sync',
            });

            totalAdded++;
          }
        } catch (e) {
          console.error(`[SYNC] ${teamKey} failed:`, e.message);
        }
      }

      await extra.reply(
        `✅ *SYNC COMPLETE*\n\n` +
        `➕ Added: *${totalAdded}*\n` +
        `⏭️ Skipped (already in DB): *${totalSkipped}*\n\n` +
        `All new members assigned their team's lowest rank.`
      );
    } catch (error) {
      console.error('Sync participants error:', error);
      await extra.reply('❌ ERROR\n\nSync failed — check console');
    }
  },
};
