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
  reactions: { received: '💽', done: '📏' },
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

      // Prune dead git objects (old session files removed from tracking but
      // still loose locally) + compress packs — shrinks .git best-effort
      let gcNote = '';
      try {
        await execPromise('git gc --aggressive --prune=now --quiet', {
          maxBuffer: 1024 * 1024, timeout: 120000, cwd: '/home/container',
        });
        const { stdout: gitAfter } = await execPromise(
          'du -sh /home/container/.git 2>/dev/null',
          { maxBuffer: 1024 * 1024, timeout: 60000, cwd: '/home/container' }
        );
        gcNote = gitAfter.trim().split('\t')[0];
      } catch (e) {
        gcNote = null;
      }

      const gcLine = gcNote
        ? `\n\n🧹 Git pruned — .git is now *${gcNote}* (was in the list above)`
        : gcNote === null ? `\n\n⚠️ Git prune failed — check the logs` : '';

      await sock.sendMessage(extra.from, {
        text:
          `💾 *DISK USAGE*\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📦 Total: *${total}*\n\n${lines}${gcLine}\n\n` +
          `_${pick(SLANG.vibe)}_`,
      }, { quoted: msg });

    } catch (error) {
      console.error('Disk error:', error);
      await extra.reply(`❌ ERROR\n\n${pick(SLANG.error)} — ${error.message}`);
    }
  },
};
