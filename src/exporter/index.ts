/**
 * 导出统一入口
 *
 * 四种格式的可用性（实测结论见 exporter/mathjax.ts 顶部注释）：
 *   LaTeX  → 剪贴板
 *   MathML → 剪贴板（取自 CHTML 输出的 mjx-assistive-mml 语义树）
 *   SVG    → 下载 + 剪贴板（降级快照）
 *   PNG    → 下载（3x 栅格化，降级快照）
 */

import { PNG_SCALE } from '../core/constants';
import type { ExportFormat } from '../types';
import { copyToClipboard, downloadBlob, downloadText, timestampSuffix } from './download';
import { extractMathML, hasSvgOutput, mathMLFromMathItems, texToMathML } from './mathjax';
import { buildSnapshotSvg, renderSvgToPng } from './svg';

export type ExportFailReason = 'noMathJax' | 'noSvgOutput' | 'render' | 'unknown';

export interface ExportInput {
	latex: string;
	display: boolean;
	/** 已渲染公式的容器（内部含 mjx-container） */
	renderedEl: HTMLElement | null;
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
			if (!input.renderedEl) return { ok: false, reason: 'render' };
			const snapshot = buildSnapshotSvg(input.renderedEl);
			if (!snapshot) return { ok: false, reason: 'render' };
			downloadText(snapshot.svg, `${baseName()}.svg`, 'image/svg+xml');
			await copyToClipboard(snapshot.svg);
			return { ok: true, degraded: !hasSvgOutput() };
		}

		case 'png': {
			if (!input.renderedEl) return { ok: false, reason: 'render' };
			const snapshot = buildSnapshotSvg(input.renderedEl);
			if (!snapshot) return { ok: false, reason: 'render' };
			const blob = await renderSvgToPng(snapshot, PNG_SCALE);
			if (!blob) return { ok: false, reason: 'noSvgOutput' };
			downloadBlob(blob, `${baseName()}.png`);
			return { ok: true, degraded: !hasSvgOutput() };
		}

		default:
			return { ok: false, reason: 'unknown' };
	}
}
