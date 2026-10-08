const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('landing is a full-bleed product story with a real generator path',()=>{
 const html=read('index.html');
 assert.ok(html.includes('Your digital life.'));
 assert.ok(html.includes('Under lock.'));
 assert.ok(html.includes('assets/key-studio.png'));
 assert.ok(html.includes('landing.css'));
 assert.ok(html.includes('href="app.html"'));
 assert.ok(html.includes('id="google-login-btn"'));
 assert.ok(html.includes('personal use'));
 assert.ok(!html.includes('class="feature-list"'));
 assert.ok(!html.includes('class="login-card'));
});
