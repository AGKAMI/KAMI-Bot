const { bold, italic, pick, SLANG, mention } = require('../../utils/format');
const state = new Map();
module.exports = {
  name: 'ludo',
  reactions: { received: '🎯', done: '🏆' },
  description: 'Ludo dice roller and score tracker',
  category: 'games',
  aliases: ['ludodice'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start') {
      state.set(ctx.from, { players: [], turn: 0 });
      return ctx.reply(`🎲 ludo helper started!\n.ludo join | .ludo turn | .ludo score | .ludo stop`);
    }
    if (sub === 'join') {
      const g = state.get(ctx.from);
      if (!g) return ctx.reply(`❌ _use .ludo start first_`);
      if (g.players.includes(ctx.sender)) return ctx.reply(`already joined, ${pick(SLANG.vibe)}`);
      g.players.push(ctx.sender);
      return ctx.reply(`${mention(ctx.sender)} joined! ${pick(SLANG.good)}`);
    }
    if (sub === 'turn' || sub === 'roll') {
      const g = state.get(ctx.from);
      if (!g) return ctx.reply(`❌ _use .ludo start first_`);
      if (g.players.length < 2) return ctx.reply(`❌ _${pick(SLANG.error)} — need 2+ players_`);
      const current = g.players[g.turn % g.players.length];
      if (ctx.sender !== current) return ctx.reply(`❌ _not your turn — current: ${mention(current)}_`);
      const roll = Math.floor(Math.random() * 6) + 1;
      g.turn++;
      return ctx.reply(`🎲 ${mention(current)} rolled a ${roll}! ${pick(SLANG.vibe)}`);
    }
    if (sub === 'score' || sub === 'players') {
      const g = state.get(ctx.from);
      if (!g) return ctx.reply(`❌ _no active game_`);
      const list = g.players.map((p, i) => `${i + 1}. ${mention(p)}`).join('\n');
      const turn = (g.turn % g.players.length) + 1;
      return ctx.reply(`Players:\n${list}\n\nCurrent turn: ${turn}`);
    }
    if (sub === 'stop') {
      state.delete(ctx.from);
      return ctx.reply(`${pick(SLANG.vibe)}, ludo helper stopped!`);
    }
    return ctx.reply('Ludo commands: .ludo start | .ludo join | .ludo turn | .ludo score | .ludo stop');
  }
};
