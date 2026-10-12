'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { _internals } = require('../commands/media/tiktok');
const { extractEmbedUrl, isPlaceholder } = _internals;

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
