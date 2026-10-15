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

/**
 * 作用域类名：所有注入的 CSS 都限定在这个后代范围内。
 * 必须限定 —— 否则宿主正文里已渲染的公式会被我们这份（来自 mathjax-full 3.2.2）
 * 结构规则覆盖，而宿主自带的那份才是权威。
 */
const SCOPE_CLASS = 'mathbox-symbol-math';
/** CSS 侧要用带点的类选择器；运行时用的是不带点的类名 */
const SCOPE_SELECTOR = `.${SCOPE_CLASS}`;

/** 产物体积上限（字节），超出即失败，防止无意识膨胀 */
const LIMIT_MAP_BYTES = 130 * 1024;
const LIMIT_BASE_CSS_BYTES = 16 * 1024;
const LIMIT_CHAR_CSS_BYTES = 30 * 1024;

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

// ---------------------------------------------------------------- 4. 样式表拆分

/**
 * 把样式表切成「选择器 + 声明体」。
 * 不能用 split('}')：字形规则里存在 content: "}" 这类字面右花括号，会切错。
 */
function parseRules(css) {
	const out = [];
	let i = 0;
	while (i < css.length) {
		const open = css.indexOf('{', i);
		if (open < 0) break;
		const sel = css.slice(i, open).trim();
		let j = open + 1;
		let quote = '';
		while (j < css.length) {
			const ch = css[j];
			if (quote) {
				if (ch === '\\') j += 2;
				else if (ch === quote) quote = '';
				j += 1;
				continue;
			}
			if (ch === '"' || ch === "'") {
				quote = ch;
				j += 1;
				continue;
			}
			if (ch === '}') break;
			j += 1;
		}
		out.push({ sel, decls: css.slice(open + 1, j) });
		i = j + 1;
	}
	return out;
}

const CHAR_SELECTOR = /\.mjx-c[0-9A-Fa-f]+[^{}]*::before$/;
const minify = (css) => css.replace(/\s+/g, ' ').replace(/ ?([{}:;,]) ?/g, '$1').trim();

const sheetText = adaptor
	.outerHTML(chtml.styleSheet(doc))
	.replace(/^<style[^>]*>/, '')
	.replace(/<\/style>\s*$/, '');

const baseParts = [];
const charParts = [];
/** 作用域前缀未生效的规则（理论上为空，留作兜底取证） */
const unscoped = [];
for (const { sel, decls } of parseRules(sheetText)) {
	// @font-face 带 CDN 字体 url（违反零网络约定），@media 等 at-rule 一律不要
	if (sel.startsWith('@')) continue;
	// 字体族交给宿主：mathjax-full 3.2.2 用 MJXZERO/MJXTEX-*，宿主用 MJX-TEX-*，
	// 命名不同，注入我们的会把字形指向宿主环境里不存在的字体
	if (decls.includes('font-family')) continue;
	// 逗号分隔的选择器逐条拆成独立规则：保证「规则条数 == 作用域前缀出现次数」，
	// 校验与 selftest 才能用字符串计数这个简单不变量
	const isChar = CHAR_SELECTOR.test(sel);
		for (const one of sel.split(',')) {
		const single = one.trim();
		// 空选择器（尾随逗号等）直接丢弃，否则会生成 `.mathbox-symbol-math{...}` 裸规则
		if (!single) continue;
		// 挂在根元素上的规则（如 `:root mjx-container{will-change:opacity}`）加了后代前缀后
		// 语义就变了（.x :root 永不命中）。这类是淡入动画的装饰性规则，直接不要
		if (/^(:root|html|body)\b/.test(single)) continue;
		const scoped = minify(`${SCOPE_SELECTOR} ${single}{${decls}}`);
		if (!scoped.startsWith(`${SCOPE_SELECTOR} `)) unscoped.push(scoped.slice(0, 60));
		(isChar ? charParts : baseParts).push(scoped);
	}
}
const baseCss = baseParts.join('');
const charCss = charParts.join('');

// ---------------------------------------------------------------- 5. 校验

const problems = [];

if (unscoped.length > 0) {
	problems.push(`有规则未加作用域前缀：${unscoped.slice(0, 3).join(' | ')}`);
}

for (const [latex, why] of failed) {
	if (!KNOWN_UNRENDERABLE.has(latex)) problems.push(`未登记的渲染失败：${JSON.stringify(latex)} → ${why}`);
}

