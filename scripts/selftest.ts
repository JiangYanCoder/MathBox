/**
 * MathBox 自检：纯逻辑层 + 数据表完整性
 * 运行：node scripts/selftest.mjs（先由 esbuild 打包）
 */

import { readFileSync } from 'node:fs';

import { expandMacros } from '../src/core/macros';
import { BLOCK_ENVS, isBlockFormula, previewSource } from '../src/core/formula';
import { buildInjectionPlan, EXTENSION_PACKAGES, defaultExtensionMap } from '../src/core/extensions';
import { SYMBOL_GROUPS } from '../src/symbols';
import { TEMPLATE_GROUPS } from '../src/templates';
import { CURSOR } from '../src/core/constants';
import {
	applyFontFaces,
	extractFontFaces,
	fontFamilyOf,
	hasFontFaces,
	replaceSrcWithDataUri,
} from '../src/core/fontFace';
import { SYMBOL_CHTML, SYMBOL_CHAR_CSS, SYMBOL_RENDER_FALLBACKS } from '../src/symbols/rendered.generated';

let failed = 0;

function check(name: string, cond: boolean, detail = ''): void {
	if (cond) {
		console.log(`  ok   ${name}`);
	} else {
		failed++;
		console.log(`  FAIL ${name} ${detail}`);
	}
}

/** 去掉转义花括号后的净花括号数 */
function braceBalance(tex: string): number {
	const cleaned = tex.replace(/\\\{/g, '').replace(/\\\}/g, '');
	let n = 0;
	for (const ch of cleaned) {
		if (ch === '{') n++;
		else if (ch === '}') n--;
	}
	return n;
}

console.log('\n[1] 符号分组（需求指定的分组顺序）');
// 2026-10-18 调整：二元关系 / 箭头 / 集合与逻辑 三组上移到希腊字母之后、分数之前
const expectedOrder = [
	'common', 'greek', 'relation', 'arrow', 'sets',
	'fraction', 'radical', 'limits', 'trig', 'integral',
	'bigop', 'bracket', 'matrix',
];
check('分组数量 = 13', SYMBOL_GROUPS.length === expectedOrder.length, `实际 ${SYMBOL_GROUPS.length}`);
check(
	'分组全序与需求一致（relation/arrow/sets 紧跟 greek）',
	expectedOrder.every((id, i) => SYMBOL_GROUPS[i]?.id === id),
	SYMBOL_GROUPS.map((g) => g.id).join(','),
);
const symIds = SYMBOL_GROUPS.map((g) => g.id);
check('分组 id 唯一', new Set(symIds).size === symIds.length);

const allSymbols = SYMBOL_GROUPS.flatMap((g) => g.items);
check('符号条目非空 label', allSymbols.every((s) => s.label.trim().length > 0));
check('符号条目非空 latex', allSymbols.every((s) => s.latex.trim().length > 0));
const badBrace = allSymbols.filter((s) => braceBalance(s.latex) !== 0);
check('符号 latex 花括号平衡', badBrace.length === 0, badBrace.map((s) => s.latex).slice(0, 5).join(' | '));

console.log('\n[2] 公式模板');
const tmplIds = TEMPLATE_GROUPS.map((g) => g.id);
check('模板分组 id 唯一', new Set(tmplIds).size === tmplIds.length);
const badTmplBrace = TEMPLATE_GROUPS.flatMap((g) => g.items).filter(
	(t) => braceBalance(t.latex.split(CURSOR).join('')) !== 0,
);
check(
	'模板 latex 花括号平衡',
	badTmplBrace.length === 0,
	badTmplBrace.map((t) => t.latex).slice(0, 3).join(' | '),
);
check('模板均含双语名称', TEMPLATE_GROUPS.flatMap((g) => g.items).every((t) => !!t.name.zh && !!t.name.en));

console.log('\n[3] 扩展包注入计划');
check('扩展包 id 唯一', new Set(EXTENSION_PACKAGES.map((p) => p.id)).size === EXTENSION_PACKAGES.length);
check(
	'宏名均以反斜杠开头',
	EXTENSION_PACKAGES.every((p) =>
		[...Object.keys(p.macros), ...Object.keys(p.extraMacros)].every((k) => k.startsWith('\\')),
	),
);
const def = defaultExtensionMap();
check('默认启用 ams', def['ams'] === true);
check('默认启用 physics', def['physics'] === true);
check('默认启用 color（颜色下拉依赖）', def['color'] === true);

