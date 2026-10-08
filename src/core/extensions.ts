/**
 * 启动扩展包（MathJax TeX extensions）
 *
 * 背景（M0 实测，见设计文档 §7.2）：Obsidian 桌面端只打包
 * `lib/mathjax/obsidian-mathjax.js`——该文件**内含** 30 个 TeX 扩展，
 * 但多数默认不启用。扩展必须在 MathJax **初始化之前**写进
 * `window.MathJax` 配置，否则本次会话只能退化为「宏等价实现」。
 *
 * 宿主实测行为（1.14.4，asar 反编译）：
 *  · 宿主渲染入口 `renderMath` = `MathJax.tex2chtml(src, {display})`；
 *  · 宿主在加载 `obsidian-mathjax.js` 的 before 钩子里**整体覆盖**
 *    `window.MathJax`，只配 `loader.paths`（字体目录）+ `tex.packages['[+]']`，
 *    **没有配置 CDN loader**——即宿主期望所有扩展都来自本地 bundle。
 *
 * 由此得出两条硬性约束（v3.2 修订，曾导致"mathjax.tex is not a function"）：
 *  1. **禁止写 `loader.load`**：宿主 bundle 不提供按需加载通道，写
 *     `load: ['[tex]/ams']` 会让 MathJax 去默认 CDN 取包 → 启动失败 →
 *     `tex2chtml` 等方法挂不上 → 渲染报「xxx is not a function」；
 *  2. **只写 `tex.packages['[+]']`**（与宿主同机制，包已预装在 bundle 中）
 *     与 `tex.macros`（仅插件自加、不与任何包重名的便捷宏）。
 *
 * 两条通道：
 *   A. 预加载注入（首选）：MathJax 尚未启动 → 合并 packages 与 macros；
 *   B. 已启动：不再注入任何宏——此时注入包等价宏会与已加载的包
 *      「命令已定义」冲突，且已初始化的 TeX 输入也不会重读配置；
 *      如实反馈 postload，由面板预览的 \require 前缀与插入时宏展开兜底。
 *
 * 另提供延迟补写（scheduleDeferredInjection）：宿主 before 钩子会整体覆盖
 * window.MathJax，故在其写完之后、MathJax 启动之前再补一次 packages。
 *
 * 本文件不 import "obsidian"，仅访问 window，可脱离宿主做单测。
 */

import type { Bilingual } from '../types';

export interface ExtensionPackage {
	/** 稳定 id，用于 data.json */
	id: string;
	name: Bilingual;
	desc: Bilingual;
	/** MathJax 扩展包名（进 loader.load 与 tex.packages['[+]']） */
	packages: readonly string[];
	/**
	 * 与「包自身命令」重名的等价宏：**只在包加载失败时**注入，
	 * 否则会与包的定义冲突（MathJax 报「命令已定义」）。
	 */
	macros: Readonly<Record<string, string>>;
	/**
	 * 插件自加的便捷宏：与任何扩展包都不重名，两条通道下都注入。
	 * 例：\\RR \\NN \\ZZ、\\argmax \\argmin。
	 */
	extraMacros: Readonly<Record<string, string>>;
	/** 默认是否启用 */
	defaultOn: boolean;
}

/** physics 宏等价层（~25 条高频命令，不依赖 physics 包） */
const PHYSICS_LITE: Readonly<Record<string, string>> = {
	'\\dd': '\\mathrm{d}',
	'\\dv': '\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}',
	'\\pdv': '\\frac{\\partial #1}{\\partial #2}',
	'\\vb': '\\mathbf{#1}',
	'\\va': '\\vec{#1}',
	'\\vu': '\\hat{#1}',
	'\\abs': '\\left|#1\\right|',
	'\\norm': '\\left\\lVert #1\\right\\rVert',
	'\\qty': '\\left(#1\\right)',
	'\\expval': '\\left\\langle #1\\right\\rangle',
	'\\bra': '\\left\\langle #1\\right|',
	'\\ket': '\\left|#1\\right\\rangle',
	'\\braket': '\\left\\langle #1\\right\\rangle',
	'\\Tr': '\\operatorname{Tr}',
	'\\tr': '\\operatorname{tr}',
	'\\rank': '\\operatorname{rank}',
	'\\erf': '\\operatorname{erf}',
	'\\Res': '\\operatorname{Res}',
	'\\sech': '\\operatorname{sech}',
	'\\csch': '\\operatorname{csch}',
	'\\grad': '\\nabla',
	'\\curl': '\\nabla\\times',
	'\\divergence': '\\nabla\\cdot',
	'\\laplacian': '\\nabla^{2}',
};

