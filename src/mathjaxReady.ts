/**
 * 宿主 MathJax 就绪保障（渲染与导出的前置条件）
 *
 * 背景（2026-10-08 实测，宿主 1.14.4）：
 *  · 宿主渲染入口 `renderMath` = `MathJax.tex2chtml(src, {display})`（同步）；
 *  · 宿主**懒加载** MathJax——首次需要渲染公式时才去加载
 *    `lib/mathjax/obsidian-mathjax.js`，加载完成后才把 `tex2chtml` 等方法
 *    挂到 `window.MathJax` 上；
 *  · 插件在 `onload` 阶段（或用户打开面板时）若直接调用 `renderMath()`，
 *    此时 `MathJax.tex2chtml` 尚不存在 → 抛
 *    "MathJax.tex2chtml is not a function"（用户见到的渲染报错）。
 *
 * 结论：**调用宿主 MathJax 渲染完全可行，但必须先 `await loadMathJax()`。**
 * 宿主把 `loadMathJax(): Promise<void>` 作为公开 API 导出（obsidian.d.ts 有声明），
 * 这里做一层幂等封装：整个会话只等一次，后续调用直接复用同一个 Promise。
 */

import { loadMathJax } from 'obsidian';

let pending: Promise<void> | null = null;

/**
 * 确保宿主 MathJax 已就绪。
 * 幂等：并发调用共用同一个 Promise；加载失败也放行，
 * 由后续 `renderMath` 抛出真实错误（面板会正常显示错误条）。
 */
export function ensureMathJax(): Promise<void> {
	if (!pending) {
		pending = (async () => {
			try {
				await loadMathJax();
			} catch {
				// 交由 renderMath 暴露真实原因
			}
		})();
	}
	return pending;
}
