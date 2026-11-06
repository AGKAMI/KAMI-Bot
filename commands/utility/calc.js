/**
 * Calculator Command - Perform math calculations
 */

const config = require('../../config');
const { bold, italic, pick, SLANG, voice } = require('../../utils/format');

module.exports = {
    name: 'calc',
    reactions: { received: '🧮', done: '✅' },
    aliases: ['calculate'],
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
          // Safe math evaluator — only numbers and basic operators allowed
          const result = evalMath(expression);

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

// Safe math expression evaluator — no eval/Function, only + - * / ( ) .
function evalMath(expr) {
  const tokens = expr.match(/[\d.]+|[+\-*/()]/g);
  if (!tokens) throw new Error('invalid expression');
  let pos = 0;
  function peek() { return tokens[pos]; }
  function consume() { return tokens[pos++]; }
  function parseExpression() {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }
  function parseTerm() {
    let left = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parseFactor();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  }
  function parseFactor() {
    const tok = peek();
    if (tok === '(') {
      consume();
      const val = parseExpression();
      if (consume() !== ')') throw new Error('mismatched paren');
      return val;
    }
    const num = Number(consume());
    if (isNaN(num)) throw new Error('invalid number');
    return num;
  }
  const result = parseExpression();
  if (pos !== tokens.length) throw new Error('trailing tokens');
  if (!isFinite(result)) throw new Error('non-finite result');
  return result;
}