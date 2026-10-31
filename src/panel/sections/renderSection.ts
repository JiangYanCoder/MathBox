/**
 * A 区：渲染预览
 */

import { finishRenderMath, renderMath } from 'obsidian';
import { LONG_SOURCE_WARN } from '../../core/constants';
import { PREVIEW_FONT_SIZE } from '../../core/fontSize';
import { ensureMathJax } from '../../mathjaxReady';
import { createStepper, iconButton, Icons, makeEl } from '../ui';
import type { PanelContext } from './context';

export interface RenderSectionApi {
	el: HTMLElement;
	update(): Promise<void>;
	getContentEl(): HTMLElement;
	/**
	 * 应用预览字号（px）。
	 * 只写容器上的 CSS 变量 —— CHTML 的字形 / 间距以 em 计量，随容器字号等比缩放，
	 * 因此**不需要重渲染 MathJax**（重渲染只在源码变化时发生）。
	 */
	applyFontSize(px: number): void;
}

function describeError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	return String(error);
}

export function createRenderSection(ctx: PanelContext): RenderSectionApi {
	const el = makeEl('section', { cls: 'mathbox-section mathbox-render' });

	const head = makeEl('div', { cls: 'mathbox-section-head', parent: el });
	makeEl('span', { cls: 'mathbox-section-title', text: ctx.t('render.title'), parent: head });
	const tools = makeEl('div', { cls: 'mathbox-section-tools', parent: head });

	// 字号调节（v3.4.1）：置于「收藏」左侧，与工具栏既有图标按钮同排
	createStepper({
		label: ctx.t('option.previewFontSize'),
		value: ctx.getPreviewFontSize(),
		min: PREVIEW_FONT_SIZE.min,
		max: PREVIEW_FONT_SIZE.max,
		defaultValue: PREVIEW_FONT_SIZE.def,
		decreaseLabel: ctx.t('option.fontSizeDecrease'),
		increaseLabel: ctx.t('option.fontSizeIncrease'),
		valueHint: ctx.t('option.fontSizeResetHint', { n: PREVIEW_FONT_SIZE.def }),
		onChange: (px) => ctx.setPreviewFontSize(px),
		parent: tools,
	});

	const favBtn = iconButton(Icons.star, ctx.t('render.favorite'), { parent: tools });
	const exportBtn = iconButton(Icons.download, ctx.t('render.export'), { parent: tools });

	favBtn.addEventListener('click', () => ctx.addCurrentToFavorites());
	exportBtn.addEventListener('click', () => ctx.openExportMenu(exportBtn));

	const body = makeEl('div', { cls: 'mathbox-render-body', parent: el });
	const content = makeEl('div', { cls: 'mathbox-render-content', parent: body });

	function applyFontSize(px: number): void {
		content.style.setProperty('--mathbox-preview-font-size', `${px}px`);
	}
	applyFontSize(ctx.getPreviewFontSize());

	const warnBar = makeEl('div', { cls: 'mathbox-note is-warn', parent: el });
	warnBar.hidden = true;
	const errorBar = makeEl('div', { cls: 'mathbox-note is-error', parent: el });
	errorBar.hidden = true;

	let version = 0;

	function showError(message: string): void {
		errorBar.textContent = `${ctx.t('render.error')}：${message}`;
		errorBar.hidden = false;
	}

	async function update(): Promise<void> {
		const mine = ++version;
		const source = ctx.getSource().trim();

		errorBar.hidden = true;
		warnBar.hidden = true;

		if (!source) {
			content.replaceChildren(
				makeEl('div', { cls: 'mathbox-empty', text: ctx.t('render.empty') }),
			);
			return;
		}

		if (source.length > LONG_SOURCE_WARN) {
			warnBar.textContent = ctx.t('render.tooLong', { n: LONG_SOURCE_WARN });
			warnBar.hidden = false;
		}

		const holder = makeEl('div', { cls: 'mathbox-math' });
		content.replaceChildren(holder);

		try {
			// 宿主懒加载 MathJax：必须先等它就绪，否则 tex2chtml 尚不存在，
			// 会抛 "MathJax.tex2chtml is not a function"
			await ensureMathJax();
			holder.appendChild(renderMath(source, true));
			await finishRenderMath();
		} catch (error) {
			if (mine === version) showError(describeError(error));
			return;
		}

		if (mine !== version) return;

		const merror = holder.querySelector('mjx-merror');
		if (merror) {
			showError(merror.getAttribute('data-mjx-error') ?? merror.textContent ?? '');
		}
	}

	return {
		el,
		update,
		getContentEl: () => content,
		applyFontSize,
	};
}
