/**
 * 公式预览渲染 —— 快捷工具按钮 / 公式模板 / 收藏夹 三处共用
 *
 * ## 为什么渲染
 * 这三处过去直接把 LaTeX 源码或 Unicode 字符当文本打印，用户看不出公式长什么样。
 * 本模块把它们换成**渲染后的公式**（Computer Modern / TeX 字体），源码仍在提示里保留。
 *
 * ## 为什么走宿主 renderMath，而不是构建期预渲染片段
 * 需求是「字体须与 Obsidian 默认公式渲染一致（Computer Modern / TeX），
 * 字号 / 行高 / 基线 / 间距全部对齐」。
 * 宿主 `renderMath` = `MathJax.tex2chtml`，正是正文公式渲染的同一条链路：
 * 同一套 CHTML 输出、同一份宿主注入的 `MJX-TEX-*` 字体样式表、同一套颜色继承规则，
 * 因此不存在字体族与度量的偏差。
 * 构建期改用 mathjax-full 预渲染会引入字体族命名差异（mathjax-full 用 `MJXZERO / MJXTEX-*`，
 * 宿主用 `MJX-TEX-*`），该路线在符号面板上已验证会跑偏并已回退，故此处不采用。
 *
 * ## 两种渲染时序
 *  · `renderFormulaIn`  —— 模板 / 收藏夹：条目数十条，列表重建后一次性全量渲染；
 *  · `renderSymbolsLazy` —— 快捷工具：375 个按钮，**首屏只渲染前 N 条，其余滚动到视口再渲染**，
 *    并对渲染结果做 latex 级缓存（同一条公式只排版一次，后续克隆节点复用）。
 *
 * ## 块级判定
 * 多行环境（align / cases / matrix / array …）在 inline 模式下会被压成一行、观感错乱，
 * 与正文 `$$ … $$` 的显示效果也不一致；故检测到这些环境时改用 display 模式渲染。
 */

import { finishRenderMath, renderMath } from 'obsidian';

import { isBlockFormula, previewSource } from '../core/formula';
import { ensureMathJax } from '../mathjaxReady';
import { makeEl } from './ui';

/** 公式预览容器类名（样式见 styles.css 同名段） */
export const FORMULA_CLASS = 'mathbox-formula';

/** 渲染成功后追加的类名（样式据此弱化占位态的等宽字体） */
const RENDERED_CLASS = 'is-rendered';

/** 渲染失败 / 公式非法时追加的类名（退回纯文本展示） */
const FAILED_CLASS = 'is-failed';

/**
 * 快捷工具首屏立即渲染的按钮数，其余交给 IntersectionObserver。
 * 侧边栏一屏约可见 120–180 个按钮，取 96 可覆盖主要可见区，
 * 同时把首开排版成本压在 ~200 ms 以内（实测单条约 1–2 ms）。
 */
const LAZY_IMMEDIATE = 96;

/**
 * 建立公式预览容器：先写入源码占位文本，挂上 `data-tex` / `data-display`，
 * 供 `renderFormulaIn()` 后续批量替换为渲染结果。
 *
 * `extraClass` 用于继承调用方既有的展示区类名（模板 `.mathbox-template-latex`、
 * 收藏 `.mathbox-fav-latex`），使背景 / 圆角 / 悬停反馈等样式不重复定义。
 */
export function mountFormula(parent: HTMLElement, latex: string, extraClass?: string): HTMLElement {
	const source = previewSource(latex);
	return makeEl('div', {
		cls: extraClass ? `${FORMULA_CLASS} ${extraClass}` : FORMULA_CLASS,
		text: source,
		attr: {
			'data-tex': source,
			'data-display': isBlockFormula(latex) ? '1' : '0',
		},
		parent,
	});
}

/** 递增批次号：搜索框连续输入会反复重建列表，只渲染最后一个批次 */
let latestBatch = 0;

/**
 * 把 `root` 子树内所有公式占位容器渲染成公式。
 *
 * 幂等安全：可反复调用；同一时刻仅最后一个批次真正执行（其余在 await 后自行放弃）。
 * 单条渲染失败只影响该条（退回占位文本），不波及其余条目。
 */
export async function renderFormulaIn(root: HTMLElement): Promise<void> {
	// 泛型 querySelectorAll 直接给出 HTMLElement，无需再做 instanceof 收窄
	const hosts: HTMLElement[] = [];
	const nodes = root.querySelectorAll<HTMLElement>(`.${FORMULA_CLASS}`);
	for (let i = 0; i < nodes.length; i += 1) hosts.push(nodes.item(i));
	if (hosts.length === 0) return;

	const batch = ++latestBatch;
	// 宿主懒加载 MathJax：未就绪时 tex2chtml 尚不存在，会抛 "is not a function"
	await ensureMathJax();
	// 期间已有更新的批次（用户又搜了 / 又切了页），本批作废
	if (batch !== latestBatch) return;

	let rendered = 0;
	for (const host of hosts) {
		const source = host.dataset.tex ?? '';
		if (!source) continue;
		try {
			const math = renderMath(source, host.dataset.display === '1');
			if (math.querySelector('mjx-merror')) {
				host.classList.add(FAILED_CLASS);
				continue;
			}
			host.replaceChildren(math);
			host.classList.add(RENDERED_CLASS);
			rendered += 1;
		} catch {
			// 单条失败不影响其余：保留占位文本，仅打标记
			host.classList.add(FAILED_CLASS);
		}
	}

	// 统一收尾一次（CHTML 的度量 / 排版收尾），不必逐条 await
	if (rendered > 0) await finishRenderMath();
}