const on = { ...defaultExtensionMap() };
const pre = buildInjectionPlan(on, true);
// v3.2 起只写 tex.packages['[+]']，**不再写 loader.load**：宿主 bundle 没有按需
// 加载通道，带 [tex]/ 前缀的包名会让 MathJax 去默认 CDN 取包 → 启动失败 →
// tex2chtml 挂不上 → 渲染报「xxx is not a function」（见 core/extensions.ts 头注释）
check(
	'预加载：包名为裸名，不得带 [tex]/ 前缀',
	[...pre.load, ...pre.packages].every((p) => !p.startsWith('[tex]/')),
	[...pre.load, ...pre.packages].join(','),
);
check('预加载：含 ams/mathtools/physics', ['ams', 'mathtools', 'physics'].every((p) => pre.packages.includes(p)));
check('预加载：不注入 physics 重名宏（会与包内定义冲突）', !('\\dv' in pre.macros));
check('预加载：注入插件自加宏 \\RR', pre.macros['\\RR'] === '\\mathbb{R}');
check('预加载：注入 \\argmax / \\sgn / \\lcm', ['\\argmax', '\\sgn', '\\lcm'].every((k) => k in pre.macros));
check(
	'预加载：已加载包不记入 packageOnly',
	!pre.packageOnly.includes('ams') && !pre.packageOnly.includes('physics'),
);

const post = buildInjectionPlan(on, false);
// 已启动路径下**一个宏都不注入**：与已加载的包重名会触发「命令已定义」，
// 且已初始化的 TeX 输入不会重读配置 —— 此时只如实记录没有宏兜底的包
check('已启动：不注入任何宏', Object.keys(post.macros).length === 0, Object.keys(post.macros).join(','));
check('已启动：无宏实现的 color 记入 packageOnly', post.packageOnly.includes('color'));

const onlyMhchem = { ...defaultExtensionMap(), ams: false, physics: false, color: false, mhchem: true };
const postChem = buildInjectionPlan(onlyMhchem, false);
check('mhchem 兜底：记入 packageOnly', postChem.packageOnly.includes('mhchem'));
check('mhchem 兜底：不产生错误宏', Object.keys(postChem.macros).length === 0);

const none = buildInjectionPlan({}, true);
check('全关：无注入项', none.load.length === 0 && Object.keys(none.macros).length === 0);

console.log('\n[4] 非标准宏展开（插入可移植性）');
check('\\dv{f}{x}', expandMacros('\\dv{f}{x}') === '\\frac{\\mathrm{d}f}{\\mathrm{d}x}', expandMacros('\\dv{f}{x}'));
check('\\abs{x} → \\left|', expandMacros('\\abs{x}') === '\\left|x\\right|');
check('\\qty(x) → \\left(', expandMacros('\\qty(x)') === '\\left(x\\right)');
check('普通 LaTeX 不被误改', expandMacros('\\frac{a}{b} + \\alpha') === '\\frac{a}{b} + \\alpha');

console.log('\n[5] 宏展开覆盖率（插入可移植性）');
// 宏表（extensions.ts）与展开规则（macros.ts）是两套并行机制：前者只在插件注入
// 成功的会话里存在，后者让插入的笔记自带可移植源码。二者一旦不同步，就会表现为
// 「当场能渲染、换个会话或换台机器就报错」—— 用户完全不会察觉。
const INTENDED_DIFF = new Set<string>(['\\qty']); // 规则按 ( [ { 分别生成括号，比单参数宏定义更精确
const macroTable = new Map<string, string>();
for (const pkg of EXTENSION_PACKAGES) {
	for (const table of [pkg.macros, pkg.extraMacros]) {
		for (const [name, def] of Object.entries(table)) macroTable.set(name, def);
	}
}

