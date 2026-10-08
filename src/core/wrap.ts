/**
 * 字号 / 字体 / 颜色的 LaTeX 命令包裹（纯逻辑，不依赖 Obsidian 宿主）
 *
 * 约定：控件作用于编辑区的选区；无选区时作用于整段源码。
 * 包裹前先剥离同属性命令，避免 `\large\large` 式叠加。
 */

import type { FormulaStyle } from '../types';

export const SIZE_COMMANDS = [
	'\\tiny',
	'\\scriptsize',
	'\\footnotesize',
	'\\small',
	'\\normalsize',
	'\\large',
	'\\Large',
	'\\LARGE',
	'\\huge',
	'\\Huge',
] as const;

export const FONT_COMMANDS = [
	'\\mathrm',
	'\\mathit',
	'\\mathbf',
	'\\mathsf',
	'\\mathtt',
	'\\mathcal',
	'\\mathbb',
	'\\mathfrak',
	'\\boldsymbol',
] as const;

/** 颜色预设（值 → 色板色号，用于下拉色块） */
export const COLOR_PRESETS: ReadonlyArray<{ value: string; hex: string }> = [
	{ value: 'red', hex: '#e93147' },
	{ value: 'orange', hex: '#ec7500' },
	{ value: 'yellow', hex: '#e0ac00' },
	{ value: 'green', hex: '#08b94e' },
	{ value: 'cyan', hex: '#00bfbc' },
	{ value: 'blue', hex: '#086ddd' },
	{ value: 'purple', hex: '#7852ee' },
	{ value: 'magenta', hex: '#d53984' },
];

export type StyleKind = 'fontSize' | 'font' | 'color';

export interface StyleEdit {
	text: string;
	start: number;
	end: number;
}

/** 从 open 处的 `{` 开始，返回配对 `}` 的下标；未配对返回 -1 */
function scanGroup(text: string, open: number): number {
	let depth = 0;
	for (let i = open; i < text.length; i++) {
		const ch = text.charAt(i);
		if (ch === '\\') {
			i++;
			continue;
		}
		if (ch === '{') {
			depth++;
		} else if (ch === '}') {
			depth--;
			if (depth === 0) return i;
		}
	}
	return -1;
}

function skipSpace(text: string, i: number): number {
	while (i < text.length && /\s/.test(text.charAt(i))) i++;
	return i;
}

/** 匹配 `\cmd{...}` 形式且包裹整段文本 */
function matchSingleArg(
	text: string,
	commands: readonly string[],
): { cmd: string; inner: string } | null {
	for (const cmd of commands) {
		if (!text.startsWith(cmd)) continue;
		const i = skipSpace(text, cmd.length);
		if (text.charAt(i) !== '{') continue;
		const close = scanGroup(text, i);
		if (close !== text.length - 1) continue;
		return { cmd, inner: text.slice(i + 1, close) };
	}
	return null;
}

/**
 * 匹配**分组形式** `{ \cmd ... }` 且包裹整段文本。
 *
 * 字号命令（\small / \large / \Huge …）在 TeX/MathJax 中是**声明式**宏
 * （宿主 bundle 中定义为 `small:[SetSize,.9]`），不带花括号参数，
 * 作用域是「所在分组内的后续全部内容」。因此 `\small{a}b` 会让 `b`
 * 也变成小字号 —— 这不是 bug，而是声明式命令的固有语义。
 *
 * 正确的作用域写法是分组：`{\small a}`，字号只在该分组内生效，
 * 出了分组即回退默认字号。故本插件统一生成分组形式。
 */
function matchScopedSize(
	text: string,
	commands: readonly string[],
): { cmd: string; inner: string } | null {
	if (text.charAt(0) !== '{') return null;
	const close = scanGroup(text, 0);
	if (close !== text.length - 1) return null;
	const body = text.slice(1, close);
	const i = skipSpace(body, 0);
	for (const cmd of commands) {
		if (!body.startsWith(cmd, i)) continue;
		return { cmd, inner: body.slice(i + cmd.length).replace(/^\s+/, '') };
	}
	return null;
}

