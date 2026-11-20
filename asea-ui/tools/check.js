#!/usr/bin/env node
/* asea-ui 규칙 검사: node tools/check.js <파일|폴더> ... (의존성 없음)
   검사: 6px 초과 border-radius(원형 50%·0 제외), 이모지, 포커스 제거(outline:none), 토큰 밖 hex 색(경고) */
'use strict';
const fs = require('fs'), path = require('path');
const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.json'), 'utf8'));
const allowed = new Set(); (function walk(o) { for (const k in o) { const v = o[k]; if (typeof v === 'string') (v.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(h => allowed.add(h.toLowerCase())); else if (v && typeof v === 'object') walk(v); } })(tokens);
['#fff', '#ffffff', '#000', '#000000'].forEach(h => allowed.add(h));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;
const files = [];
(function collect(p) {
  const s = fs.statSync(p);
  if (s.isDirectory()) { if (/node_modules|\.git$/.test(p)) return; fs.readdirSync(p).forEach(f => collect(path.join(p, f))); }
  else if (/\.(html|css|js)$/.test(p) && !/check\.js$/.test(p)) files.push(p);
})(process.argv[2] ? path.resolve(process.argv[2]) : process.cwd());
process.argv.slice(3).forEach(a => files.push(path.resolve(a)));
let err = 0, warn = 0;
files.forEach(f => {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((ln, i) => {
    const loc = path.relative(process.cwd(), f) + ':' + (i + 1);
    (ln.match(/border-radius\s*:\s*([^;}]+)/g) || []).forEach(m => {
      const v = m.split(':')[1];
      (v.match(/(\d+(\.\d+)?)px/g) || []).forEach(n => { if (parseFloat(n) > 6) { console.log('ERR  반지름 6px 초과 ' + loc + '  ' + m.trim()); err++; } });
      if (/999|pill/.test(v)) { console.log('ERR  알약 모양 ' + loc + '  ' + m.trim()); err++; }
    });
    if (/outline\s*:\s*(none|0)\b/.test(ln) && !/:focus/.test(ln) && !/outline-offset/.test(ln) && !/box-shadow/.test(ln)) { console.log('WARN 포커스 제거 의심 ' + loc); warn++; }
    if (/\.(html|js)$/.test(f) && EMOJI.test(ln)) { console.log('ERR  이모지 ' + loc); err++; }
    if (!/ui-kit\.css$/.test(f)) (ln.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(h => { if (!allowed.has(h.toLowerCase())) { console.log('WARN 토큰 밖 색 ' + h + ' ' + loc); warn++; } });
  });
});
console.log('\n검사 파일 ' + files.length + '개 · 오류 ' + err + ' · 경고 ' + warn);
process.exit(err ? 1 : 0);
