const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
test('welcome page explains the local path without overstating security', () => {
 const html = read('index.html');
 assert.ok(html.includes('Your digital life.'));
 assert.ok(html.includes('Under lock.'));
 assert.match(html, /Open password generator/);
 assert.match(html, /personal use/);
});
test('workspace has descriptive controls and accessible live feedback', () => {
 const html = read('app.html');
 assert.ok(html.includes('A stronger password.'));
 assert.ok(html.includes('Uppercase'));
 assert.ok(html.includes('aria-live="polite"'));
 assert.ok(html.includes('aria-label="Password length"'));
 assert.ok(html.includes('stored unencrypted'));
});