/** 字号：分组形式（现行，正确作用域）优先，兼容旧的 `\cmd{...}` 形式 */
function matchSize(text: string): { cmd: string; inner: string } | null {
	return matchScopedSize(text, SIZE_COMMANDS) ?? matchSingleArg(text, SIZE_COMMANDS);
}

/** 匹配 `\color{name}{...}` 形式且包裹整段文本 */
function matchColor(text: string): { color: string; inner: string } | null {
	if (!text.startsWith('\\color')) return null;
	const i = skipSpace(text, 6);
	if (text.charAt(i) !== '{') return null;
	const nameEnd = scanGroup(text, i);
	if (nameEnd < 0) return null;
	const j = skipSpace(text, nameEnd + 1);
	if (text.charAt(j) !== '{') return null;
	const bodyEnd = scanGroup(text, j);
	if (bodyEnd !== text.length - 1) return null;
	return { color: text.slice(i + 1, nameEnd), inner: text.slice(j + 1, bodyEnd) };
}

/** 反复剥离同属性命令，得到最内层原始内容 */
function stripRepeated(text: string, kind: StyleKind): string {
	let out = text;
	for (let guard = 0; guard < 8; guard++) {
		if (kind === 'color') {
			const m = matchColor(out);
			if (!m) return out;
			out = m.inner;
			continue;
		}
		if (kind === 'fontSize') {
			const size = matchSize(out);
			if (!size) return out;
			out = size.inner;
			continue;
		}
		const m = matchSingleArg(out, FONT_COMMANDS);
		if (!m) return out;
		out = m.inner;
	}
	return out;
}

/** 校验颜色值：合法 TeX 颜色名或 #RRGGBB */
export function isValidColor(value: string): boolean {
	const v = value.trim();
	if (/^#[0-9a-fA-F]{6}$/.test(v)) return true;
	return /^[a-zA-Z]+$/.test(v);
}

/**
 * 应用一个新的排版命令，返回新源码与新选区。
 * `value` 为空字符串时表示「恢复默认」，即解除该属性的包裹。
 */
export function applyStyleEdit(
	source: string,
	start: number,
	end: number,
	kind: StyleKind,
	value: string,
): StyleEdit {
	const hasSelection = end > start;
	const from = hasSelection ? start : 0;
	const to = hasSelection ? end : source.length;
	const target = source.slice(from, to);

	if (!target.trim()) return { text: source, start, end };

	const inner = stripRepeated(target, kind);

	let wrapped: string;
	if (!value) {
		wrapped = inner;
	} else if (kind === 'color') {
		if (!isValidColor(value)) return { text: source, start, end };
		wrapped = `\\color{${value}}{${inner}}`;
	} else if (kind === 'fontSize') {
		// 字号是声明式命令 → 必须用分组把作用域限制在包裹范围内，
		// 否则 `\small{a}b` 中的 `b` 会被一并缩小（超出包裹范围应回退默认字号）
		wrapped = `{${value} ${inner}}`;
	} else {
		wrapped = `${value}{${inner}}`;
	}

	return {
		text: source.slice(0, from) + wrapped + source.slice(to),
		start: from,
		end: from + wrapped.length,
	};
}

/** 从一段源码中判断最外层已应用的排版命令，用于回显控件状态 */
export function detectStyle(source: string): FormulaStyle {
	const text = source.trim();
	const style: FormulaStyle = { fontSize: '', font: '', color: '' };

	let cursor = text;
	for (let guard = 0; guard < 4; guard++) {
		const color = matchColor(cursor);
		if (color && !style.color) {
			style.color = color.color;
			cursor = color.inner;
			continue;
		}
		const size = matchSize(cursor);
		if (size && !style.fontSize) {
			style.fontSize = size.cmd;
			cursor = size.inner;
			continue;
		}
		const font = matchSingleArg(cursor, FONT_COMMANDS);
		if (font && !style.font) {
			style.font = font.cmd;
			cursor = font.inner;
			continue;
		}
		break;
	}

	return style;
}
