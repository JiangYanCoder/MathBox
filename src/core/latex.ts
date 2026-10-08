/**
 * LaTeX 文本工具（纯逻辑，不依赖 Obsidian 宿主）
 */

/** 去掉粘贴文本外层可能带有的数学定界符 */
export function stripDelimiters(input: string): string {
	let out = input.trim();
	const pairs: ReadonlyArray<readonly [string, string]> = [
		['$$', '$$'],
		['\\[', '\\]'],
		['\\(', '\\)'],
		['$', '$'],
	];
	for (const [open, close] of pairs) {
		if (
			out.length > open.length + close.length &&
			out.startsWith(open) &&
			out.endsWith(close)
		) {
			out = out.slice(open.length, out.length - close.length);
			break;
		}
	}
	return out.trim();
}

/** 判断一段文本是否"形似 LaTeX"，用于打开面板时预填选区 */
export function looksLikeLatex(input: string): boolean {
	const s = input.trim();
	if (!s) return false;
	if (s.startsWith('$') || s.startsWith('\\(') || s.startsWith('\\[')) return true;
	if (s.startsWith('\\')) return true;
	if (/\\[a-zA-Z]+/.test(s)) return true;
	return /[_^]\s*\{?/.test(s);
}

/** 剥离最外层的 `\begin{env} ... \end{env}`，返回内部内容 */
export function stripEnvironment(input: string): string {
	const text = input.trim();
	const match = /^\\begin\{([a-zA-Z*]+)\}([\s\S]*)\\end\{\1\}$/.exec(text);
	const inner = match?.[2];
	if (typeof inner === 'string') return inner.trim();
	return text;
}

/**
 * 需要必选参数的环境的默认参数（列格式 / preamble）。
 *
 * `array` 的 `\begin{array}` 不带 `{cc|c}` 这类列格式时，MathJax 解析 preamble
 * 会遇到空 token 并报 `Illegal preamble token ()`——面板里选 array 环境
 * （尤其源码为空时）正是踩到这条，故在此统一补默认列格式。
 */
const ENV_PREAMBLE: Readonly<Record<string, string>> = {
	array: '{cc}',
};

/**
 * 可选矩阵环境（自定义矩阵弹窗用）。
 * `array` 会自动补列格式，其余环境无需参数。
 */
export const MATRIX_ENVS = [
	'matrix',
	'pmatrix',
	'bmatrix',
	'vmatrix',
	'Vmatrix',
	'Bmatrix',
	'array',
	'cases',
	'align',
] as const;

export type MatrixEnv = (typeof MATRIX_ENVS)[number];

/** 矩阵行列数上下限（防止误输入过大导致源码爆炸） */
export const MATRIX_SIZE_MIN = 1;
export const MATRIX_SIZE_MAX = 20;

/** 把输入夹到合法区间 */
export function clampMatrixSize(n: number): number {
	if (!Number.isFinite(n)) return MATRIX_SIZE_MIN;
	return Math.min(MATRIX_SIZE_MAX, Math.max(MATRIX_SIZE_MIN, Math.round(n)));
}

/** 单个占位单元格：行列数较小时用 a_{ij} 便于识别，超过 10×10 用空占位 */
function matrixCell(row: number, col: number, rows: number, cols: number): string {
	return rows <= 10 && cols <= 10 ? `a_{${row}${col}}` : '{}';
}

/**
 * 生成 rows × cols 的矩阵源码（占位骨架，光标停在第一个单元格前）。
 *
 * 例：buildMatrixLatex(2, 3, 'bmatrix')
 *   → \begin{bmatrix} ⟨光标⟩a_{11} & a_{12} & a_{13} \\ a_{21} & a_{22} & a_{23} \\ \end{bmatrix}
 */
export function buildMatrixLatex(
	rowsInput: number,
	colsInput: number,
	env: MatrixEnv,
	cursor = '',
): string {
	const rows = clampMatrixSize(rowsInput);
	const cols = clampMatrixSize(colsInput);
	const preamble = env === 'array' ? `{${'c'.repeat(cols)}}` : (ENV_PREAMBLE[env] ?? '');

	const body: string[] = [];
	for (let r = 1; r <= rows; r += 1) {
		const cells: string[] = [];
		for (let c = 1; c <= cols; c += 1) {
			cells.push((r === 1 && c === 1 ? cursor : '') + matrixCell(r, c, rows, cols));
		}
		body.push(cells.join(' & '));
	}
	return `\\begin{${env}}${preamble}\n${body.join(' \\\\ \n')}\n\\end{${env}}`;
}

/** 拆分环境名与其自带参数（如传入 `array{cc|c}` 时不再重复加默认参数） */
function splitEnv(env: string): { name: string; arg: string } {
	const match = /^([a-zA-Z*]+)(.*)$/.exec(env.trim());
	const name = match?.[1] ?? env;
	const arg = (match?.[2] ?? '').trim();
	return { name, arg };
}

/** 用环境包裹源码；源码为空时也照常生成环境骨架（便于先搭结构再填内容） */
export function applyEnvironment(input: string, env: string): string {
	const body = stripEnvironment(input);
	if (!env.trim()) return body;
	const { name, arg } = splitEnv(env);
	const preamble = arg || ENV_PREAMBLE[name] || '';
	return `\\begin{${name}}${preamble}\n${body}\n\\end{${name}}`;
}
