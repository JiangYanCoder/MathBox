/**
 * 构建期预渲染：把符号表渲染为 MathJax CHTML 片段 + 字符 CSS
 *
 * 产出 `src/symbols/rendered.generated.ts`（gitignored，构建时生成）：
 *   - SYMBOL_CHTML:            原始 latex（含 CURSOR 占位符）→ CHTML 片段
 *   - SYMBOL_CHAR_CSS:         字符 CSS（mjx-c 的 ::before content + 度量）
 *   - SYMBOL_RENDER_FALLBACKS: 渲染失败的 latex（按钮回退为文本 label），唯一真源
 *
 * 为什么必须带字符 CSS：mjx-c 是空元素，字形由 CSS 的 ::before content 提供
 * （见 mathjax-full/js/output/chtml/FontData.js:324-325）。宿主用 adaptiveCSS
 * 只为「已渲染过的字符」生成规则，面板里没渲染过的字符会空白，故须自带。
 *
 * 运行：node scripts/prerender-symbols.mjs
 */

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);

const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { CHTML } = require('mathjax-full/js/output/chtml.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

// ---------------------------------------------------------------- 常量

const OUT = 'src/symbols/rendered.generated.ts';
const TMP = 'scripts/.tmp-symbols.mjs';

const CURSOR = String.fromCharCode(0);
/** 光标占位符的可视化替身：◻，提示用户「插入后光标停在这里」 */
const PLACEHOLDER = '\\square';

/**
 * 已知无法渲染的条目（渲染失败时按钮回退为文本 label）。
 * 新增失败条目必须显式登记，否则构建失败 —— 防止静默劣化。
 */
const KNOWN_UNRENDERABLE = new Set(['&']);

/** 产物体积上限（字节），超出即失败，防止无意识膨胀 */
const LIMIT_MAP_BYTES = 130 * 1024;
const LIMIT_CSS_BYTES = 30 * 1024;

// ---------------------------------------------------------------- 1. 符号表

await build({
	entryPoints: ['src/symbols/index.ts'],
	bundle: true,
	format: 'esm',
	platform: 'node',
	outfile: TMP,
	logLevel: 'warning',
});

const { SYMBOL_GROUPS } = await import(new URL('./.tmp-symbols.mjs', import.meta.url).href);
const ALL = SYMBOL_GROUPS.flatMap((g) => g.items);
const UNIQUE = [...new Set(ALL.map((i) => i.latex))];

// ---------------------------------------------------------------- 2. 引擎

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const chtml = new CHTML({ adaptiveCSS: true });
const doc = mathjax.document('', {
	InputJax: new TeX({ packages: AllPackages }),
	OutputJax: chtml,
});

/** 移除无障碍 MathML（浏览器配置下会输出，面板按钮不需要） */
const stripAssistive = (html) =>
	html.replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/g, '');

// ---------------------------------------------------------------- 3. 渲染

const map = Object.create(null);
const failed = [];

for (const latex of UNIQUE) {
	try {
		const html = adaptor.outerHTML(
			doc.convert(latex.split(CURSOR).join(PLACEHOLDER), { display: false }),
		);
		if (html.includes('mjx-merror') || html.includes('data-mjx-error')) {
			failed.push([latex, 'merror']);
			continue;
		}
		map[latex] = stripAssistive(html);
	} catch (err) {
		failed.push([latex, String(err).split('\n')[0]]);
	}
}

// ---------------------------------------------------------------- 4. 字符 CSS

const cssText = adaptor.outerHTML(chtml.styleSheet(doc));
const rules = cssText.match(/\.mjx-c[0-9A-Fa-f]+[^{}]*::before\s*\{[^}]*\}/g) ?? [];
const charCss = rules
	.join('')
	.replace(/\s+/g, ' ')
	.replace(/ ?([{}:;,]) ?/g, '$1')
	.trim();

// ---------------------------------------------------------------- 5. 校验

const problems = [];

for (const [latex, why] of failed) {
	if (!KNOWN_UNRENDERABLE.has(latex)) problems.push(`未登记的渲染失败：${JSON.stringify(latex)} → ${why}`);
}

const mapBytes = Object.entries(map).reduce((sum, [k, v]) => sum + k.length + v.length, 0);
if (mapBytes > LIMIT_MAP_BYTES) {
	problems.push(`片段体积超限：${(mapBytes / 1024).toFixed(1)} KB > ${LIMIT_MAP_BYTES / 1024} KB`);
}
if (charCss.length > LIMIT_CSS_BYTES) {
	problems.push(`字符 CSS 超限：${(charCss.length / 1024).toFixed(1)} KB > ${LIMIT_CSS_BYTES / 1024} KB`);
}
if (rules.length === 0) problems.push('字符 CSS 为空 —— 字形将无法显示');
if (!charCss.includes('content:')) problems.push('字符 CSS 缺少 content 属性 —— 字形将无法显示');
if (Object.keys(map).length === 0) problems.push('未生成任何片段');

if (problems.length > 0) {
	console.error('[prerender] FAIL');
	for (const p of problems) console.error(`  · ${p}`);
	process.exit(1);
}

// ---------------------------------------------------------------- 6. 落盘

const body = Object.entries(map)
	.map(([k, v]) => `\t${JSON.stringify(k)}: ${JSON.stringify(v)},`)
	.join('\n');
const fallbacks = failed.map(([latex]) => latex);

writeFileSync(
	OUT,
	`/**
 * 自动生成，请勿手改 —— 由 scripts/prerender-symbols.mjs 在构建期生成。
 *
 * SYMBOL_CHTML:    原始 latex（含 CURSOR 占位符）→ MathJax CHTML 片段。
 *                  键与 src/symbols/index.ts 的 latex 完全一致（含 \\u0000）。
 * SYMBOL_CHAR_CSS: 字符 CSS（mjx-c 的 ::before content + 度量），运行时须注入 document，
 *                  否则宿主未渲染过的字符会空白。
 * SYMBOL_RENDER_FALLBACKS: 渲染失败的 latex，按钮回退为文本 label（唯一真源，勿在别处复制）。
 */

export const SYMBOL_CHTML: Record<string, string> = {
${body}
};

export const SYMBOL_CHAR_CSS = ${JSON.stringify(charCss)};

/** 渲染失败、需回退为文本的 latex（运行时据此 fallback，selftest 据此校验覆盖率） */
export const SYMBOL_RENDER_FALLBACKS: string[] = ${JSON.stringify(fallbacks)};
`,
	'utf8',
);

// ---------------------------------------------------------------- 报告

const kb = (b) => (b / 1024).toFixed(1);
console.log('[prerender] OK');
console.log(`  符号条目 ${ALL.length} → 唯一 latex ${UNIQUE.length} → 已渲染 ${Object.keys(map).length}`);
console.log(`  回退为文本的条目 ${failed.length}${failed.length ? `：${failed.map(([l]) => JSON.stringify(l)).join(', ')}` : ''}`);
console.log(`  片段 ${kb(mapBytes)} KB（上限 ${kb(LIMIT_MAP_BYTES)} KB）`);
console.log(`  字符 CSS ${kb(charCss.length)} KB / ${rules.length} 条规则（上限 ${kb(LIMIT_CSS_BYTES)} KB）`);
console.log(`  产出 ${OUT}`);