const mapBytes = Object.entries(map).reduce((sum, [k, v]) => sum + k.length + v.length, 0);
if (mapBytes > LIMIT_MAP_BYTES) {
	problems.push(`片段体积超限：${(mapBytes / 1024).toFixed(1)} KB > ${LIMIT_MAP_BYTES / 1024} KB`);
}
if (baseCss.length > LIMIT_BASE_CSS_BYTES) {
	problems.push(`结构 CSS 超限：${(baseCss.length / 1024).toFixed(1)} KB > ${LIMIT_BASE_CSS_BYTES / 1024} KB`);
}
if (charCss.length > LIMIT_CHAR_CSS_BYTES) {
	problems.push(`字符 CSS 超限：${(charCss.length / 1024).toFixed(1)} KB > ${LIMIT_CHAR_CSS_BYTES / 1024} KB`);
}

// 规则条数不能用 css.match(/\{/g) 数：字形内容里存在 content: "{" 这类字面花括号
const scopedCount = (css) => css.split(`.${SCOPE_CLASS} `).length - 1;
for (const [name, css, n] of [
	['结构 CSS', baseCss, baseParts.length],
	['字符 CSS', charCss, charParts.length],
]) {
	if (n === 0) problems.push(`${name}为空 —— 字形将无法显示`);
	if (scopedCount(css) !== n) {
		problems.push(`${name}存在未加作用域前缀的规则 —— 会污染宿主正文渲染（规则 ${n} 条 / 前缀 ${scopedCount(css)} 处）`);
	}
}
if (!charCss.includes('content:')) problems.push('字符 CSS 缺少 content 属性 —— 字形将无法显示');
if (!baseCss.includes('mjx-math')) problems.push('结构 CSS 缺少 mjx-math 规则 —— 版面会错乱');
// 零网络请求是既定决策：任何 url() 都意味着运行时去取资源
if (/url\(/.test(baseCss) || /url\(/.test(charCss)) problems.push('CSS 含 url() —— 违反零网络请求约定');
if (/font-family/.test(baseCss) || /font-family/.test(charCss)) {
	problems.push('CSS 含 font-family —— 字体族必须由宿主提供');
}
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
 * SYMBOL_CHTML:            原始 latex（含 CURSOR 占位符）→ MathJax CHTML 片段。
 *                          键与 src/symbols/index.ts 的 latex 完全一致（含 \\u0000）。
 * SYMBOL_MATH_SCOPE:       作用域类名，下面两份 CSS 的每条规则都限定在其后代范围内，
 *                          防止覆盖宿主正文里已渲染的公式。
 * SYMBOL_BASE_CSS:         结构 CSS（mjx-container / mjx-math / mjx-frac …）。
 *                          已剔除 @font-face（含 CDN url）与 font-family 规则 ——
 *                          后者必须由宿主提供（宿主用 MJX-TEX-*，本仓构建期用 MJXTEX-*）。
 * SYMBOL_CHAR_CSS:         字符 CSS（mjx-c 的 ::before content + 度量）。
 *                          宿主 adaptiveCSS 只为「已渲染过的字符」生成规则，
 *                          面板里没渲染过的字符会空白，故须自带。
 * SYMBOL_RENDER_FALLBACKS: 渲染失败的 latex，按钮回退为文本 label（唯一真源，勿在别处复制）。
 */

export const SYMBOL_CHTML: Record<string, string> = {
${body}
};

/** 作用域类名：符号片段的包裹元素必须带这个类，CSS 才生效 */
export const SYMBOL_MATH_SCOPE = ${JSON.stringify(SCOPE_CLASS)};

/** 结构 CSS（不含字体族） */
export const SYMBOL_BASE_CSS = ${JSON.stringify(baseCss)};

/** 字符 CSS（字形 ::before content + 度量） */
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
console.log(`  结构 CSS ${kb(baseCss.length)} KB / ${baseParts.length} 条规则（上限 ${kb(LIMIT_BASE_CSS_BYTES)} KB）`);
console.log(`  字符 CSS ${kb(charCss.length)} KB / ${charParts.length} 条规则（上限 ${kb(LIMIT_CHAR_CSS_BYTES)} KB）`);
console.log(`  产出 ${OUT}`);
