/**
 * Disk Usage Command — owner-only. Reports the container's disk breakdown.
 * Uses du on the server — instant, real numbers.
 * Usage: .disk
 */

const config = require('../../config');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
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
      // exec (shell) so the glob expands; sort -rh = biggest first; suppress missing paths
      const { stdout } = await execPromise(
        'du -sh /home/container/* /home/container/.git 2>/dev/null | sort -rh',
        { maxBuffer: 1024 * 1024, timeout: 120000, cwd: '/home/container' }
      );

      const lines = stdout
        .trim()
        .split('\n')
        .map(l => {
          const [size, path] = l.split('\t');
          const name = path.replace('/home/container/', '') || 'container';
          return `• ${name}: *${size}*`;
        })
        .join('\n');

      const { stdout: totalOut } = await execPromise(
        'du -sh /home/container 2>/dev/null',
        { maxBuffer: 1024 * 1024, timeout: 120000, cwd: '/home/container' }
      );
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
