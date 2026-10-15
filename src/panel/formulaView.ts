/**
 * 公式预览渲染 —— 「公式模板」与「收藏夹」两处共用
 *
 * ## 为什么渲染
 * 这两处过去直接把 LaTeX 源码当文本打印（等宽字体 + 灰字），用户看不出公式长什么样。
 * 本模块把它们换成**渲染后的公式**，源码仍在 `title` 提示里保留。
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
 * ## 时序
 * 宿主**懒加载** MathJax，故渲染前必须先 `await ensureMathJax()`。
 * 与此同时，容器先写入 LaTeX 源码作为占位文本 —— 面板秒开，
 * 且 MathJax 不可用时仍有可读内容（不会留下空白块）。
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
