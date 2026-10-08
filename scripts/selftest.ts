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
check('预加载：loader 带 [tex]/ 前缀', pre.load.every((l) => l.startsWith('[tex]/')), pre.load.join(','));
check('预加载：含 ams/mathtools/physics', ['ams', 'mathtools', 'physics'].every((p) => pre.packages.includes(p)));
check('预加载：不注入 physics 重名宏', !('\\dv' in pre.macros));
check('预加载：注入插件自加宏 \\RR', pre.macros['\\RR'] === '\\mathbb{R}');
check('预加载：注入 \\argmax / \\sgn / \\lcm', ['\\argmax', '\\sgn', '\\lcm'].every((k) => k in pre.macros));
check(
	'预加载：已加载包不记入 packageOnly',
	!pre.packageOnly.includes('ams') && !pre.packageOnly.includes('physics'),
);

const post = buildInjectionPlan(on, false);
check(
	'兜底：注入 physics 等价宏 \\dv',
	post.macros['\\dv'] === '\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}',
	String(post.macros['\\dv']),
);
check('兜底：注入 \\abs', post.macros['\\abs'] === '\\left|#1\\right|');
check('兜底：仍注入插件自加宏', post.macros['\\RR'] === '\\mathbb{R}');
check('兜底：无宏实现的 color 记入 packageOnly', post.packageOnly.includes('color'));

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

console.log(`\n结果：${failed === 0 ? '全部通过' : `${failed} 项失败`}\n`);
process.exit(failed === 0 ? 0 : 1);
