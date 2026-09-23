/**
 * Calculator Command - Perform math calculations
 */

const config = require('../../config');
const { bold, italic, pick, SLANG } = require('../../utils/format');

module.exports = {
    name: 'calc',
    aliases: ['calculate', 'math'],
    category: 'utility',
    description: 'Calculate math expressions',
    usage: '.calc <expression>',
    
    async execute(sock, msg, args, extra) {
      const prefix = config.prefix || '.';
      try {
        if (args.length === 0) {
          return extra.reply(`📝 _${pick(SLANG.vibe)}, give me something to calculate_\n\n_Example:_ ${prefix}calc 5 + 3 * 2`);
        }
        
        const expression = args.join(' ');
        
        // Basic safety check
        if (!/^[0-9+\-*/(). ]+$/.test(expression)) {
          return extra.reply(`❌ _${pick(SLANG.error)}, invalid expression — only numbers and operators_`);
        }
        
        try {
          const result = new Function(`return (${expression})`)();
          
          let text = `🧮 *calculator*\n\n`;
          text += `📝 Expression: ${expression}\n`;
          text += `✅ Result: ${result}`;
          
          await extra.reply(text);
        } catch (evalError) {
          await extra.reply(`❌ _${pick(SLANG.error)}, invalid math expression_`);
        }
        
      } catch (error) {
        await extra.reply(`❌ _${pick(SLANG.error)} — ${error.message}_`);
      }
    }
  };
  