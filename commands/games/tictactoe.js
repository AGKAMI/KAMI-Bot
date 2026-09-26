const config = require('../../config');
const { bold, italic, pick, SLANG, mention } = require('../../utils/format');
const { sendButtons, onButton } = require('../../utils/buttonHelper');

const tttGames = new Map();

module.exports = {
  name: 'tictactoe',
  description: 'Play tic tac toe in a group',
  aliases: ['ttt', 'xo'],
  category: 'games',
  groupOnly: true,
  execute: async (sock, msg, args, ctx) => {
    const prefix = config.prefix || '.';
    const from = ctx.from;
    const sub = (args[0] || '').toLowerCase();
    const boardKey = 'ttt_' + from;

    if (sub === 'start' || sub === 'new') {
      tttGames.set(boardKey, {
        board: Array(9).fill(' '),
        turn: 'X',
        players: { X: null, O: null },
      });
      return ctx.reply(`❌ ${pick(SLANG.error)} — tic tac toe!\nFirst person to play is X.\nUse ${prefix}ttt <1-9>\n\n1|2|3\n4|5|6\n7|8|9`);
    }

    if (['stop', 'end'].includes(sub)) {
      tttGames.delete(boardKey);
      return ctx.reply(`${pick(SLANG.vibe)}, tic tac toe stopped!`);
    }

    if (!/^\d$/.test(sub)) {
      return ctx.reply(`❌ _${pick(SLANG.error)} — use: ${prefix}ttt start | ${prefix}ttt <1-9> | ${prefix}ttt stop_`);
    }

    const g = tttGames.get(boardKey);
    if (!g) return ctx.reply(`❌ _no active game — use ${prefix}ttt start_`);

    const pos = parseInt(sub) - 1;
    if (pos < 0 || pos > 8) return ctx.reply(`❌ _${pick(SLANG.error)} — use a number from 1-9_`);
    if (g.board[pos] !== ' ') return ctx.reply(`❌ _spot taken — pick another, ${pick(SLANG.vibe)}_`);

    const sender = ctx.sender;
    const token = g.turn;
    const expectedPlayer = g.players[token];

    if (!expectedPlayer) {
      g.players[token] = sender;
    } else if (expectedPlayer !== sender) {
      return ctx.reply('not your turn — waiting for ' + mention(expectedPlayer));
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
      tttGames.delete(boardKey);
      return sendButtons(sock, ctx.from, {
        text: `🎉 ${mention(sender)} ${pick(SLANG.good)}! wins with ${token}!\n\n${formatBoard(g.board)}\n\n_Player X:_ ${g.players.X ? mention(g.players.X) : '—'}\n_Player O:_ ${g.players.O ? mention(g.players.O) : '—'}`,
        mentions: [g.players.X, g.players.O].filter(Boolean),
        footer: 'Tic Tac Toe',
        buttons: [
          { id: 'ttt:rematch', text: '🔄 Rematch' },
        ],
      }, msg);
    }
    if (full) {
      tttGames.delete(boardKey);
      return sendButtons(sock, ctx.from, {
        text: `🤝 ${pick(SLANG.vibe)}, draw!\n\n${formatBoard(g.board)}\n\n_Player X:_ ${g.players.X ? mention(g.players.X) : '—'}\n_Player O:_ ${g.players.O ? mention(g.players.O) : '—'}`,
        mentions: [g.players.X, g.players.O].filter(Boolean),
        footer: 'Tic Tac Toe',
        buttons: [
          { id: 'ttt:rematch', text: '🔄 Rematch' },
        ],
      }, msg);
    }

    g.turn = token === 'X' ? 'O' : 'X';
    const next = g.players[g.turn];
    const nextMention = next ? mention(next) : 'next player';
    return ctx.reply(`${nextMention} (${g.turn}) your turn\n\n${formatBoard(g.board)}`);
  }
};

// ── Rematch button — fresh board for the group ──────────────
onButton('ttt:rematch', async (sock, msg, from) => {
  if (!from.endsWith('@g.us')) return;
  const prefix = config.prefix || '.';
  tttGames.set('ttt_' + from, {
    board: Array(9).fill(' '),
    turn: 'X',
    players: { X: null, O: null },
  });
  await sock.sendMessage(from, {
    text: `🔄 *REMATCH!*\n\nFresh board — first person to play is X.\nUse ${prefix}ttt <1-9>\n\n1|2|3\n4|5|6\n7|8|9`,
  }, { quoted: msg });
});

function formatBoard(board) {
  return board[0] + '|' + board[1] + '|' + board[2] + '\n' +
         board[3] + '|' + board[4] + '|' + board[5] + '\n' +
         board[6] + '|' + board[7] + '|' + board[8];
}