// ------------------------------------------------------------------ 快捷工具：懒渲染

/** 已渲染结果缓存：`I:` / `D:` + latex → 节点。同一条公式只排版一次，后续 cloneNode 复用 */
const renderCache = new Map<string, HTMLElement>();

/** 懒渲染观察器（全局单例，换页重建前 disconnect） */
let lazyObserver: IntersectionObserver | null = null;

/**
 * 建立符号按钮的公式容器。
 *
 * 与 `mountFormula` 的差别：内容取 `source`（**展示用** latex，可能带 a/b、a₁₁ 案例），
 * 占位文本用 `label`（Unicode），并额外挂 `data-label` ——
 * CHTML 渲染后 `textContent` 为空（字形由 CSS `::before` 提供），断言与降级都靠它。
 */
export function mountSymbolMath(parent: HTMLElement, source: string, label: string): HTMLElement {
	return makeEl('div', {
		cls: `${FORMULA_CLASS} mathbox-symbol-math`,
		text: label,
		attr: {
			'data-tex': source,
			'data-display': isBlockFormula(source) ? '1' : '0',
			'data-label': label,
		},
		parent,
	});
}

function cacheKey(source: string, display: boolean): string {
	return `${display ? 'D' : 'I'}:${source}`;
}

/**
 * 渲染单个公式容器（同步，要求 MathJax 已就绪）。
 * 命中缓存时只克隆节点 —— 这是「减小运行开销」的主要手段。
 */
function paintOne(host: HTMLElement): boolean {
	const source = host.dataset.tex ?? '';
	if (!source) return false;
	const display = host.dataset.display === '1';
	const key = cacheKey(source, display);
	let math = renderCache.get(key);
	if (!math) {
		try {
			math = renderMath(source, display);
		} catch {
			host.classList.add(FAILED_CLASS);
			return false;
		}
		if (math.querySelector('mjx-merror')) {
			host.classList.add(FAILED_CLASS);
			return false;
		}
		renderCache.set(key, math);
	}
	host.replaceChildren(math.cloneNode(true));
	host.classList.add(RENDERED_CLASS);
	return true;
}

/**
 * 快捷工具按钮的**懒渲染**：
 *  1. 首屏同步渲染前 `immediate` 条（默认 48，约 100 ms 内完成）；
 *  2. 其余交给 IntersectionObserver，滚动到视口前 120 px 才排版；
 *  3. 无 IntersectionObserver 的环境退化为一次性全量渲染（保证功能不缺失）。
 *
 * 这样面板首开不再为 375 个按钮一次性付排版成本；二次打开几乎零开销（缓存全命中）。
 */
export async function renderSymbolsLazy(
	root: HTMLElement,
	immediate = LAZY_IMMEDIATE,
): Promise<void> {
	const hosts: HTMLElement[] = [];
	const nodes = root.querySelectorAll<HTMLElement>(`.${FORMULA_CLASS}:not(.${RENDERED_CLASS})`);
	for (let i = 0; i < nodes.length; i += 1) hosts.push(nodes.item(i));
	if (hosts.length === 0) return;

	// 宿主懒加载 MathJax：未就绪时 tex2chtml 尚不存在，会抛 "is not a function"
	await ensureMathJax();
	// 期间面板已重建（切页 / 搜索），旧节点已脱离文档 → 放弃本批
	if (!root.isConnected) return;

	let painted = 0;
	for (let i = 0; i < hosts.length && i < immediate; i += 1) {
		const host = hosts[i];
		if (host && paintOne(host)) painted += 1;
	}
	if (painted > 0) await finishRenderMath();

	const rest = hosts.slice(immediate);
	if (rest.length === 0) return;

	if (typeof IntersectionObserver !== 'function') {
		for (const host of rest) paintOne(host);
		await finishRenderMath();
		return;
	}

	lazyObserver?.disconnect();
	const scrollRoot = root.closest('.mathbox-side-body');
	lazyObserver = new IntersectionObserver(
		(entries) => {
			let changed = 0;
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const host = entry.target;
				lazyObserver?.unobserve(host);
				if (host instanceof HTMLElement && paintOne(host)) changed += 1;
			}
			if (changed > 0) void finishRenderMath();
		},
		{ root: scrollRoot instanceof HTMLElement ? scrollRoot : null, rootMargin: '120px 0px' },
	);
	for (const host of rest) lazyObserver.observe(host);
}

/** 清空渲染缓存与观察器（面板销毁时调用，避免持有已脱离文档的节点） */
export function disposeFormulaCache(): void {
	lazyObserver?.disconnect();
	lazyObserver = null;
	renderCache.clear();
}
