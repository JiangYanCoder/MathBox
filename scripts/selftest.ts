/**
 * MathBox 自检：纯逻辑层 + 数据表完整性
 * 运行：node scripts/selftest.mjs（先由 esbuild 打包）
 */

import { expandMacros } from '../src/core/macros';
import { buildInjectionPlan, EXTENSION_PACKAGES, defaultExtensionMap } from '../src/core/extensions';
import { SYMBOL_GROUPS } from '../src/symbols';
import { TEMPLATE_GROUPS } from '../src/templates';
import { CURSOR } from '../src/core/constants';

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

console.log('\n[1] 符号分组（需求指定的前十组顺序）');
const expectedOrder = [
	'common', 'greek', 'fraction', 'radical', 'limits',
	'trig', 'integral', 'bigop', 'bracket', 'matrix',
];
check('分组数量 >= 10', SYMBOL_GROUPS.length >= 10, `实际 ${SYMBOL_GROUPS.length}`);
check(
	'前十组顺序与需求一致',
	expectedOrder.every((id, i) => SYMBOL_GROUPS[i]?.id === id),
	SYMBOL_GROUPS.slice(0, 10).map((g) => g.id).join(','),
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

console.log(`\n结果：${failed === 0 ? '全部通过' : `${failed} 项失败`}\n`);
process.exit(failed === 0 ? 0 : 1);
