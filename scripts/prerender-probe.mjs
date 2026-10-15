/**
 * M1 探针：Node 侧 MathJax 全量预渲染可行性验证（只读诊断，不产出构建物）
 *
 * 回答四个问题：
 *   1. 真实 CHTML 片段长什么样（mjx-container / mjx-math / mjx-c 是否含文本内容）
 *   2. 全量 375 条（唯一 341）的体积账 —— 尤其 mjx-assistive-mml 这个大头
 *   3. CURSOR 占位符（\u0000）该怎么替换才不报错、且观感最好
 *   4. 渲染失败率（merror / 抛错），评估扩展包与宏的镜像需求
 *
 * 运行：node scripts/prerender-probe.mjs
 * 前置：需先用 esbuild 把符号表打成 ESM（见 scripts/prerender-symbols.mjs 的同一手法）
 */

import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------- 依赖加载

const { mathjax } = require('mathjax-full/js/mathjax.js');
const { TeX } = require('mathjax-full/js/input/tex.js');
const { CHTML } = require('mathjax-full/js/output/chtml.js');
const { liteAdaptor } = require('mathjax-full/js/adaptors/liteAdaptor.js');
const { RegisterHTMLHandler } = require('mathjax-full/js/handlers/html.js');
const { AllPackages } = require('mathjax-full/js/input/tex/AllPackages.js');

console.log('[版本] mathjax-full =', require('mathjax-full/package.json').version);

// ---------------------------------------------------------------- 引擎装配

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({ packages: AllPackages });

/** 两套配置对比：默认（含 assistive-mml） vs 关闭 assistive-mml */
const docDefault = mathjax.document('', { InputJax: tex, OutputJax: new CHTML({}) });
const docLean = mathjax.document('', {
	InputJax: tex,
	OutputJax: new CHTML({}),
});
docLean.options.enableAssistiveMml = false;

function renderWith(doc, latex) {
	const node = doc.convert(latex, { display: false });
	return adaptor.outerHTML(node);
}

// ---------------------------------------------------------------- 符号数据

const TMP = 'scripts/.tmp-symbols.mjs';
if (!existsSync(TMP)) {
	console.error(`[缺失] ${TMP} —— 请先执行 esbuild 打包符号表`);
	process.exit(1);
}
const { SYMBOL_GROUPS } = await import(`../${TMP}`);
const ALL = SYMBOL_GROUPS.flatMap((g) => g.items);
const UNIQUE_LATEX = [...new Set(ALL.map((i) => i.latex))];

const CURSOR = String.fromCharCode(0);
const withCursor = ALL.filter((i) => i.latex.includes(CURSOR));

console.log(`\n[数据] 分组 ${SYMBOL_GROUPS.length} / 条目 ${ALL.length} / 唯一 latex ${UNIQUE_LATEX.length}`);
console.log(`[数据] 含 CURSOR 占位符的条目 ${withCursor.length}`);

// ---------------------------------------------------------------- 1. 结构取证

console.log('\n========== 1. 真实片段结构（默认配置） ==========');
for (const sample of ['\\alpha', '\\frac{a}{b}', '\\sum_{i=1}^{n}']) {
	const html = renderWith(docDefault, sample);
	console.log(`\n--- ${sample} (${html.length} B) ---`);
	console.log(html.length > 420 ? `${html.slice(0, 420)} …` : html);
}

// ---------------------------------------------------------------- 2. CURSOR 占位符

console.log('\n========== 2. CURSOR 占位符处理对比 ==========');
const CURSOR_CASES = [
	['原样 \\u0000', (s) => s],
	['删除为空', (s) => s.split(CURSOR).join('')],
	['替换 \\square', (s) => s.split(CURSOR).join('\\square')],
	['替换 {}', (s) => s.split(CURSOR).join('{}')],
];
const cursorSamples = [
	`\\frac{${CURSOR}}{}`,
	`\\sqrt{${CURSOR}}`,
	`\\left( ${CURSOR} \\right)`,
];
for (const [name, fn] of CURSOR_CASES) {
	let ok = 0;
	let fail = 0;
	let sampleOut = '';
	const errSample = [];
	for (const latex of withCursor.map((item) => item.latex).slice(0, 40)) {
		try {
			const html = renderWith(docLean, fn(latex));
			if (html.includes('mjx-merror') || html.includes('data-mjx-error')) {
				fail += 1;
				if (errSample.length < 3) errSample.push(`merror: ${JSON.stringify(latex)}`);
			} else ok += 1;
		} catch (err) {
			fail += 1;
			if (errSample.length < 3) errSample.push(`${String(err).split('\n')[0]} ← ${JSON.stringify(latex)}`);
		}
	}
	if (errSample.length) console.log(`  失败样例: ${errSample.join(' | ')}`);
	console.log(`\n[${name}] 抽样 ${withCursor.slice(0, 40).length} 条：成功 ${ok} / 报错 ${fail}`);
	let out = '';
	try {
		out = renderWith(docLean, fn(cursorSamples[0]));
	} catch (err) {
		out = `【崩溃】${String(err).split('\n')[0]}`;
	}
	sampleOut = out.length > 300 ? `${out.slice(0, 300)} …` : out;
	console.log(`  样例 \\frac{CURSOR}{} → ${sampleOut.replace(/\n/g, '')}`);
}

