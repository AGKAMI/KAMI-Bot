/**
 * Disk Usage Command — owner-only. Reports the container's disk breakdown.
 * Uses du on the server — instant, real numbers.
 * Usage: .disk
 */

const config = require('../../config');
const { execFile } = require('child_process');
const util = require('util');
const execFilePromise = util.promisify(execFile);
const { pick, SLANG } = require('../../utils/format');

module.exports = {
  name: 'disk',
  aliases: ['diskusage', 'storage'],
  category: 'owner',
  description: 'Show server disk usage breakdown',
  usage: '.disk',
  ownerOnly: true,

  async execute(sock, msg, args, extra) {
    try {
      const { stdout } = await execFilePromise('du', ['-sh', '/home/container/*', '/home/container/.git', '/home/container/.npm', '/home/container/.cache'], {
        maxBuffer: 1024 * 1024,
        timeout: 60000,
      });

      const lines = stdout
        .trim()
        .split('\n')
        .map(l => {
          const [size, path] = l.split('\t');
          const name = path.replace('/home/container/', '') || 'container';
          return `• ${name}: *${size}*`;
        })
        .join('\n');

      const { stdout: totalOut } = await execFilePromise('du', ['-sh', '/home/container'], {
        maxBuffer: 1024 * 1024,
        timeout: 60000,
      });
      const total = totalOut.trim().split('\t')[0];

      await sock.sendMessage(extra.from, {
        text:
          `💾 *DISK USAGE*\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📦 Total: *${total}*\n\n${lines}\n\n` +
          `_${pick(SLANG.vibe)}_`,
      }, { quoted: msg });

    } catch (error) {
      console.error('Disk error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  },
};
