/**
 * 符号面板「渲染化」的运行时支撑
 *
 * 片段与样式都在构建期生成（src/symbols/rendered.generated.ts，不入库）：
 *  · 片段是 MathJax CHTML 的 HTML 串，按钮直接 innerHTML 进去，运行时零排版；
 *  · 样式必须注入 document：mjx-c 是空元素，字形由 ::before content 提供，
 *    而宿主 adaptiveCSS 只为「已渲染过的字符」生成规则，面板里首次出现的字符会空白。
 *
 * 注入的 CSS **全部限定在作用域类的后代范围内**：否则会覆盖宿主正文里已渲染的公式，
 * 而宿主自带的那份结构样式才是权威（两者 MathJax 版本不同，规则不完全一致）。
 *
 * 字体族不随产物注入：mathjax-full 3.2.2 用 MJXZERO/MJXTEX-*，宿主用 MJX-TEX-*，
 * 名字对不上，字形一律交给宿主提供的 .TEX-* 规则。
 */

import {
	SYMBOL_BASE_CSS,
	SYMBOL_CHAR_CSS,
	SYMBOL_CHTML,
	SYMBOL_MATH_SCOPE,
	SYMBOL_RENDER_FALLBACKS,
} from './rendered.generated';

/** 包裹符号片段的元素必须带这个类，注入的 CSS 才会命中 */
export const SYMBOL_MATH_SCOPE_CLASS = SYMBOL_MATH_SCOPE;

const STYLE_ID = 'mathbox-symbol-css';

/**
 * 注入符号所需的 CSS（幂等：整个文档只注入一次）
 *
 * 插件 onload 时调用即可，不必等面板打开 —— 样式表是纯文本，代价可忽略，
 * 且能保证面板首次渲染时字形规则已经就位。
 */
export function ensureSymbolCss(doc: Document = document): void {
	if (doc.getElementById(STYLE_ID)) return;
	const style = doc.createElement('style');
	style.id = STYLE_ID;
	style.textContent = SYMBOL_BASE_CSS + SYMBOL_CHAR_CSS;
	(doc.head ?? doc.documentElement).appendChild(style);
}

/** 取该 latex 的预渲染片段；无片段（构建期渲染失败）时返回 null，调用方回退为文本 */
export function symbolFragment(latex: string): string | null {
	return SYMBOL_CHTML[latex] ?? null;
}

/** 是否有预渲染片段（决定按钮走渲染还是文本回退） */
export function hasSymbolFragment(latex: string): boolean {
	return Object.prototype.hasOwnProperty.call(SYMBOL_CHTML, latex);
}

export { SYMBOL_RENDER_FALLBACKS };
