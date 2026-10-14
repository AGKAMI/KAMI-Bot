'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { _internals } = require('../commands/media/tiktok');
const { extractEmbedUrl, isPlaceholder, extractVideoId } = _internals;

test('extractEmbedUrl: raw v45 URL, decodes HTML entities', () => {
  const html = '<script>{"playAddr":"https://v45.tiktokcdn-eu.com/aaa/bbb/video/tos/alisg/x/?a=1&amp;bti=ODsz&amp;&amp;policy=2&signature=abc"}</script>';
  const url = extractEmbedUrl(html);
  assert.ok(url, 'expected a URL');
  assert.ok(url.startsWith('https://v45.tiktokcdn-eu.com/'), url);
  assert.ok(url.includes('/video/tos/'), url);
  assert.ok(!url.includes('&amp;'), 'entities must be decoded');
  assert.ok(url.includes('bti=ODsz&&'), url);
});

test('extractEmbedUrl: JSON-escaped slashes', () => {
  const html = 'playAddr\\":\\"https:\\u002F\\u002Fv45.tiktokcdn-eu.com\\u002Fp\\u002Fx\\u002Fvideo\\u002Ftos\\u002Fsg\\u002Fv\\u002F?q=1&amp;z=2\\"';
  const url = extractEmbedUrl(html);
  assert.ok(url, 'expected a URL');
  assert.ok(url.startsWith('https://v45.tiktokcdn-eu.com/'), url);
  assert.ok(url.includes('/video/tos/'), url);
  assert.ok(url.includes('z=2'), url);
  assert.ok(!url.includes('\\u002F'), 'escapes must be decoded');
});

test('extractEmbedUrl: no video URL -> null', () => {
  assert.equal(extractEmbedUrl('<html>nothing here</html>'), null);
  assert.equal(extractEmbedUrl(''), null);
  assert.equal(extractEmbedUrl(null), null);
});

test('isPlaceholder: real content is not the anti-leech clip', () => {
  assert.equal(isPlaceholder(Buffer.from('definitely not a tiktok placeholder video')), false);
});

test('extractVideoId: /video/ links', () => {
  assert.equal(extractVideoId('https://www.tiktok.com/@user/video/7412345678901234567'), '7412345678901234567');
});

test('extractVideoId: /photo/ links (slideshows share photo-mode URLs)', () => {
  assert.equal(extractVideoId('https://www.tiktok.com/@user/photo/7412345678901234567'), '7412345678901234567');
  assert.equal(extractVideoId('https://www.tiktok.com/@user/photo/7412345678901234567?is_from_webapp=1'), '7412345678901234567');
});

test('extractVideoId: no numeric id -> null', () => {
  assert.equal(extractVideoId('https://www.tiktok.com/@user'), null);
  assert.equal(extractVideoId(''), null);
});
