/**
 * Ping Command - Check bot response time
 */

const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
    name: 'ping',
    aliases: ['p'],
    category: 'general',
    description: 'Check bot response time',
    usage: '.ping',
    
    async execute(sock, msg, args, extra) {
      try {
        const start = Date.now();
        const sent = await extra.reply(`🏓 ${bold('Pinging...')}`);
        const end = Date.now();
        
        const responseTime = end - start;
        
        let status = '🟢';
        let quality = 'Excellent';
        if (responseTime > 200) { status = '🟡'; quality = 'Good'; }
        if (responseTime > 500) { status = '🟠'; quality = 'Fair'; }
        if (responseTime > 1000) { status = '🔴'; quality = 'Poor'; }
        
        const text = [
          `${bold('KAMI BOT')}`,
          `----------`,
          ``,
          `${status} ${bold('Status:')} Online`,
          `⚡ ${bold('Response:')} ${responseTime}ms`,
          `📊 ${bold('Quality:')} ${quality}`,
          `----------`,
          `⏱️ _Tested just now, ${pick(SLANG.vibe)}_`
        ].join('\n');
        
        await sock.sendMessage(extra.from, {
          text: text,
          edit: sent.key
        });
        
      } catch (error) {
        await extra.reply(`❌ _something went stukkend — ${error.message}_`);
      }
    }
  };
