/**
 * Broadcast Command - Send message to all chats
 */

const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
    name: 'broadcast',
    reactions: { received: '📻', done: '📡' },
    aliases: ['bc'],
    category: 'owner',
    description: 'Broadcast message to all chats',
    usage: '.broadcast <message>',
    ownerOnly: true,
    
    async execute(sock, msg, args, extra) {

  const prefix = config.prefix || '.';
      try {
        if (args.length === 0) {
          return extra.reply(`*📢 BROADCAST*\n\n💡 Usage: ${prefix}broadcast <message>\n📝 Example: ${prefix}broadcast Hello everyone!`);
        }
        
        const message = args.join(' ');
        
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats);
        
        let success = 0;
        let failed = 0;
        
        for (const group of groups) {
          try {
            await sock.sendMessage(group.id, {
              text: `*📢 BROADCAST*\n\n${message}\n\n📢 ${voice.lead('neutral')}, this is a broadcast from bot owner`
            });
            success++;
          } catch (e) {
            failed++;
          }
        }
        
        await extra.reply(`*✅ BROADCAST DONE*\n\n✅ ${voice.openErr()}, sent to all groups\n\n📊 *Success:* ${success}\n❌ *Failed:* ${failed}`);
        
      } catch (error) {
        await extra.reply(`*❌ ERROR* — ${error.message}`);
      }
    }
  };