const missing: string[] = [];
const mismatched: string[] = [];
const intended: string[] = [];
for (const [name, def] of macroTable) {
	const twoArgs = def.includes('#1') && def.includes('#2');
	const input = twoArgs ? `${name}{x}{y}` : def.includes('#1') ? `${name}{x}` : name;
	const out = expandMacros(input);
	if (out === input) {
		missing.push(name);
		continue;
	}
	const want = def.split('#1').join('x').split('#2').join('y');
	if (out !== want) (INTENDED_DIFF.has(name) ? intended : mismatched).push(`${name}: ${out} ≠ ${want}`);
}
/**
 * 有意不展开的宏（列入白名单，且只允许是它们）。
 *
 * `\boldsymbol` 是标准 LaTeX（amsmath/amsbsy），MathJax 由 boldsymbol 扩展提供。
 * 展开成 `\mathbf` 会改变语义：`\mathbf` 不加粗希腊字母，`\boldsymbol{\alpha}`
 * 会退化成不粗的 α。故保留原样 —— 代价是它能否渲染取决于扩展包是否启用
 * （面板的字体下拉提供了这个选项，需留意）。
 */
const NOT_EXPANDED_BY_DESIGN = new Set<string>(['\\boldsymbol']);
const unexpectedMissing = missing.filter((n) => !NOT_EXPANDED_BY_DESIGN.has(n));
check(
	`宏表 ${macroTable.size} 个宏均有展开规则`,
	unexpectedMissing.length === 0,
	`缺规则：${unexpectedMissing.join(' ')}`,
);
check('展开结果与宏表定义等价（预览与笔记一致）', mismatched.length === 0, mismatched.join(' | '));
if (intended.length > 0) console.log(`  note 预期内差异：${intended.join(' | ')}`);

// 前缀相近的标准命令不得被误伤：\eps 不能咬掉 \varepsilon、\div 不能命中 \divergence
const standard = [
	'\\div', '\\epsilon', '\\varepsilon', '\\H', '\\P', '\\exp',
	'\\frac{a}{b}', '\\mathbb{R}', '\\gradient', '\\partial', '\\text{abc}',
];
check(
	'前缀相近的标准命令原样保留',
	standard.every((s) => expandMacros(s) === s),
	standard.filter((s) => expandMacros(s) !== s).join(' '),
);

// 无级联（展开结果再次展开不变）+ 花括号平衡
const allMacros = [...macroTable.keys()].join(' + ');
const once = expandMacros(allMacros);
check('二次展开无变化（无级联）', expandMacros(once) === once);
check('展开结果花括号平衡', braceBalance(once) === 0, `balance=${braceBalance(once)}`);

// 长命令优先：\braket 必须先于 \bra / \ket 匹配，否则被截断
check('\\braket{a} 不被 \\bra 截断', expandMacros('\\braket{a}') === '\\left\\langle a\\right\\rangle', expandMacros('\\braket{a}'));
check('\\braket{a|b} 竖线保留', expandMacros('\\braket{a|b}') === '\\left\\langle a|b\\right\\rangle');
check('带空格写法 \\bra {x} 同样生效', expandMacros('\\bra {x}') === '\\left\\langle x\\right|');

// 真正的回归闸门：符号面板 / 模板里**一键可插**的宏必须可展开。
// 用户不会去检查插入的源码能不能脱离本插件渲染，故此处必须挡住。
/** 该宏名是否以「命令」形式出现在文本里（后随字符不是字母，避免 \tr 命中 \triangle） */
function usesCommand(latex: string, name: string): boolean {
	let i = latex.indexOf(name);
	while (i >= 0) {
		if (!/[a-zA-Z]/.test(latex.charAt(i + name.length))) return true;
		i = latex.indexOf(name, i + 1);
	}
	return false;
}
const uiLatex = [
	...SYMBOL_GROUPS.flatMap((g) => g.items.map((s) => s.latex)),
	...TEMPLATE_GROUPS.flatMap((g) => g.items.map((t) => t.latex)),
];
const uiMacros = [...macroTable.keys()].filter((name) => uiLatex.some((l) => usesCommand(l, name)));
const unexpandable = uiMacros.filter((name) => expandMacros(name) === name);
check(
	`符号表/模板一键可插的宏均可展开（命中 ${uiMacros.length} 个）`,
	unexpandable.length === 0,
	unexpandable.join(' '),
);

