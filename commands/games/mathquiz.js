const quiz = new Map();
module.exports = {
  name: 'mathquiz',
  category: 'games',
  aliases: ['math', 'mq'],
  execute: async (sock, msg, args, ctx) => {
    const arg0 = args[0] || '';
    const g = quiz.get(ctx.from);
    if (g && arg0 && !isNaN(parseInt(arg0))) {
      const ans = parseInt(arg0);
      if (ans === g.ans) {
        quiz.delete(ctx.from);
        return ctx.reply('✅ Correct! ' + g.expr + ' = ' + g.ans);
      }
      return ctx.reply('❌ Wrong, try again!');
    }
    if (arg0 === 'stop') {
      quiz.delete(ctx.from);
      return ctx.reply('Quiz stopped');
    }
    const diff = arg0 || 'easy';
    let a, b, op, ans, expr;
    const ops = diff === 'hard' ? ['*', '/'] : diff === 'medium' ? ['*', '+', '-'] : ['+', '-'];
    op = ops[Math.floor(Math.random() * ops.length)];
    if (op === '/') {
      b = Math.floor(Math.random() * 10) + 2;
      a = b * (Math.floor(Math.random() * 10) + 1);
    } else {
      a = Math.floor(Math.random() * 20) + 1;
      b = Math.floor(Math.random() * 20) + 1;
      if (op === '*' && diff === 'hard') { a = Math.floor(Math.random() * 50) + 1; b = Math.floor(Math.random() * 50) + 1; }
    }
    ans = op === '+' ? a + b : op === '-' ? a - b : a * b;
    expr = a + ' ' + op + ' ' + b;
    quiz.set(ctx.from, { ans, expr });
    return ctx.reply('🔢 ' + expr + ' = ?');
  }
};