/** AMS 便捷宏（插件自加，均不与标准命令或 ams 包重名，可安全定义） */
const AMS_EXTRA: Readonly<Record<string, string>> = {
	'\\RR': '\\mathbb{R}',
	'\\NN': '\\mathbb{N}',
	'\\ZZ': '\\mathbb{Z}',
	'\\QQ': '\\mathbb{Q}',
	'\\CC': '\\mathbb{C}',
	'\\PP': '\\mathbb{P}',
	'\\HH': '\\mathbb{H}',
	'\\eps': '\\varepsilon',
	'\\half': '\\tfrac{1}{2}',
	'\\argmax': '\\operatorname{arg\\,max}',
	'\\argmin': '\\operatorname{arg\\,min}',
	'\\sgn': '\\operatorname{sgn}',
	'\\lcm': '\\operatorname{lcm}',
};

export const EXTENSION_PACKAGES: readonly ExtensionPackage[] = [
	{
		id: 'ams',
		name: { zh: 'AMS 数学包', en: 'AMS math' },
		desc: {
			zh: 'MathJax 包名 ams + mathtools：\\text、\\binom、\\boxed、多行对齐环境；并附带插件便捷宏 \\RR \\NN \\ZZ \\QQ \\CC、\\argmax、\\argmin、\\sgn、\\lcm',
			en: 'MathJax packages ams + mathtools: \\text, \\binom, \\boxed, alignment environments; plus \\RR \\NN \\ZZ \\QQ \\CC, \\argmax, \\argmin, \\sgn, \\lcm shortcuts',
		},
		packages: ['ams', 'mathtools'],
		macros: {},
		extraMacros: AMS_EXTRA,
		defaultOn: true,
	},
	{
		id: 'physics',
		name: { zh: 'physics 物理包', en: 'physics' },
		desc: {
			zh: '物理常用命令：\\dv \\pdv \\abs \\norm \\qty \\bra \\ket \\vb \\va 等；若宿主未预装则退化为等价宏',
			en: 'Physics commands: \\dv \\pdv \\abs \\norm \\qty \\bra \\ket \\vb \\va; falls back to equivalent macros if not bundled',
		},
		packages: ['physics'],
		macros: PHYSICS_LITE,
		extraMacros: {},
		defaultOn: true,
	},
	{
		id: 'mhchem',
		name: { zh: 'mhchem 化学包', en: 'mhchem' },
		desc: {
			zh: '化学式与反应式：\\ce{H2O}、\\ce{2H2 + O2 -> 2H2O}；该包为解析器扩展，无宏等价实现',
			en: 'Chemical formulas: \\ce{H2O}, \\ce{2H2 + O2 -> 2H2O}; parser extension, no macro equivalent',
		},
		packages: ['mhchem'],
		macros: {},
		extraMacros: {},
		defaultOn: false,
	},
	{
		id: 'color',
		name: { zh: 'color 颜色包', en: 'color' },
		desc: {
			zh: '\\color \\textcolor \\colorbox；面板「颜色」下拉依赖此包',
			en: '\\color \\textcolor \\colorbox; the panel color dropdown depends on this package',
		},
		packages: ['color'],
		macros: {},
		extraMacros: {},
		defaultOn: true,
	},
	{
		id: 'braket',
		name: { zh: 'braket 狄拉克包', en: 'braket' },
		desc: {
			zh: '量子力学符号：\\bra \\ket \\braket \\set',
			en: 'Dirac notation: \\bra \\ket \\braket \\set',
		},
		packages: ['braket'],
		macros: {
			'\\bra': '\\left\\langle #1\\right|',
			'\\ket': '\\left|#1\\right\\rangle',
			'\\braket': '\\left\\langle #1\\right\\rangle',
		},
		extraMacros: {},
		defaultOn: false,
	},
	{
		id: 'boldsymbol',
		name: { zh: 'boldsymbol 粗体符号', en: 'boldsymbol' },
		desc: {
			zh: '希腊字母与符号的斜体粗体：\\boldsymbol{\\alpha}',
			en: 'Bold italic Greek letters and symbols: \\boldsymbol{\\alpha}',
		},
		packages: ['boldsymbol'],
		macros: { '\\boldsymbol': '\\mathbf{#1}' },
		extraMacros: {},
		defaultOn: false,
	},
	{
		id: 'cancel',
		name: { zh: 'cancel 删除线', en: 'cancel' },
		desc: {
			zh: '约分与删除线：\\cancel \\bcancel \\xcancel \\cancelto',
			en: 'Strike-through: \\cancel \\bcancel \\xcancel \\cancelto',
		},
		packages: ['cancel'],
		macros: {},
		extraMacros: {},
		defaultOn: false,
	},
	{
		id: 'cases',
		name: { zh: 'cases 编号分段', en: 'cases' },
		desc: {
			zh: '带编号的分段函数环境：numcases / subnumcases',
			en: 'Numbered piecewise environments: numcases / subnumcases',
		},
		packages: ['cases'],
		macros: {},
		extraMacros: {},
		defaultOn: false,
	},
	{
		id: 'gensymb',
		name: { zh: 'gensymb 单位符号', en: 'gensymb' },
		desc: {
			zh: '单位与角度符号：\\degree \\celsius \\perthousand \\ohm \\micro',
			en: 'Units and angles: \\degree \\celsius \\perthousand \\ohm \\micro',
		},
		packages: ['gensymb'],
		macros: {
			'\\degree': '^{\\circ}',
			'\\celsius': '^{\\circ}\\mathrm{C}',
			'\\ohm': '\\Omega',
			'\\micro': '\\mu',
		},
		extraMacros: {},
		defaultOn: false,
	},
	{
		id: 'extpfeil',
		name: { zh: 'extpfeil 带字箭头', en: 'extpfeil' },
		desc: {
			zh: '可写文字的箭头：\\xrightarrow{f} \\xleftarrow{g}',
			en: 'Arrows with labels: \\xrightarrow{f} \\xleftarrow{g}',
		},
		packages: ['extpfeil'],
		macros: {},
		extraMacros: {},
		defaultOn: false,
	},
	{
		id: 'empheq',
		name: { zh: 'empheq 带框方程组', en: 'empheq' },
		desc: {
			zh: '给多行公式整体加框或背景：empheq + boxed',
			en: 'Box or highlight multi-line equations: empheq + boxed',
		},
		packages: ['empheq'],
		macros: {},
		extraMacros: {},
		defaultOn: false,
	},
	{
		id: 'upgreek',
		name: { zh: 'upgreek 正体希腊', en: 'upgreek' },
		desc: {
			zh: '直立希腊字母：\\upalpha \\upbeta \\uppi（符合 ISO 物理量排版习惯）',
			en: 'Upright Greek letters: \\upalpha \\upbeta \\uppi',
		},
		packages: ['upgreek'],
		macros: {},
		extraMacros: {},
		defaultOn: false,
	},
];