// ---------------------------------------------------------------------------
// 符号预渲染产物契约：src/symbols/rendered.generated.ts 由构建期脚本生成（不入库）。
// 这里挡住两类回归：(1) 符号表新增条目却没渲染成功；(2) 产物膨胀突破体积预算。
console.log('\n[8] 符号预渲染产物契约');
const fallbackSet = new Set(SYMBOL_RENDER_FALLBACKS);
const uniqueSymbolLatex = [...new Set(allSymbols.map((s) => s.latex))];
const unmapped = uniqueSymbolLatex.filter((l) => !(l in SYMBOL_CHTML) && !fallbackSet.has(l));
check(
	`每条 latex 都有片段或已登记回退（${Object.keys(SYMBOL_CHTML).length} 片段 / ${SYMBOL_RENDER_FALLBACKS.length} 回退）`,
	unmapped.length === 0,
	unmapped.slice(0, 5).map((l) => JSON.stringify(l)).join(' | '),
);
const brokenFragments = Object.entries(SYMBOL_CHTML).filter(
	([, html]) => !html.includes('mjx-math') || html.includes('mjx-merror'),
);
check(
	'片段均为有效 CHTML（含 mjx-math、无 merror）',
	brokenFragments.length === 0,
	brokenFragments.slice(0, 3).map(([l]) => JSON.stringify(l)).join(' | '),
);
const nulFragments = Object.values(SYMBOL_CHTML).filter((html) => html.includes(CURSOR));
check('片段不含未替换的 CURSOR（渲染前已换成占位符）', nulFragments.length === 0);
check('字符 CSS 含 .mjx-c 字形规则', SYMBOL_CHAR_CSS.includes('.mjx-c'));
check('字符 CSS 含 ::before content（否则按钮空白）', SYMBOL_CHAR_CSS.includes('content:'));
const fragKb = Object.values(SYMBOL_CHTML).join('').length / 1024;
const cssKb = SYMBOL_CHAR_CSS.length / 1024;
const totalKb = fragKb + cssKb;
check(
	`片段 + 字符 CSS 在预算内（${fragKb.toFixed(1)} + ${cssKb.toFixed(1)} = ${totalKb.toFixed(1)} KB ≤ 160 KB）`,
	totalKb <= 160,
);

console.log('\n[9] 构建链与体积门禁');
const readRepo = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const pkg = JSON.parse(readRepo('package.json')) as { scripts?: Record<string, string> };
const buildScript = pkg.scripts?.build ?? '';
check(
	'build 先预渲染、后 tsc（产物是类型检查对象，顺序反了会编译失败）',
	buildScript.includes('prerender') && buildScript.indexOf('prerender') < buildScript.indexOf('tsc'),
	buildScript,
);
check('体积门禁已放宽到 300 KB', /const GATE_KB = 300;/.test(readRepo('scripts/check-size.mjs')));
const packScript = readRepo('scripts/package.mjs');
// 用实际命令串定位（注释里也提到 tsc，按裸 'tsc' 匹配会命中文案而非调用）
const packPrerenderAt = packScript.indexOf("['scripts/prerender-symbols.mjs']");
const packTscAt = packScript.indexOf('typescript/bin/tsc');
check(
	'package 同样先预渲染、后 tsc',
	packPrerenderAt >= 0 && packTscAt > packPrerenderAt,
	`prerender@${packPrerenderAt} tsc@${packTscAt}`,
);

// ---------------------------------------------------------------------------
// 公式模板 / 收藏夹的「渲染化」契约（2026-10-15）
//  1) 模板不得收录快捷工具里已有的条目（用户要求去重，快捷工具面板不动）
//  2) 块级判定与光标占位替换必须正确（错了会渲染崩溃或观感错乱）
console.log('\n[10] 公式模板去重与预览渲染契约');
const symbolLatexSet = new Set(allSymbols.map((s) => s.latex));
const dupWithSymbols = TEMPLATE_GROUPS.flatMap((g) =>
	g.items.filter((item) => symbolLatexSet.has(item.latex)).map((item) => `${g.id}/${item.name.zh}`),
);
check(
	`模板不与快捷工具重复（当前 ${TEMPLATE_GROUPS.reduce((n, g) => n + g.items.length, 0)} 条）`,
	dupWithSymbols.length === 0,
	dupWithSymbols.join(' | '),
);

