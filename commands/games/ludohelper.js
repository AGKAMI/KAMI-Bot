const state = new Map();
module.exports = {
  name: 'ludo',
  aliases: ['ludodice'],
  execute: async (sock, msg, args, ctx) => {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'start') {
      state.set(ctx.from, { players: [], turn: 0 });
      return ctx.reply('🎲 Ludo helper started!\n.ludo join | .ludo turn | .ludo score | .ludo stop');
    }
    if (sub === 'join') {
      const g = state.get(ctx.from);
      if (!g) return ctx.reply('Use .ludo start');
      if (g.players.includes(ctx.sender)) return ctx.reply('Already joined!');
      g.players.push(ctx.sender);
      return ctx.reply(ctx.sender.split('@')[0] + ' joined!');
    }
    if (sub === 'turn' || sub === 'roll') {
      const g = state.get(ctx.from);
      if (!g) return ctx.reply('Use .ludo start');
      if (g.players.length < 2) return ctx.reply('Need 2+ players');
      const current = g.players[g.turn % g.players.length];
      if (ctx.sender !== current) return ctx.reply('Not your turn! Current: ' + current.split('@')[0]);
      const roll = Math.floor(Math.random() * 6) + 1;
      g.turn++;
      return ctx.reply('🎲 ' + current.split('@')[0] + ' rolled a ' + roll + '!');
    }
    if (sub === 'score' || sub === 'players') {
      const g = state.get(ctx.from);
      if (!g) return ctx.reply('No game');
      const list = g.players.map((p, i) => (i + 1) + '. ' + p.split('@')[0]).join('\n');
      const turn = (g.turn % g.players.length) + 1;
      return ctx.reply('Players:\n' + list + '\n\nCurrent turn: ' + turn);
    }
    if (sub === 'stop') {
      state.delete(ctx.from);
      return ctx.reply('Ludo helper stopped');
    }
    return ctx.reply('Ludo commands: .ludo start | .ludo join | .ludo turn | .ludo score | .ludo stop');
  }
};