export const EXTENSION_IDS: readonly string[] = EXTENSION_PACKAGES.map((p) => p.id);

/** 默认开关表 */
export function defaultExtensionMap(): Record<string, boolean> {
	const map: Record<string, boolean> = {};
	for (const pkg of EXTENSION_PACKAGES) map[pkg.id] = pkg.defaultOn;
	return map;
}

export function getExtensionPackage(id: string): ExtensionPackage | undefined {
	return EXTENSION_PACKAGES.find((pkg) => pkg.id === id);
}

export interface InjectionPlan {
	/**
	 * 待启用的 MathJax 扩展包（写进 tex.packages['[+]']）。
	 * 注意：**不再**写入 loader.load——宿主 bundle 无按需加载通道，
	 * 写 loader 会触发网络取包并导致 MathJax 启动失败（见文件头）。
	 */
	load: string[];
	/** tex.packages['[+]'] 追加项（与 load 同源，宿主同机制） */
	packages: string[];
	/** tex.macros 定义 */
	macros: Record<string, string>;
	/** 无宏等价实现、只能靠真正加载包的启用项 */
	packageOnly: string[];
}

/**
 * 由开关表生成注入计划。
 *
 * `preload` 为 true 表示 MathJax 尚未初始化（可真正加载扩展包），
 * 此时**不会**注入与该包重名的宏，避免 MathJax 报「命令已定义」；
 * 为 false 时退化为只注入宏，无宏等价实现的包记入 `packageOnly`。
 * 插件自加宏（extraMacros）两条通道下都注入。
 */
