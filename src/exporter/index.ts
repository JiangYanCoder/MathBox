/**
 * 导出统一入口
 *
 * 四种格式的可用性（实测结论见 exporter/mathjax.ts 顶部注释）：
 *   LaTeX  → 剪贴板
 *   MathML → 剪贴板（取自 CHTML 输出的 mjx-assistive-mml 语义树）
 *   SVG    → 下载 + 剪贴板（MathJax 原生 SVG 输出）
 *   PNG    → 下载（3x 栅格化）
 *
 * ## 图像路线：SVG 直出优先，DOM 快照兜底
 * 主路径是 `texSvg.texToSvg()` —— 让 MathJax 直接产出矢量，
 * 字形是 `<path>` 轮廓，**不含字体、不含 foreignObject、不引用任何外部资源**，
 * 因此任何查看器（浏览器、Word、微信、Illustrator）都能逐像素一致地渲染。
 *
 * 快照路线（`svg.buildSnapshotSvg`）保留为降级：万一 SVG 管线初始化失败
 * （例如打包异常导致字体数据缺失），仍能导出一张可用的图。
 */

import { PNG_SCALE } from '../core/constants';
import type { ExportBackground, ExportFormat } from '../types';
import { copyToClipboard, downloadBlob, downloadText, timestampSuffix } from './download';
import { extractMathML, mathMLFromMathItems, texToMathML } from './mathjax';
import { buildSnapshotSvg, renderSvgToPng, type SvgSnapshot } from './svg';
import { texToSvg } from './texSvg';

export type ExportFailReason = 'noMathJax' | 'noSvgOutput' | 'render' | 'unknown';

export interface ExportInput {
	latex: string;
	display: boolean;
	/** 已渲染公式的容器（内部含 mjx-container） */
	renderedEl: HTMLElement | null;
	/** 图像导出底色（white / transparent），来自设置项 */
	background?: ExportBackground;
}

export interface ExportSuccess {
	ok: true;
	/** 是否走了降级路径（图像精度受限） */
	degraded: boolean;
}

export interface ExportFailure {
	ok: false;
	reason: ExportFailReason;
}

export type ExportResult = ExportSuccess | ExportFailure;

function baseName(): string {
	return `mathbox-${timestampSuffix()}`;
}

/** 取 MathML：三级来源依次尝试 */
function resolveMathML(input: ExportInput): string | null {
	return (
		extractMathML(input.renderedEl) ??
		texToMathML(input.latex, input.display) ??
		mathMLFromMathItems()
	);
}

/**
 * 图像导出是否仍是「降级」的。
 *
 * v3.4 起主路径是 MathJax 原生 SVG 输出（字形即 path，零字体依赖），
 * 不存在降级问题；只有回落到 DOM 快照时才需要判断字体是否内联成功。
 */
function isDegraded(snapshot: SvgSnapshot): boolean {
	return snapshot.fontsMissing > 0 || snapshot.fontsInlined === 0;
}

/** 取当前公式的基准字号（与预览一致），拿不到时按 16px */
function fontSizeOf(input: ExportInput): number {
	if (!input.renderedEl) return 16;
	const size = Number.parseFloat(getComputedStyle(input.renderedEl).fontSize);
	return Number.isFinite(size) && size > 0 ? size : 16;
}

/** 透明背景时的字形颜色：跟随主题前景色，融入深色页面 */
function textColorOf(background: ExportBackground): string {
	if (background === 'white') return '#000000';
	return getComputedStyle(document.body).color || '#000000';
}

/**
 * 生成图像 SVG：先走 MathJax 原生 SVG 输出，失败再回落到 DOM 快照。
 *
 * 返回值里 `degraded` 表示是否走了快照兜底且字体未能内联。
 */
async function renderImageSvg(
	input: ExportInput,
): Promise<{ svg: string; width: number; height: number; degraded: boolean } | null> {
	const background = input.background ?? 'white';

	const direct = texToSvg(input.latex, {
		display: input.display,
		padding: 14,
		fontSize: fontSizeOf(input),
		background,
		color: textColorOf(background),
	});
	if (direct) return { ...direct, degraded: false };

	if (!input.renderedEl) return null;
	const snapshot = await buildSnapshotSvg(input.renderedEl, 14, { background });
	if (!snapshot) return null;
	return {
		svg: snapshot.svg,
		width: snapshot.width,
		height: snapshot.height,
		degraded: isDegraded(snapshot),
	};
}

export async function exportFormula(
	format: ExportFormat,
	input: ExportInput,
): Promise<ExportResult> {
	const latex = input.latex.trim();
	if (!latex) return { ok: false, reason: 'render' };

	switch (format) {
		case 'latex': {
			const ok = await copyToClipboard(latex);
			return ok ? { ok: true, degraded: false } : { ok: false, reason: 'unknown' };
		}

		case 'mathml': {
			const mml = resolveMathML(input);
			if (!mml) return { ok: false, reason: 'noMathJax' };
			const copied = await copyToClipboard(mml);
			return copied ? { ok: true, degraded: false } : { ok: false, reason: 'unknown' };
		}

		case 'svg': {
			const image = await renderImageSvg(input);
			if (!image) return { ok: false, reason: 'render' };
			downloadText(image.svg, `${baseName()}.svg`, 'image/svg+xml');
			await copyToClipboard(image.svg);
			return { ok: true, degraded: image.degraded };
		}

		case 'png': {
			const image = await renderImageSvg(input);
			if (!image) return { ok: false, reason: 'render' };
			const blob = await renderSvgToPng(image, PNG_SCALE, input.background ?? 'white');
			if (!blob) return { ok: false, reason: 'noSvgOutput' };
			downloadBlob(blob, `${baseName()}.png`);
			return { ok: true, degraded: image.degraded };
		}

		default:
			return { ok: false, reason: 'unknown' };
	}
}
