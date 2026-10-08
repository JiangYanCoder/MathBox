/**
 * MathBox E2E 运行器
 *
 * 1) 用 esbuild 把 harness 打成 IIFE（obsidian → 替身）
 * 2) 内联进单文件 HTML（避开 file:// 下的 ES module 限制）
 * 3) 用本机 Chrome 无头模式渲染并把结果 DOM 取回
 *
 * 运行：node scripts/e2e/run.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const esbuild = join(root, 'node_modules/esbuild/bin/esbuild');

const CHROME_CANDIDATES = [
	'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
	'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
	'/usr/bin/google-chrome',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
	console.error('[e2e] 未找到 Chrome / Edge，无法运行端到端自检');
	process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), 'mathbox-e2e-'));
const bundle = join(work, 'e2e.js');
const page = join(work, 'index.html');

execFileSync(
	process.execPath,
	[
		esbuild,
		join(here, 'harness.ts'),
		'--bundle',
		'--platform=browser',
		'--format=iife',
		`--alias:obsidian=${join(here, 'obsidian-stub.ts')}`,
		`--outfile=${bundle}`,
		'--log-level=warning',
	],
	{ stdio: 'inherit' },
);

const js = readFileSync(bundle, 'utf8');
const css = readFileSync(join(root, 'styles.css'), 'utf8');
writeFileSync(
	page,
	`<!doctype html><html><head><meta charset="utf-8"><title>MathBox E2E</title>
<style>
  /* 模拟 Obsidian 的模态容器与基础主题变量 */
  :root{
    --background-primary:#1e1f22;--background-primary-alt:#24252a;--background-secondary:#26272c;
    --background-secondary-alt:#2c2d33;--background-modifier-border:#3b3c42;--background-modifier-border-hover:#4a4b52;
    --background-modifier-hover:rgba(255,255,255,.075);--background-modifier-active-hover:rgba(255,255,255,.11);
    --modal-background:#1e1f22;--text-normal:#dcddde;--text-muted:#a3a5a8;--text-faint:#7a7c80;
    --text-error:#ff6b6b;--text-warning:#e0b341;--text-success:#4ec97a;--text-on-accent:#fff;
    --text-accent:#8b9dff;--interactive-normal:#2c2d33;--interactive-hover:#35363c;
    --interactive-accent:#7f6df2;--interactive-accent-hover:#8b7bf5;
    --font-monospace:ui-monospace,monospace;--font-text:system-ui,sans-serif;
  }
  *,*::before,*::after{box-sizing:border-box}
  html,body{margin:0;padding:0;height:100%;background:#151619;color:var(--text-normal);font-family:var(--font-text)}
  .modal-container{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:30px;box-sizing:border-box}
  .modal{background:var(--modal-background);border-radius:10px;display:flex;flex-direction:column;max-height:100%}
  .modal-content{display:flex;flex-direction:column;min-height:0}
  .dropdown{background:var(--interactive-normal);color:var(--text-normal);border:1px solid var(--background-modifier-border);border-radius:4px}
  button{font-family:inherit}
</style>
<style>${css}</style>
</head><body><script>${js}</script></body></html>`,
	'utf8',
);

const dump = execFileSync(
	chrome,
	[
		'--headless=new',
		'--disable-gpu',
		'--hide-scrollbars',
		'--window-size=1400,900',
		'--virtual-time-budget=30000',
		'--no-sandbox',
		'--dump-dom',
		`file:///${page.replace(/\\/g, '/')}`,
	],
	{ encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] },
);

const match = /<pre id="RESULT">([\s\S]*?)<\/pre>/.exec(dump);
if (!match) {
	console.error('[e2e] 未取到结果节点，页面可能崩溃。DOM 片段：');
	console.error(dump.slice(0, 1500));
	process.exit(2);
}

const text = match[1]
	.replace(/&lt;/g, '<')
	.replace(/&gt;/g, '>')
	.replace(/&quot;/g, '"')
	.replace(/&#39;/g, "'")
	.replace(/&amp;/g, '&');

const lines = text.split('\n').filter(Boolean);
let failed = 0;
let total = 0;
for (const line of lines) {
	const [kind, name, detail = ''] = line.split('\t');
	if (kind === 'SUMMARY') {
		total = Number(name);
		failed = Number(detail);
		continue;
	}
	if (kind === 'PASS') console.log(`\x1b[32m  ok  \x1b[0m ${name}`);
	else console.log(`\x1b[31m FAIL \x1b[0m ${name}${detail ? ` -> ${detail}` : ''}`);
}

console.log(`\n[e2e] ${total - failed}/${total} 通过`);
process.exit(failed === 0 ? 0 : 1);