// ---------------------------------------------------------------- 3. 体积账

console.log('\n========== 3. 全量体积账（唯一 latex 去重后） ==========');

const stripContainer = (html) =>
	html
		.replace(/^<mjx-container[^>]*>/, '')
		.replace(/<\/mjx-container>$/, '')
		.trim();

const stripAssistive = (html) => html.replace(/<mjx-assistive-mml[\s\S]*?<\/mjx-assistive-mml>/g, '');

const stats = { raw: 0, noAssistive: 0, lean: 0, fail: [] };
for (const latex of UNIQUE_LATEX) {
	const clean = latex.split(CURSOR).join('\\square');
	let html;
	try {
		html = renderWith(docDefault, clean);
	} catch (err) {
		stats.fail.push([latex, String(err).slice(0, 80)]);
		continue;
	}
	stats.raw += html.length;
	const noAssistive = stripAssistive(html);
	stats.noAssistive += noAssistive.length;
	stats.lean += stripContainer(noAssistive).length;
	if (html.includes('mjx-merror')) stats.fail.push([latex, 'merror']);
}

const kb = (b) => (b / 1024).toFixed(1);
const CURRENT_MAIN_KB = 115.9;
const GATE_KB = 300;

console.log(`\n唯一 latex 条数：${UNIQUE_LATEX.length}`);
console.log(`验证失败条目：${stats.fail.length}`);
if (stats.fail.length) {
	console.log('失败样例（前 10）：');
	for (const [latex, why] of stats.fail.slice(0, 10)) console.log(`  ${JSON.stringify(latex)} → ${why}`);
}

console.log('\n| 方案 | 字节 | KB |');
console.log('| --- | --- | --- |');
console.log(`| A 原样（含容器 + assistive-mml） | ${stats.raw} | ${kb(stats.raw)} |`);
console.log(`| B 去 assistive-mml | ${stats.noAssistive} | ${kb(stats.noAssistive)} |`);
console.log(`| C 去 assistive-mml + 去容器外壳（推荐） | ${stats.lean} | ${kb(stats.lean)} |`);

const leanKb = stats.lean / 1024;
console.log(`\n[结论] 方案 C 增量 ≈ ${kb(stats.lean)} KB`);
console.log(`       当前 main.js ${CURRENT_MAIN_KB} KB + 增量 ≈ ${(CURRENT_MAIN_KB + leanKb).toFixed(1)} KB`);
console.log(`       门禁 ${GATE_KB} KB → 余量 ${(GATE_KB - CURRENT_MAIN_KB - leanKb).toFixed(1)} KB`);
console.log(
	`       判定：${CURRENT_MAIN_KB + leanKb <= GATE_KB ? '全量预渲染 ✅ 可行（无需混合回退）' : '❌ 超限，需压缩或改混合方案'}`,
);

// ---------------------------------------------------------------- 4. 体积分布

console.log('\n========== 4. 单条片段体积分布（方案 C） ==========');
const sizes = UNIQUE_LATEX.map((latex) => {
	const clean = latex.split(CURSOR).join('\\square');
	try {
		return { latex, size: stripContainer(stripAssistive(renderWith(docDefault, clean))).length };
	} catch {
		return { latex, size: 0 };
	}
}).sort((a, b) => b.size - a.size);

console.log('最大的 8 条：');
for (const s of sizes.slice(0, 8)) console.log(`  ${String(s.size).padStart(5)} B  ${JSON.stringify(s.latex)}`);
console.log('最小的 5 条：');
for (const s of sizes.slice(-5)) console.log(`  ${String(s.size).padStart(5)} B  ${JSON.stringify(s.latex)}`);
const avg = sizes.reduce((sum, s) => sum + s.size, 0) / sizes.length;
console.log(`平均单条：${avg.toFixed(0)} B`);

// ---------------------------------------------------------------- 5. 字形来源（关键）

console.log('\n========== 5. 字形来源：adaptiveCSS 字符规则 ==========');
console.log('已证实：mjx-c 为空元素，字形由 CSS ::before content 提供（FontData.js:324-325）');
console.log('→ 预渲染片段必须自带字符 CSS，否则宿主未渲染过的字符会空白');

function collectCharCss(doc) {
	const out = doc.outputJax;
	const found = [];
	if (typeof out.getStyles === 'function') {
		try { found.push(['getStyles', out.getStyles()]); } catch { /* noop */ }
	}
	if (typeof out.styleSheet === 'function') {
		try { found.push(['styleSheet', out.styleSheet()]); } catch { /* noop */ }
	}
	try {
		const head = adaptor.head(doc.document);
		if (head) found.push(['head', adaptor.innerHTML(head)]);
	} catch { /* noop */ }
	return found;
}

for (const [name, val] of collectCharCss(docDefault)) {
	const text = typeof val === 'string' ? val : String(JSON.stringify(val));
	console.log(`\n[${name}] 长度 ${text.length} B`);
	console.log(text.length > 360 ? `${text.slice(0, 360)} …` : text);
}

console.log('\n[探针结束]');
