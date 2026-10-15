/**
 * 公式预览的纯逻辑（不碰 DOM、不依赖 obsidian）
 *
 * 放在 `core/` 是为让 `scripts/selftest.ts` 能直接 import 校验（core 禁止 import obsidian）。
 * 依赖 DOM 与宿主 MathJax 的渲染部分在 `src/panel/formulaView.ts`。
 */

import { CURSOR } from './constants';

/**
 * 需要 display（块级）模式渲染的环境
 *
 * 这些都是「天然多行」的结构：inline 模式下 MathJax 会把它们挤在一行内，
 * 与 Obsidian 正文 `$$ … $$` 的显示效果不一致。
 */
export const BLOCK_ENVS: ReadonlySet<string> = new Set([
	// 对齐 / 多行公式
	'align', 'align*', 'aligned', 'alignat', 'alignat*', 'alignedat',
	'gather', 'gather*', 'gathered', 'split', 'multline', 'multline*',
	'flalign', 'flalign*', 'eqnarray', 'eqnarray*', 'equation', 'equation*',
	// 分段 / 情形
	'cases', 'dcases', 'rcases', 'dcases*', 'rcases*',
	// 矩阵 / 行列式 / 数组
	'matrix', 'pmatrix', 'bmatrix', 'Bmatrix', 'vmatrix', 'Vmatrix',
	'smallmatrix', 'array', 'CD',
]);

/**
 * 判定一条公式是否应以块级（display）模式渲染。
 * 只看 `\begin{…}` 环境名；行内结构（分数 / 上下标 / 积分号…）一律 false。
 */
export function isBlockFormula(latex: string): boolean {
	const re = /\\begin\s*\{([A-Za-z*]+)\}/g;
	let match = re.exec(latex);
	while (match !== null) {
		if (BLOCK_ENVS.has(match[1] ?? '')) return true;
		match = re.exec(latex);
	}
	return false;
}

/**
 * 预览用的 LaTeX 源码：把光标占位符 `CURSOR`（`\u0000`）换成可见占位 `\square`。
 *
 * 该控制字符直接交给 MathJax 会让 `\frac` 一类命令在取参数时崩溃
 * （实测 `TypeError: Cannot read properties of null (reading '4')`），必须替换。
 * `\square`（空心方块）正好是符号表里已有的占位语义。
 */
export function previewSource(latex: string): string {
	return latex.split(CURSOR).join('\\square');
}
