/**
 * 非标准宏展开（纯逻辑，不依赖 Obsidian 宿主）
 *
 * 目标：把依赖 `\require{physics}` 等扩展才能渲染的命令，展开为标准 LaTeX，
 * 保证插入到笔记里的公式在任何环境下（GitHub、Typora、导出 PDF）都能渲染。
 * 规则保守：仅在命令形式明确匹配时替换，最多迭代 3 轮。
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
	// 定界符
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
