/**
 * Broadcast Command - Send message to all chats
 */

module.exports = {
    name: 'broadcast',
    aliases: ['bc'],
    category: 'owner',
    description: 'Broadcast message to all chats',
    usage: '.broadcast <message>',
    ownerOnly: true,
    
    async execute(sock, msg, args, extra) {
      try {
        const { bold, pick, SLANG } = require('../../utils/format');
        if (args.length === 0) {
          return extra.reply('❌ _moegoe, usage: .broadcast <message>_\n\nExample: .broadcast Hello everyone!');
        }
        
        const message = args.join(' ');
        
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats);
        
        let success = 0;
        let failed = 0;
        
        for (const group of groups) {
          try {
            await sock.sendMessage(group.id, {
              text: `📢 ${bold('broadcast')}\n\n${message}\n\n_this is a broadcast from bot owner_`
            });
            success++;
          } catch (e) {
            failed++;
          }
        }
        
        await extra.reply(`✅ _lekke, broadcast done_\n\n✅ Success: ${success}\n❌ Failed: ${failed}`);
        
      } catch (error) {
        await extra.reply(`❌ _moegoe, ${error.message}_`);
      }
    }
  };
  