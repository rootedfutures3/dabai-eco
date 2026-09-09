#!/usr/bin/env node
/**
 * 檢查同一頁載入的檔案有沒有重複宣告全域名稱
 * ============================================================
 * 為什麼需要這支：這些 js 都是傳統 script，不是模組，
 * 所以每個檔案最外層的 const / let / function 全部落在同一個全域。
 * 兩個檔案宣告同一個名字，後載入的那支會整個 SyntaxError 掛掉 ——
 * 而且掛的是「整支檔案」，不是那一行。
 *
 * 這種壞法特別難查，因為症狀離原因很遠：
 *   docs.js 和 social.js 都叫 dv       → 整個社群頁沒反應
 *   docs.js 和 social.js 都叫 esc      → 整個後台的按鈕全部沒反應
 *   函式定義在 coordinator.js 卻被 erp.js 呼叫 → 發票、編輯、撥款一起失效
 * 每一次都花掉不少時間才找到，所以改成部署前自動擋下來。
 *
 * 用法：node tools/check-globals.js
 * 有撞車就 exit 1。
 * ============================================================
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

/* 從 HTML 自己讀出它載入哪些 js —— 寫死一份清單遲早會跟實際情況脫節 */
function scriptsOf(html) {
  const s = fs.readFileSync(path.join(root, html), 'utf8');
  return [...s.matchAll(/<script[^>]+src="assets\/([a-z0-9-]+\.js)/g)]
    .map(m => m[1])
    .filter((f, i, a) => a.indexOf(f) === i);
}

/* 只看最外層的宣告。縮排過的在函式或區塊裡面，不會進全域。 */
function globalsOf(file) {
  const p = path.join(root, 'assets', file);
  if (!fs.existsSync(p)) return [];
  const s = fs.readFileSync(p, 'utf8');
  return [...s.matchAll(/^(?:const|let|function|class)\s+([A-Za-z_$][\w$]*)/gm)]
    .map(m => m[1]);
}

const pages = fs.readdirSync(root).filter(f => f.endsWith('.html'));
let bad = 0;

for (const page of pages) {
  const files = scriptsOf(page);
  if (files.length < 2) continue;

  const where = {};
  for (const f of files) {
    for (const name of globalsOf(f)) (where[name] = where[name] || []).push(f);
  }

  const clashes = Object.entries(where).filter(([, fs_]) => new Set(fs_).size > 1);
  if (clashes.length) {
    bad += clashes.length;
    console.error(`\n❌ ${page}`);
    for (const [name, fs_] of clashes) {
      console.error(`   「${name}」同時宣告在：${[...new Set(fs_)].join('、')}`);
    }
  }
}

if (bad) {
  console.error(`\n共 ${bad} 個名稱撞車。後載入的那支檔案會整個掛掉。`);
  console.error('把其中一個改名，或把共用的那個搬到兩邊都會載入的檔案（例如 site.js）。\n');
  process.exit(1);
}
console.log('✅ 全域名稱沒有撞車');
