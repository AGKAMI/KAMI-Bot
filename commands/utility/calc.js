/**
 * Calculator Command - Perform math calculations
 */

const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
    name: 'calc',
    reactions: { received: '🧮', done: '✅' },
    aliases: ['calculate', 'math'],
    category: 'utility',
    description: 'Calculate math expressions',
    usage: '.calc <expression>',
    
    async execute(sock, msg, args, extra) {
      const prefix = config.prefix || '.';
      try {
        if (args.length === 0) {
          return extra.reply(`📝 _${voice.lead('neutral')}, give me something to calculate_\n\n_Example:_ ${prefix}calc 5 + 3 * 2`);
        }
        
        const expression = args.join(' ');
        
        // Basic safety check
        if (!/^[0-9+\-*/(). ]+$/.test(expression)) {
          extra.fail();
          return extra.reply(`❌ _${voice.openErr()}, invalid expression — only numbers and operators_`);
        }
        
        try {
          const result = new Function(`return (${expression})`)();
          
          let text = `🧮 *calculator*\n\n`;
          text += `📝 Expression: ${expression}\n`;
          text += `✅ Result: ${result}`;
          
          await extra.reply(text);
        } catch (evalError) {
          extra.fail();
          await extra.reply(`❌ _${voice.openErr()}, invalid math expression_`);
        }
        
      } catch (error) {
        extra.fail();
        await extra.reply(`❌ _${voice.openErr()} — ${error.message}_`);
      }
    }
  };
  