/**
 * Snipe Store — Stores last 10 deleted messages per group
 * Replaces simple Map with structured history + media type detection
 */

const MAX_HISTORY = 10;

class SnipeStore {
  constructor() {
    this.store = new Map();
  }

  /**
   * Add a deleted message entry to the group's history
   * @param {string} jid - Group JID
   * @param {object} entry - { sender, content, deletedBy, time, type }
   */
  add(jid, entry) {
    if (!this.store.has(jid)) {
      this.store.set(jid, []);
    }
    const history = this.store.get(jid);
    history.unshift({
      sender: entry.sender,
      content: entry.content,
      deletedBy: entry.deletedBy,
      time: entry.time || Date.now(),
      type: entry.type || 'text'
    });
    // Keep max entries
    if (history.length > MAX_HISTORY) {
      history.length = MAX_HISTORY;
    }
  }

  /**
   * Get a specific entry from history
   * @param {string} jid - Group JID
   * @param {number} index - 0 = most recent (default), 1 = second most recent, etc.
   * @returns {object|null}
   */
  get(jid, index = 0) {
    const history = this.store.get(jid);
    if (!history || history.length === 0) return null;
    if (index < 0 || index >= history.length) return null;
    return history[index];
  }

  /**
   * Get all entries for a group
   * @param {string} jid - Group JID
   * @returns {Array}
   */
  list(jid) {
    return this.store.get(jid) || [];
  }

  /**
   * Detect message type from Baileys message object
   * @param {object} msg - Baileys message
   * @returns {string}
   */
  static detectType(msg) {
    if (!msg) return 'other';
    const m = msg.message || msg;
    if (m.conversation || m.extendedTextMessage) return 'text';
    if (m.imageMessage) return 'image';
    if (m.videoMessage) return 'video';
    if (m.audioMessage) return 'audio';
    if (m.stickerMessage) return 'sticker';
    if (m.documentMessage) return 'document';
    return 'other';
  }

  /**
   * Format media type as emoji
   * @param {string} type
   * @returns {string}
   */
  static typeEmoji(type) {
    const map = {
      text: '💬',
      image: '🖼️',
      video: '🎬',
      audio: '🎵',
      sticker: '🏷️',
      document: '📄',
      other: '📎'
    };
    return map[type] || '📎';
  }
}

module.exports = new SnipeStore();
