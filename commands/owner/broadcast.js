/**
 * Broadcast Command - Send message to all chats
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
    name: 'broadcast',
    aliases: ['bc'],
    category: 'owner',
    description: 'Broadcast message to all chats',
    usage: '.broadcast <message>',
    ownerOnly: true,
    
    async execute(sock, msg, args, extra) {
      try {
        if (args.length === 0) {
          return extra.reply(`${bold('📢 BROADCAST')}\n\n_usage: .broadcast <message>_\n\nExample: .broadcast Hello everyone!`);
        }
        
        const message = args.join(' ');
        
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats);
        
        let success = 0;
        let failed = 0;
        
        for (const group of groups) {
          try {
            await sock.sendMessage(group.id, {
              text: `${bold('📢 BROADCAST')}\n\n${message}\n\n_${pick(SLANG.vibe)}, this is a broadcast from bot owner_`
            });
            success++;
          } catch (e) {
            failed++;
          }
        }
        
        await extra.reply(`${bold('✅ BROADCAST DONE')}\n\n_${pick(SLANG.good)}, sent to all groups_\n\n${bold('Success:')} ${success}\n${bold('Failed:')} ${failed}`);
        
      } catch (error) {
        await extra.reply(`_${pick(SLANG.error)} — ${error.message}_`);
      }
    }
  };
  