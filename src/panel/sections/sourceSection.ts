/**
 * C 区：LaTeX 源码编辑
 */

import { stripDelimiters } from '../../core/latex';
import { copyToClipboard } from '../../exporter/download';
import { iconButton, Icons, makeEl } from '../ui';
import type { PanelContext } from './context';

export interface SourceSectionApi {
	el: HTMLElement;
	setValue(value: string, caret?: number): void;
	getTextarea(): HTMLTextAreaElement;
	focus(): void;
}

export function createSourceSection(ctx: PanelContext): SourceSectionApi {
	const t = ctx.t;
	const el = makeEl('section', { cls: 'mathbox-section mathbox-source' });

	const head = makeEl('div', { cls: 'mathbox-section-head', parent: el });
	makeEl('span', { cls: 'mathbox-section-title', text: t('source.title'), parent: head });
	const countEl = makeEl('span', { cls: 'mathbox-source-count', parent: head });

	const tools = makeEl('div', { cls: 'mathbox-section-tools', parent: head });
	const copyBtn = iconButton(Icons.copy, t('source.copy'), { parent: tools });
	const clearBtn = iconButton(Icons.eraser, t('source.clear'), { parent: tools });

	const textarea = makeEl('textarea', {
		cls: 'mathbox-textarea',
		parent: el,
		attr: {
			spellcheck: 'false',
			autocapitalize: 'off',
			autocomplete: 'off',
			wrap: 'off',
		},
	});
	textarea.placeholder = t('source.placeholder');

	function updateCount(value: string): void {
		const length = value.trim().length;
		countEl.textContent = length > 0 ? t('source.charCount', { n: length }) : '';
	}

	textarea.addEventListener('input', () => {
		updateCount(textarea.value);
		ctx.handleEditorInput(textarea.value);
	});

	// 粘贴外部 LaTeX 时自动剥离 $ / $$ / \( \) 定界符
	textarea.addEventListener('paste', (ev: ClipboardEvent) => {
		const raw = ev.clipboardData?.getData('text/plain');
		if (!raw) return;
		const stripped = stripDelimiters(raw);
		if (stripped === raw.trim()) return;
		ev.preventDefault();
		ctx.insertIntoSource(stripped);
	});

	copyBtn.addEventListener('click', () => {
		void (async (): Promise<void> => {
			const ok = await copyToClipboard(textarea.value);
			ctx.notify(ok ? t('toast.copied') : t('toast.copyFailed'), !ok);
		})();
	});

	clearBtn.addEventListener('click', () => {
		ctx.setSource('');
		ctx.notify(t('toast.cleared'));
		textarea.focus();
	});

	return {
		el,
		setValue(value: string, caret?: number): void {
			if (textarea.value !== value) textarea.value = value;
			if (caret !== undefined) textarea.setSelectionRange(caret, caret);
			updateCount(value);
		},
		getTextarea: () => textarea,
		focus: () => textarea.focus(),
	};
}
