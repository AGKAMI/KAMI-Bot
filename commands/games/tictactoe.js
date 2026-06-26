module.exports = {
  name: 'tictactoe',
  aliases: ['ttt', 'xo'],
  category: 'games',
  groupOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const games = require('./grouphangman.js');
    const from = ctx.from;
    const sub = (args[0] || '').toLowerCase();
    const boardKey = 'ttt_' + from;

    // We'll reuse games Map by attaching ttt state
    if (!games.ttt) games.ttt = new Map();

    if (sub === 'start' || sub === 'new') {
      games.ttt.set(boardKey, {
        board: Array(9).fill(' '),
        turn: 'X',
        players: { X: null, O: null },
      });
      return ctx.reply('❌ tic tac toe!\nFirst person to play is X.\nUse .ttt <1-9>\n\n1|2|3\n4|5|6\n7|8|9');
    }

    if (['stop', 'end'].includes(sub)) {
      games.ttt.delete(boardKey);
      return ctx.reply('tic tac toe stopped');
    }

    if (!/^\d$/.test(sub)) {
      return ctx.reply('Use: .ttt start | .ttt <1-9> | .ttt stop');
    }

    const g = games.ttt.get(boardKey);
    if (!g) return ctx.reply('No active game. Use .ttt start');

    const pos = parseInt(sub) - 1;
    if (pos < 0 || pos > 8) return ctx.reply('Use a number from 1-9');
    if (g.board[pos] !== ' ') return ctx.reply('spot taken — pick another');

    const sender = ctx.sender;
    const token = g.turn;
    const expectedPlayer = g.players[token];

    if (!expectedPlayer) {
      g.players[token] = sender;
    } else if (expectedPlayer !== sender) {
      return ctx.reply('not your turn — waiting for @' + expectedPlayer.split('@')[0]);
    }

    g.board[pos] = token;

    const wins = [
      [0,1,2],[3,4,5],[6,7,8],
      [0,3,6],[1,4,7],[2,5,8],
      [0,4,8],[2,4,6],
    ];
    const winner = wins.find(combo => combo.every(i => g.board[i] === token));
    const full = g.board.every(c => c !== ' ');

    if (winner) {
      games.ttt.delete(boardKey);
      return ctx.reply('🎉 @' + sender.split('@')[0] + ' wins with ' + token + '!\n\n' + formatBoard(g.board));
    }
    if (full) {
      games.ttt.delete(boardKey);
      return ctx.reply('🤝 draw!\n\n' + formatBoard(g.board));
    }

    g.turn = token === 'X' ? 'O' : 'X';
    const next = g.players[g.turn];
    const nextMention = next ? '@' + next.split('@')[0] : 'next player';
    return ctx.reply(nextMention + ' (' + g.turn + ') your turn\n\n' + formatBoard(g.board));
  }
};

function formatBoard(board) {
  return board[0] + '|' + board[1] + '|' + board[2] + '\n' +
         board[3] + '|' + board[4] + '|' + board[5] + '\n' +
         board[6] + '|' + board[7] + '|' + board[8];
}