export function buildInjectionPlan(
	enabled: Readonly<Record<string, boolean>>,
	preload: boolean,
): InjectionPlan {
	const load: string[] = [];
	const packages: string[] = [];
	const macros: Record<string, string> = {};
	const packageOnly: string[] = [];

	for (const pkg of EXTENSION_PACKAGES) {
		if (!enabled[pkg.id]) continue;

		// 插件自加宏：与扩展包无重名，始终注入
		Object.assign(macros, pkg.extraMacros);

		if (preload) {
			// tex.packages 用裸包名（宿主同机制，包已预装在宿主 bundle 中）
			for (const name of pkg.packages) load.push(name);
			packages.push(...pkg.packages);
			continue;
		}

		// 已启动路径：不注入包等价宏（会与已加载的包「命令已定义」冲突，
		// 且已初始化的 TeX 输入不会重读配置），只如实记录没有兜底的包
		if (Object.keys(pkg.macros).length === 0) packageOnly.push(pkg.id);
	}

	// 已启动路径下 macros 同样不生效，仅保留供设置页展示
	return { load, packages, macros: preload ? macros : {}, packageOnly };
}

/** 当前宿主是否已初始化 MathJax */
export function isMathJaxLoaded(): boolean {
	const w = window as unknown as { MathJax?: { startup?: { document?: unknown } } };
	return Boolean(w?.MathJax?.startup?.document);
}

export type InjectionMode = 'preload' | 'postload' | 'none';

export interface InjectionResult {
	mode: InjectionMode;
	plan: InjectionPlan;
}

/** window.MathJax 中与本模块相关的配置片段 */
interface MathJaxConfigSlice {
	tex?: {
		packages?: string[] | Record<string, unknown>;
		macros?: Record<string, string>;
	};
}

/**
 * 把扩展包配置合并进 `window.MathJax`（安全合并，不重建对象）。
 *
 * 关键约束：
 *  · **不碰 loader / output / options**——宿主在 before 钩子里整体覆盖
 *    window.MathJax，重建对象会丢掉宿主的字体路径与输出配置；
 *  · `tex.packages` 可能是对象（宿主形态 `{'[+]': [...]}`）也可能是数组，
 *    两种形态分别处理，**绝不把数组摊成索引对象**；
 *  · 只合并插件自加宏（不与任何包重名），避免「命令已定义」冲突。
 */
function mergeIntoMathJax(plan: InjectionPlan): void {
	const w = window as unknown as { MathJax?: MathJaxConfigSlice };
	const mj: MathJaxConfigSlice = w.MathJax ?? {};
	w.MathJax = mj;
	mergePlanInto(mj, plan);
}

