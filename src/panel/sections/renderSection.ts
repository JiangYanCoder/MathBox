/**
 * A 区：渲染预览
 */

import { finishRenderMath, renderMath } from 'obsidian';
import { LONG_SOURCE_WARN } from '../../core/constants';
import { ensureMathJax } from '../../mathjaxReady';
import { iconButton, Icons, makeEl } from '../ui';
import type { PanelContext } from './context';

export interface RenderSectionApi {
	el: HTMLElement;
	update(): Promise<void>;
	getContentEl(): HTMLElement;
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

	const favBtn = iconButton(Icons.star, ctx.t('render.favorite'), { parent: tools });
	const exportBtn = iconButton(Icons.download, ctx.t('render.export'), { parent: tools });

	favBtn.addEventListener('click', () => ctx.addCurrentToFavorites());
	exportBtn.addEventListener('click', () => ctx.openExportMenu(exportBtn));

	const body = makeEl('div', { cls: 'mathbox-render-body', parent: el });
	const content = makeEl('div', { cls: 'mathbox-render-content', parent: body });

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
	};
}