// 块级判定：多行环境走 display，行内结构走 inline
const blockCases: Array<[string, boolean]> = [
	['\\begin{cases} x \\\\ y \\end{cases}', true],
	['\\begin{align} a &= b \\end{align}', true],
	['\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', true],
	['\\begin{aligned} x &= y \\end{aligned}', true],
	['\\begin{array}{cl} a & b \\end{array}', true],
	['E = mc^{2}', false],
	['\\frac{\\partial f}{\\partial x}', false],
	['\\int_{a}^{b} f(x)\\,\\mathrm{d}x', false],
	['\\sum_{n=1}^{\\infty} a_{n}', false],
];
const wrongBlock = blockCases.filter(([tex, want]) => isBlockFormula(tex) !== want);
check(
	'块级判定：多行环境 display、行内结构 inline',
	wrongBlock.length === 0,
	wrongBlock.map(([tex, want]) => `${tex} 期望 ${want}`).join(' | '),
);
check('块级环境表非空且含常用环境', BLOCK_ENVS.size > 20 && BLOCK_ENVS.has('cases') && BLOCK_ENVS.has('matrix'));

// 光标占位符必须替换为可见占位：NUL 直送 MathJax 会让 \frac 取参崩溃
const withCursor = `\\frac{${CURSOR}}{}`;
const previewed = previewSource(withCursor);
check('预览源码已替换 CURSOR', !previewed.includes(CURSOR) && previewed.includes('\\square'), previewed);
check('预览源码不误伤普通 LaTeX', previewSource('\\frac{a}{b}') === '\\frac{a}{b}');
const tmplWithCursor = TEMPLATE_GROUPS.flatMap((g) => g.items).filter((item) => item.latex.includes(CURSOR));
check(
	`含 CURSOR 的模板（${tmplWithCursor.length} 条）预览源码均不含 NUL`,
	tmplWithCursor.every((item) => !previewSource(item.latex).includes(CURSOR)),
);

