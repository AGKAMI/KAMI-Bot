/**
 * Ping Command - Check bot response time
 */

module.exports = {
    name: 'ping',
    aliases: ['p'],
    category: 'general',
    description: 'Check bot response time',
    usage: '.ping',
    
    async execute(sock, msg, args, extra) {
      try {
        const start = Date.now();
        const sent = await extra.reply('💀 KAMI checking...');
        const end = Date.now();
        
        const responseTime = end - start;
        
        let status = '🟢';
        if (responseTime > 200) status = '🟡';
        if (responseTime > 500) status = '🔴';
        
        await sock.sendMessage(extra.from, {
          text: `╭━━━≪ KAMI BOT ≫━━━╮\n\n💀 *KAMI ONLINE*\n\n${status} Pong: ${responseTime}ms\n\n> KAMI Bot`,
          edit: sent.key
        });
        
      } catch (error) {
        await extra.reply(`❌ kami error: ${error.message}`);
      }
    }
  };
  