/** 把计划合并到指定配置对象（宿主整体赋值 window.MathJax 时由其 setter 回调复用） */
function mergePlanInto(mj: MathJaxConfigSlice, plan: InjectionPlan): void {
	const tex = mj.tex ?? {};
	mj.tex = tex;

	const existing = tex.packages;
	if (Array.isArray(existing)) {
		tex.packages = dedupe([...existing, ...plan.packages]);
	} else if (existing && typeof existing === 'object') {
		const plus: string[] = Array.isArray(existing['[+]']) ? (existing['[+]'] as string[]) : [];
		existing['[+]'] = dedupe([...plus, ...plan.packages]);
	} else {
		tex.packages = { '[+]': dedupe([...plan.packages]) };
	}

	if (Object.keys(plan.macros).length > 0) {
		tex.macros = { ...(tex.macros ?? {}), ...plan.macros };
	}
}

/**
 * 把扩展包配置写入 `window.MathJax`。
 *
 * 幂等：重复调用只会合并，不会覆盖宿主自带配置。
 * MathJax 已启动时不再写入任何内容（见文件头约束 2），只如实反馈。
 */
export function applyExtensionInjection(
	enabled: Readonly<Record<string, boolean>>,
): InjectionResult {
	const preload = !isMathJaxLoaded();
	const plan = buildInjectionPlan(enabled, preload);

	if (plan.load.length === 0 && Object.keys(plan.macros).length === 0) {
		return { mode: 'none', plan };
	}
	if (!preload) return { mode: 'postload', plan };

	mergeIntoMathJax(plan);
	return { mode: 'preload', plan };
}

/**
 * 拦截宿主对 `window.MathJax` 的整体赋值（v3.2 关键机制）。
 *
 * 宿主在加载 `obsidian-mathjax.js` 的 before 钩子里执行
 * `window.MathJax = {…}` 覆盖式赋值——若只靠插件 onload 写入，配置必被丢掉。
 * 这里用属性访问器接管赋值：宿主一写入就立刻把我们的 packages / 便捷宏合并进去，
 * 随后脚本启动读取的便是合并后的配置，扩展包因此真正生效。
 *
 * 只在 MathJax 尚未启动时合并；已启动则写入无效且可能冲突。
 */
export function installMathJaxConfigGuard(
	getEnabled: () => Readonly<Record<string, boolean>>,
): void {
	const w = window as unknown as { MathJax?: MathJaxConfigSlice };
	let value: MathJaxConfigSlice | undefined = w.MathJax;

	Object.defineProperty(w, 'MathJax', {
		configurable: true,
		enumerable: true,
		get: () => value,
		set: (next: MathJaxConfigSlice | undefined) => {
			value = next;
			try {
				if (next && typeof next === 'object' && !isMathJaxLoaded()) {
					const plan = buildInjectionPlan(getEnabled(), true);
					if (plan.load.length > 0 || Object.keys(plan.macros).length > 0) {
						mergePlanInto(next, plan);
					}
				}
			} catch {
				// 注入失败绝不影响宿主渲染
			}
		},
	});
}

/**
 * 延迟补写（宿主 before 钩子会整体覆盖 window.MathJax）。
 *
 * 宿主在加载 obsidian-mathjax.js 前写入自己的配置，随后脚本加载并启动；
 * 这中间有数十到数百毫秒窗口。此处按 0/30/80/200/500/1200 ms 轮询：
 * 只要 MathJax 尚未启动就补写一次 packages，命中窗口即可真正生效；
 * 一旦检测到已启动则停止（此时写入无效且可能冲突）。
 */
export function scheduleDeferredInjection(enabled: Readonly<Record<string, boolean>>): void {
	const delays = [0, 30, 80, 200, 500, 1200];
	for (const ms of delays) {
		window.setTimeout(() => {
			if (isMathJaxLoaded()) return;
			const plan = buildInjectionPlan(enabled, true);
			if (plan.load.length === 0 && Object.keys(plan.macros).length === 0) return;
			mergeIntoMathJax(plan);
		}, ms);
	}
}

function dedupe(list: readonly string[]): string[] {
	return Array.from(new Set(list.filter((item) => item.length > 0)));
}
