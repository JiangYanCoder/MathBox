/**
 * 宿主 MathJax 能力探测与 MathML 提取
 *
 * 实测结论（M0，Obsidian 桌面端）：宿主仅打包 `lib/mathjax/tex-chtml-full.js`，
 * 即 TeX 输入（含 ams / physics 等 30 个扩展）+ CHTML 输出，**不含 SVG 输出组件**，
 * 也未单独打包 MML 输出组件。因此：
 *   - MathML 导出走 CHTML 输出自带的 `mjx-assistive-mml > math` 节点（语义完整，零字体依赖）；
 *   - SVG / PNG 走 CHTML DOM 的 foreignObject 快照（降级路径，字体会回退到系统字体）。
 */

interface MathJaxAdaptor {
	outerHTML(node: unknown): string;
}

interface MathJaxMathItem {
	root?: unknown;
}

interface MathJaxDocument {
	math?: MathJaxMathItem[];
	adaptor?: MathJaxAdaptor;
}

interface MathJaxStartup {
	document?: MathJaxDocument;
	adaptor?: MathJaxAdaptor;
	/** 仅当宿主打包了 SVG 输出组件时存在 */
	toSVG?: (node: unknown) => unknown;
}

export interface MathJaxLike {
	startup?: MathJaxStartup;
	tex2mml?: (tex: string, options?: { display?: boolean }) => string;
	svgStylesheet?: unknown;
}

/** 取回宿主注入的 MathJax 实例（Obsidian 将其挂载在 window.MathJax） */
export function getMathJax(): MathJaxLike | null {
	const w = window as unknown as { MathJax?: MathJaxLike };
	return w.MathJax ?? null;
}

/** 宿主是否暴露 SVG 输出能力 */
export function hasSvgOutput(): boolean {
	const mj = getMathJax();
	return typeof mj?.startup?.toSVG === 'function' || mj?.svgStylesheet !== undefined;
}

/** 从已渲染的容器里取出 MathML（CHTML 输出的无障碍 MathML 子树） */
export function extractMathML(container: HTMLElement | null): string | null {
	if (!container) return null;
	const assistive = container.querySelector('mjx-assistive-mml math');
	if (assistive) return assistive.outerHTML;
	const plain = container.querySelector('math');
	if (plain) return plain.outerHTML;
	return null;
}

/** 若宿主打包了 MML 输出组件，可直接由源码转换 */
export function texToMathML(latex: string, display: boolean): string | null {
	const mj = getMathJax();
	const fn = mj?.tex2mml;
	if (typeof fn !== 'function' || !mj) return null;
	try {
		return fn.call(mj, latex, { display });
	} catch {
		return null;
	}
}

/** 兜底：从 MathJax 内部数学列表取最后一项的语义树并序列化 */
export function mathMLFromMathItems(): string | null {
	const mj = getMathJax();
	const doc = mj?.startup?.document;
	const items = doc?.math;
	const adaptor = doc?.adaptor ?? mj?.startup?.adaptor;
	if (!items || items.length === 0 || !adaptor) return null;
	const last = items[items.length - 1];
	if (!last?.root) return null;
	try {
		return adaptor.outerHTML(last.root);
	} catch {
		return null;
	}
}
