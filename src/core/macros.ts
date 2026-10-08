/**
 * 非标准宏展开（纯逻辑，不依赖 Obsidian 宿主）
 *
 * 目标：把依赖 `\require{physics}` 等扩展才能渲染的命令，展开为标准 LaTeX，
 * 保证插入到笔记里的公式在任何环境下（GitHub、Typora、导出 PDF）都能渲染。
 * 规则保守：仅在命令形式明确匹配时替换，最多迭代 3 轮。
 *
 * ⚠️ 规则表必须覆盖 core/extensions.ts 中 PHYSICS_LITE / AMS_EXTRA / braket 的
 * 全部宏名。那些宏只在插件注入成功的会话（preload）里才存在，缺少展开规则时，
 * 插入的公式会"当场能渲染、换台机器/换个会话就报错"——尤其是**符号面板与模板
 * 一键插入的命令**（如 \argmax、\RR、\bra、\ket），用户根本不会察觉它不可移植。
 * 新增宏时请两边同步。
 */

interface MacroRule {
	re: RegExp;
	to: string;
}

const MACRO_RULES: readonly MacroRule[] = [
	// 微分算子
	{ re: /\\dv\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, to: '\\frac{\\mathrm{d}$1}{\\mathrm{d}$2}' },
	{ re: /\\dv\s*\{([^{}]*)\}/g, to: '\\frac{\\mathrm{d}}{\\mathrm{d}$1}' },
	{ re: /\\pdv\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, to: '\\frac{\\partial $1}{\\partial $2}' },
	{ re: /\\pdv\s*\{([^{}]*)\}/g, to: '\\frac{\\partial }{\\partial $1}' },
	{ re: /\\dd(?![a-zA-Z])/g, to: '\\mathrm{d}' },
	// 向量与单位向量
	{ re: /\\vb\s*\{([^{}]*)\}/g, to: '\\mathbf{$1}' },
	{ re: /\\va\s*\{([^{}]*)\}/g, to: '\\vec{$1}' },
	{ re: /\\vu\s*\{([^{}]*)\}/g, to: '\\hat{$1}' },
	// 向量微分算子（physics 习惯写法；均非标准 LaTeX 命令，不会与标准命令撞名）
	{ re: /\\grad(?![a-zA-Z])/g, to: '\\nabla' },
	{ re: /\\curl(?![a-zA-Z])/g, to: '\\nabla\\times' },
	{ re: /\\divergence(?![a-zA-Z])/g, to: '\\nabla\\cdot' },
	{ re: /\\laplacian(?![a-zA-Z])/g, to: '\\nabla^{2}' },
	// 定界符（braket 必须排在 bra / ket 之前：长命令优先，否则 \braket 会被 \bra 截走）
	{ re: /\\braket\s*\{([^{}]*)\}/g, to: '\\left\\langle $1\\right\\rangle' },
	{ re: /\\bra\s*\{([^{}]*)\}/g, to: '\\left\\langle $1\\right|' },
	{ re: /\\ket\s*\{([^{}]*)\}/g, to: '\\left|$1\\right\\rangle' },
	{ re: /\\abs\s*\{([^{}]*)\}/g, to: '\\left|$1\\right|' },
	{ re: /\\norm\s*\{([^{}]*)\}/g, to: '\\left\\lVert $1\\right\\rVert' },
	{ re: /\\expval\s*\{([^{}]*)\}/g, to: '\\left\\langle $1\\right\\rangle' },
	{ re: /\\qty\s*\(([^()]*)\)/g, to: '\\left($1\\right)' },
	{ re: /\\qty\s*\[([^[\]]*)\]/g, to: '\\left[$1\\right]' },
	{ re: /\\qty\s*\{([^{}]*)\}/g, to: '\\left\\{$1\\right\\}' },
	// 常见算子名（physics / mathtools 习惯写法）
	{ re: /\\Tr(?![a-zA-Z])/g, to: '\\operatorname{Tr}' },
	{ re: /\\tr(?![a-zA-Z])/g, to: '\\operatorname{tr}' },
	{ re: /\\rank(?![a-zA-Z])/g, to: '\\operatorname{rank}' },
	{ re: /\\erf(?![a-zA-Z])/g, to: '\\operatorname{erf}' },
	{ re: /\\Res(?![a-zA-Z])/g, to: '\\operatorname{Res}' },
	{ re: /\\sech(?![a-zA-Z])/g, to: '\\operatorname{sech}' },
	{ re: /\\csch(?![a-zA-Z])/g, to: '\\operatorname{csch}' },
	{ re: /\\argmax(?![a-zA-Z])/g, to: '\\operatorname{arg\\,max}' },
	{ re: /\\argmin(?![a-zA-Z])/g, to: '\\operatorname{arg\\,min}' },
	{ re: /\\sgn(?![a-zA-Z])/g, to: '\\operatorname{sgn}' },
	{ re: /\\lcm(?![a-zA-Z])/g, to: '\\operatorname{lcm}' },
	// 集合与数值快捷宏（插件自加，对应 core/extensions.ts 的 AMS_EXTRA；
	// 符号面板提供这些按钮，故必须在此展开，否则插入的笔记无法脱离插件渲染）
	{ re: /\\RR(?![a-zA-Z])/g, to: '\\mathbb{R}' },
	{ re: /\\NN(?![a-zA-Z])/g, to: '\\mathbb{N}' },
	{ re: /\\ZZ(?![a-zA-Z])/g, to: '\\mathbb{Z}' },
	{ re: /\\QQ(?![a-zA-Z])/g, to: '\\mathbb{Q}' },
	{ re: /\\CC(?![a-zA-Z])/g, to: '\\mathbb{C}' },
	{ re: /\\PP(?![a-zA-Z])/g, to: '\\mathbb{P}' },
	{ re: /\\HH(?![a-zA-Z])/g, to: '\\mathbb{H}' },
	{ re: /\\eps(?![a-zA-Z])/g, to: '\\varepsilon' },
	{ re: /\\half(?![a-zA-Z])/g, to: '\\tfrac{1}{2}' },
] as const;

/** 展开非标准宏；未命中时原样返回 */
export function expandMacros(latex: string): string {
	let out = latex;
	for (let pass = 0; pass < 3; pass++) {
		let changed = false;
		for (const rule of MACRO_RULES) {
			const next = out.replace(rule.re, rule.to);
			if (next !== out) {
				out = next;
				changed = true;
			}
		}
		if (!changed) break;
	}
	return out;
}

/** 源码中是否含有会被展开的宏（用于面板提示） */
export function countExpandableMacros(latex: string): number {
	let count = 0;
	for (const rule of MACRO_RULES) {
		const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : rule.re.flags + 'g');
		const matches = latex.match(re);
		if (matches) count += matches.length;
	}
	return count;
}
