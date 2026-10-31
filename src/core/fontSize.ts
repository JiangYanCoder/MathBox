/**
 * 预览区 / 编辑区字号（v3.4.1）
 *
 * 纯逻辑模块，**不依赖 obsidian**（core 层约束），供 settings 与面板共用：
 *  · PREVIEW_FONT_SIZE / EDITOR_FONT_SIZE —— 默认值、上下界（px）
 *  · normalizeFontSize —— 读入校验：非法回默认、越界夹取、非整数取整
 *  · stepFontSize      —— 步进（±1 px）并夹取，供加减号按钮调用
 *
 * ## 默认值为什么是实测值
 * 优先级要求「默认值按现状实测像素取值」，避免改版后观感漂移。
 * 2026-10-31 用无头 Chrome 加载 styles.css 实测（面板基础字号 13px）：
 *  · 预览 `.mathbox-math` = 1.35em × 13px = **17.55px**
 *  · 编辑 `.mathbox-textarea` = **13px**
 * 步长为 1 px、字号取整数，故预览默认值取最近整数 **18px**（+0.45px / +2.6%）。
 * 若日后面板基础字号变化，重新实测后同步这两个常量即可。
 */

/** 字号规格：上下界与默认值（单位 px，整数） */
export interface FontSizeSpec {
	/** 下界（含） */
	min: number;
	/** 上界（含） */
	max: number;
	/** 默认值（须落在 [min, max] 内） */
	def: number;
}

/** 渲染预览字号：实测基线 17.55px → 取整 18px；上界 30px（2026-10-31 王先生指定） */
export const PREVIEW_FONT_SIZE: FontSizeSpec = { min: 12, max: 30, def: 18 };

/** LaTeX 源码编辑框字号：实测基线 13px（与 .mathbox-textarea 一致）；上界同为 30px */
export const EDITOR_FONT_SIZE: FontSizeSpec = { min: 11, max: 30, def: 13 };

/**
 * 归一化字号：非法（非数字 / NaN / Infinity）回默认值，
 * 越界夹取到 [min, max]，小数取整（四舍五入）。
 *
 * 越界选择「夹取」而非「回默认」：手改 data.json 写入 100 时夹到 28 更符合直觉，
 * 且与 splitRatio / sidePaneWidth 的既有处理方式保持一致。
 */
export function normalizeFontSize(value: unknown, spec: FontSizeSpec): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return spec.def;
	const rounded = Math.round(value);
	if (rounded < spec.min) return spec.min;
	if (rounded > spec.max) return spec.max;
	return rounded;
}

/** 步进：在当前值基础上加 delta 并夹取（加减号按钮单次 ±1） */
export function stepFontSize(current: unknown, delta: number, spec: FontSizeSpec): number {
	return normalizeFontSize(normalizeFontSize(current, spec) + delta, spec);
}

/** 是否为默认字号（供「双击复位」判定是否需要写盘） */
export function isDefaultFontSize(value: unknown, spec: FontSizeSpec): boolean {
	return normalizeFontSize(value, spec) === spec.def;
}