// 渲染容器样式：不做定高 / 不裁剪，高度由公式实际高度撑开
const cssText = readRepo('styles.css');
// 只取**行首**的基础块（`m` 标志）：`.mathbox-symbol .mathbox-formula {…}` 是按钮内的特化覆盖，
// 不带 overflow-x → 若不限定行首会被它抢先匹配
const formulaBlock = /^\.mathbox-formula\s*\{[^}]*\}/m.exec(cssText)?.[0] ?? '';
check('公式容器未设固定高度（高度自适应）', !/height\s*:/.test(formulaBlock), formulaBlock.slice(0, 120));
check('公式容器允许横向滚动（超宽公式不裁切）', /overflow-x:\s*auto/.test(formulaBlock));
check('已渲染态把字号钉到正文默认字号（与笔记公式视觉一致）', /\.mathbox-formula\.is-rendered\s*\{[^}]*font-size:\s*var\(--font-text-size/.test(cssText));
check('已渲染态归零宿主块级容器外边距', /\.mathbox-formula\.is-rendered\s*>\s*mjx-container\s*\{[^}]*margin:\s*0\s*!important/.test(cssText));

// 两处接入点：模板 buildTemplate 与收藏 buildFavoriteRow 都挂公式容器
const sideSrc = readRepo('src/panel/sections/sideSection.ts');
check('模板条目挂公式容器', /mountFormula\(btn,\s*item\.latex/.test(sideSrc));
check('收藏条目挂公式容器', /mountFormula\(main,\s*item\.latex/.test(sideSrc));
check('模板与收藏列表重建后均触发渲染', (sideSrc.match(/renderFormulaIn\(sections\)/g) ?? []).length === 2);
// ---------------------------------------------------------------- 快捷工具面板渲染化（2026-10-18）
check('快捷工具按钮挂公式容器（宿主 renderMath）', /mountSymbolMath\(btn,\s*display,\s*item\.label\)/.test(sideSrc));
check('快捷工具走懒渲染（首屏若干条 + 视口触发）', /renderSymbolsLazy\(body\)/.test(sideSrc));
check(
	'展示用 latex 优先取 displayLatex',
	/item\.displayLatex \?\? previewSource\(item\.latex\)/.test(sideSrc),
);
check(
	'符号按钮绑定悬停浮层（第一行 latex、第二行备注）',
	/tip\.attach\(btn/.test(sideSrc) && /remark: item\.remark\?\.\[ctx\.lang\]/.test(sideSrc),
);
check('浮层组件按当前语言取备注并延迟显示', /SHOW_DELAY/.test(readRepo('src/panel/floatingTooltip.ts')));

// ---- 符号表数据契约：矩阵案例 / 展示用 latex / 备注覆盖 ----
const matrixItems = SYMBOL_GROUPS.find((g) => g.id === 'matrix')?.items ?? [];
check('矩阵组已删除单独的 2×2 条目', !matrixItems.some((i) => i.label === '2×2'));

const MATRIX_ENV = /\\begin\{(?:[pbBvV]?matrix|smallmatrix)\}/;
const wrongMatrixCase = matrixItems.filter((i) => MATRIX_ENV.test(i.displayLatex ?? '') && !(i.displayLatex ?? '').includes('a_{11}'));
check(
	'矩阵类展示案例用 a₁₁… 表示行列（a_{行列}）',
	wrongMatrixCase.length === 0,
	wrongMatrixCase.map((i) => i.label).join(' '),
);

const caseItems = matrixItems.filter((i) => i.displayLatex !== undefined);
check(
	`矩阵 / 多行条目均给出展示案例（${caseItems.length} 条）`,
	caseItems.length >= 15,
	String(caseItems.length),
);
check(
	'展示案例不进入插入内容（插入不含 a₁₁ 等样例字母）',
	caseItems.every((i) => !i.latex.includes('a_{')),
	caseItems.filter((i) => i.latex.includes('a_{')).map((i) => i.label).join(' '),
);

// 矩阵环境插入的应是「2×2 空骨架」：含 & 列分隔与 \\ 行分隔，但不含样例字母
const MATRIX_ENVS2 = ['pmatrix', 'bmatrix', 'vmatrix', 'Vmatrix', 'Bmatrix', 'matrix', 'smallmatrix'];
const skeletonBad = MATRIX_ENVS2.filter((env) => {
	const item = matrixItems.find((i) => i.latex.includes(`\\begin{${env}}`));
	if (!item) return true;
	return !(item.latex.includes('&') && item.latex.includes('\\\\'));
});
check(
	`矩阵环境插入 2×2 骨架（含 & 与 \\\\，${MATRIX_ENVS2.length} 种）`,
	skeletonBad.length === 0,
	skeletonBad.join(' '),
);

// 下标堆叠与带后缀 label 的条目：按渲染宽度显式收窄为 2 列
const NARROW_TO_2 = ['substack', '≈ 约等', '≡ 恒等', '∅ 变体', '∂²y/∂x²'];
const narrowBad = NARROW_TO_2.filter((label) => allSymbols.find((i) => i.label === label)?.span !== 2);
check(
	`指定条目按钮宽度为 2 列（${NARROW_TO_2.join('、')}）`,
	narrowBad.length === 0,
	narrowBad.join(' '),
);

const cursorInDisplay = allSymbols.filter((i) => i.displayLatex?.includes(CURSOR));
check(
	'displayLatex 不含 CURSOR（展示用必须是可直接渲染的完整公式）',
	cursorInDisplay.length === 0,
	cursorInDisplay.map((i) => i.label).join(' '),
);

const abItems = (SYMBOL_GROUPS.find((g) => g.id === 'fraction')?.items ?? []).filter((i) => i.label.startsWith('a/b'));
check(
	`分数条目展示 a/b 真实分式而非占位方块（${abItems.length} 条）`,
	abItems.length >= 4 && abItems.every((i) => i.displayLatex !== undefined && !(i.displayLatex ?? '').includes('\\square')),
	abItems.map((i) => `${i.label}=${i.displayLatex ?? '(无)'}`).join(' '),
);

// ---- 悬停备注：全部 13 组覆盖（2026-10-18 第二批补齐 relation…matrix 共 245 条）----
const remarkMissing = SYMBOL_GROUPS.flatMap((group) =>
	group.items.filter((i) => !i.remark?.zh || !i.remark?.en).map((i) => `${group.id}/${i.label}`),
);
const remarkTotal = allSymbols.length;
check(
	`全部分组悬停备注全覆盖（${remarkTotal} 条）`,
	remarkMissing.length === 0,
	remarkMissing.slice(0, 8).join(' | '),
);
check(
	'备注中英双语且互不相同',
	allSymbols.every((i) => (i.remark?.zh ?? '') !== (i.remark?.en ?? '')),
);

// ---- 按钮尺寸：分式 / 矩阵渲染后纵向更高，样式按分组抬下限 ----
check(
	'快捷工具网格带 data-group（供按分组调尺寸）',
	/attr: \{ 'data-group': group\.id \}/.test(sideSrc),
);
check(
	'分式与矩阵按钮留足渲染高度',
	/\.mathbox-symbol-grid\[data-group="fraction"\]\s+\.mathbox-symbol\s*\{[^}]*min-height:\s*54px/.test(cssText) &&
		/\.mathbox-symbol-grid\[data-group="matrix"\]\s+\.mathbox-symbol\s*\{[^}]*min-height:\s*74px/.test(cssText),
);
check('极限对数组已删除 argmax / argmin', !allSymbols.some((i) => i.label === 'argmax' || i.label === 'argmin'));

// ---- 2026-10-18 第三批：分式收窄 / 连分数迁移 / 积分加宽加高 / 删换行符 ----
const fracItems = SYMBOL_GROUPS.find((g) => g.id === 'fraction')?.items ?? [];
const abItems2 = fracItems.filter((i) => i.label.startsWith('a/b'));
check(
	`分式 a/b 类显式 span 1 收窄（${abItems2.length} 条）`,
	abItems2.length >= 3 && abItems2.every((i) => i.span === 1),
	abItems2.map((i) => `${i.label}=${i.span ?? '缺省'}`).join(' '),
);
check('连分数已从快捷工具移除', !allSymbols.some((i) => i.label === '连分数'));
check(
	'公式模板「分数与根式」收录连分数',
	(TEMPLATE_GROUPS.find((g) => g.id === 'fraction')?.items ?? []).some(
		(i) => i.name.zh === '连分数' && i.latex.includes('\\cfrac'),
	),
);
check('矩阵组换行符条目已删除', !allSymbols.some((i) => i.label === '\\\\'));

const integralItems = SYMBOL_GROUPS.find((g) => g.id === 'integral')?.items ?? [];
check(
	'积分长公式显式跨列（不定积分 span 3 / 区域 D 二重积分 span 4）',
	integralItems.find((i) => i.label === '∫fⅆx')?.span === 3 &&
		integralItems.find((i) => i.label === '∫∫ 域')?.span === 4,
	integralItems
		.filter((i) => i.span !== undefined)
		.map((i) => `${i.label}=${i.span}`)
		.join(' '),
);
check(
	'积分组按钮留足高度（min-height 52px）',
	/\.mathbox-symbol-grid\[data-group="integral"\]\s+\.mathbox-symbol\s*\{[^}]*min-height:\s*52px/.test(cssText),
);
check(
	'span 字段在合理区间（1–4）',
	allSymbols.every((i) => i.span === undefined || (i.span >= 1 && i.span <= 4)),
);

// ---- 编辑已有公式时不得重复包裹定界符（2026-10-19 修复）----
// 右键双击公式会把 $ / $$ 一起选中：预填若不剥，插入时再包一层 → $$x$$ 重复
const modalSrc = readRepo('src/panel/MathBoxModal.ts');
const commandSrc = readRepo('src/commands/index.ts');
check(
	'预填前剥定界符（stripDelimiters 作用于 prefill）',
	/stripDelimiters\(this\.options\.prefill/.test(modalSrc),
);
check('插入前防御性剥定界符（源码区残留 $…$ 时）', /let latex = stripDelimiters\(source\)/.test(modalSrc));
check(
	'两个入口都先把选区扩展到定界符（右键菜单 + 快捷键）',
	(commandSrc.match(/expandToFormula\(editor\)/g) ?? []).length === 2,
	String((commandSrc.match(/expandToFormula\(editor\)/g) ?? []).length),
);

// ---- 图像导出：字体必须内联（SVG-as-image 不加载外部资源）----
console.log('\n[12] 图像导出的字体内联');
const FONT_CSS = [
	'@font-face{font-family:"MJX-TEX-I";src:url("app://obsidian.md/lib/mathjax/tex-font/chtml/woff2/mjx-tex-i.woff2") format("woff2")}',
	'@font-face { font-family: MJX-TEX-N; src: url(app://x/mjx-tex-n.woff2); }',
	'mjx-container{display:inline-block}',
].join('\n');
// MathJax 的真实写法：`{` 前带编号注释（宿主与 mathjax-full 均如此）
const ANNOTATED_CSS =
	'@font-face /* 0 */ {\n  font-family: MJXZERO;\n  src: url(\'woff2/MathJax_Zero.woff\') format(\'woff\');\n}\n' +
	'@font-face /* 1 */ {\n  font-family: MJXTEX;\n  src: url(\'woff2/MathJax_Main-Regular.woff\') format(\'woff\');\n}';

const faces = extractFontFaces(FONT_CSS);
check(`解析出 2 个 @font-face（实际 ${faces.length}）`, faces.length === 2, String(faces.length));
check('提取 url（带引号）', faces[0]?.url?.endsWith('mjx-tex-i.woff2') === true, faces[0]?.url ?? '(none)');
check('提取 url（无引号）', faces[1]?.url === 'app://x/mjx-tex-n.woff2', faces[1]?.url ?? '(none)');
check('无 @font-face 的样式表返回空', extractFontFaces('mjx-container{display:block}').length === 0);

const annotated = extractFontFaces(ANNOTATED_CSS);
check(
	`识别带编号注释的 @font-face（MathJax 真实写法，${annotated.length} 个）`,
	annotated.length === 2,
	String(annotated.length),
);
check(
	'注释写法下仍能取到家族名与字体地址',
	annotated[0]?.url === 'woff2/MathJax_Zero.woff' && fontFamilyOf(annotated[0]?.body ?? '') === 'MJXZERO',
	`${annotated[0]?.url ?? '(none)'} / ${fontFamilyOf(annotated[0]?.body ?? '')}`,
);

const firstBody = faces[0]?.body ?? '';
const rewrittenBody = replaceSrcWithDataUri(firstBody, 'data:font/woff2;base64,AA==');
check(
	'src 被替换为 data:URI 且不残留原地址',
	rewrittenBody.includes('url(data:font/woff2;base64,AA==)') && !rewrittenBody.includes('app://'),
	rewrittenBody,
);
const patched = applyFontFaces(
	FONT_CSS,
	new Map([[faces[0]?.block ?? '', `@font-face {${rewrittenBody}}`]]),
);
check(
	'改写只影响目标块，其余 @font-face 保留',
	patched.includes('data:font/woff2;base64,AA==') && patched.includes('mjx-tex-n.woff2'),
);
check('hasFontFaces 判定', hasFontFaces(FONT_CSS) && !hasFontFaces('a{color:red}'));

const svgSrc = readRepo('src/exporter/svg.ts');
check(
	'快照导出按字体集合内联（精确收集 + 加载集回退）',
	/inlineFontFaces\(mjxCss,\s*only\)/.test(svgSrc) &&
		/usedFamilies\.size > 0 \? usedFamilies : loadedFontFamilies\(\)/.test(svgSrc),
);
check('只内联 MJX 前缀且 status=loaded 的字体', /family\.startsWith\('MJX'\) && face\.status === 'loaded'/.test(svgSrc));
check('快照导出为异步（需等待字体转码）', /export async function buildSnapshotSvg/.test(svgSrc));
check('快照字号取容器计算值（不再硬编码 16px）', /getComputedStyle\(container\)\.fontSize/.test(svgSrc));

// ---- 导出背景设置 + 体积相关契约 ----
console.log('\n[13] 导出背景设置');
const settingsSrc = readRepo('src/settings.ts');
check("默认导出背景为白色", /exportBackground:\s*'white'/.test(settingsSrc));
check(
	'normalize 接受 transparent 并回退非法值',
	/data\.exportBackground === 'transparent'/.test(settingsSrc) && /data\.exportBackground === 'white'/.test(settingsSrc),
);
check('画布底色由设置决定', /options\.background \?\? 'white'/.test(svgSrc));
check('透明背景不绘制白底 rect', /isWhite\s*\n?\s*\?/.test(svgSrc));
check(
	'i18n 双语均新增导出背景设置项',
	/settings\.exportBackground'/.test(readRepo('src/i18n/zh.ts')) &&
		/settings\.exportBackground'/.test(readRepo('src/i18n/en.ts')),
);
check(
	'只内联公式实际用到的字体，且失败回退全量',
	/collectUsedFamilies\(clone\)/.test(svgSrc) && /inlined\.inlined === 0 && only\.size > 0/.test(svgSrc),
);

console.log(`\n结果：${failed === 0 ? '全部通过' : `${failed} 项失败`}\n`);
process.exit(failed === 0 ? 0 : 1);