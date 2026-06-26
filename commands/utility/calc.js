/**
 * Calculator Command - Perform math calculations
 */

module.exports = {
    name: 'calc',
    aliases: ['calculate', 'math'],
    category: 'utility',
    description: 'Calculate math expressions',
    usage: '.calc <expression>',
    
    async execute(sock, msg, args, extra) {
      try {
        if (args.length === 0) {
          return extra.reply('❌ usage: .calc <expression>\n\nexample: .calc 5 + 3 * 2');
        }
        
        const expression = args.join(' ');
        
        // Basic safety check
        if (!/^[0-9+\-*/(). ]+$/.test(expression)) {
          return extra.reply('❌ invalid expression — only numbers and operators');
        }
        
        try {
          const result = eval(expression);
          
          let text = `🧮 *calculator*\n\n`;
          text += `📝 Expression: ${expression}\n`;
          text += `✅ Result: ${result}`;
          
          await extra.reply(text);
        } catch (evalError) {
          await extra.reply('❌ invalid math expression');
        }
        
      } catch (error) {
        await extra.reply(`❌ error: ${error.message}`);
      }
    }
  };
  