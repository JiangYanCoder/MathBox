/**
 * 轻量输入弹窗（收藏命名、重命名、自定义颜色）
 */

import { App, Modal } from 'obsidian';
import { NEW_GROUP_VALUE } from '../favorites/store';
import { makeEl } from './ui';

/** 弹窗内的分组下拉（收藏归入哪个分组） */
export interface PromptGroupOptions {
	label: string;
	options: ReadonlyArray<{ value: string; label: string }>;
	value?: string;
	/** 下拉末尾追加「新建分组…」，选中后展开新分组名称输入框 */
	allowCreate?: boolean;
	/** 「新建分组…」选项文案 */
	createLabel?: string;
	/** 新分组名称输入框占位 */
	createPlaceholder?: string;
}

export interface PromptModalOptions {
	title: string;
	placeholder?: string;
	value?: string;
	/** 可选：附带一个分组下拉，提交时把所选值一并返回 */
	group?: PromptGroupOptions;
	okText: string;
	cancelText: string;
	onSubmit: (value: string, group?: string) => void;
}

export class PromptModal extends Modal {
	private readonly options: PromptModalOptions;

	constructor(app: App, options: PromptModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText(this.options.title);
		this.modalEl.addClass('mathbox-prompt-modal');
		contentEl.addClass('mathbox-prompt-content');

		const input = makeEl('input', {
			cls: 'mathbox-prompt-input',
			parent: contentEl,
			attr: { type: 'text' },
		});
		input.value = this.options.value ?? '';
		if (this.options.placeholder) input.placeholder = this.options.placeholder;

		// 分组下拉（可选）：收藏条目归入哪个分组；可带「新建分组…」
		let groupSelect: HTMLSelectElement | null = null;
		let newGroupInput: HTMLInputElement | null = null;
		const groupOptions = this.options.group;
		if (groupOptions) {
			const field = makeEl('label', { cls: 'mathbox-prompt-field', parent: contentEl });
			makeEl('span', { cls: 'mathbox-prompt-field-label', text: groupOptions.label, parent: field });
			groupSelect = makeEl('select', { cls: 'mathbox-prompt-select', parent: field });
			for (const option of groupOptions.options) {
				const opt = document.createElement('option');
				opt.value = option.value;
				opt.textContent = option.label;
				groupSelect.appendChild(opt);
			}
			if (groupOptions.allowCreate) {
				const opt = document.createElement('option');
				opt.value = NEW_GROUP_VALUE;
				opt.textContent = groupOptions.createLabel ?? '＋ 新建分组…';
				groupSelect.appendChild(opt);
			}
			if (groupOptions.value) groupSelect.value = groupOptions.value;

			if (groupOptions.allowCreate) {
				newGroupInput = makeEl('input', {
					cls: 'mathbox-prompt-input mathbox-prompt-newgroup',
					parent: contentEl,
					attr: { type: 'text' },
				});
				if (groupOptions.createPlaceholder) newGroupInput.placeholder = groupOptions.createPlaceholder;
				const syncNewGroup = (): void => {
					if (!newGroupInput) return;
					const on = groupSelect?.value === NEW_GROUP_VALUE;
					newGroupInput.hidden = !on;
					if (on) newGroupInput.focus();
				};
				groupSelect.addEventListener('change', syncNewGroup);
				syncNewGroup();
			}
		}

		const row = makeEl('div', { cls: 'mathbox-prompt-actions', parent: contentEl });
		const cancelBtn = makeEl('button', {
			cls: 'mathbox-btn is-text',
			text: this.options.cancelText,
			parent: row,
			attr: { type: 'button' },
		});
		const okBtn = makeEl('button', {
			cls: 'mathbox-btn is-text mod-cta',
			text: this.options.okText,
			parent: row,
			attr: { type: 'button' },
		});

		const submit = (): void => {
			const value = input.value;
			// 选了「新建分组…」时，分组名取新分组输入框的内容
			const picked = groupSelect?.value;
			const group =
				picked === NEW_GROUP_VALUE ? (newGroupInput?.value ?? '').trim() : picked;
			this.close();
			this.options.onSubmit(value, group);
		};

		okBtn.addEventListener('click', submit);
		cancelBtn.addEventListener('click', () => this.close());
		input.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter') {
				ev.preventDefault();
				submit();
			}
		});

		window.setTimeout(() => {
			input.focus();
			input.select();
		}, 0);
	}

	onClose(): void {
		this.contentEl.replaceChildren();
	}
}

export interface ConfirmModalOptions {
	title: string;
	message: string;
	okText: string;
	cancelText: string;
	onConfirm: () => void;
	/** 用户取消 / 直接关闭时回调（用于把 Promise 型的确认流程收尾） */
	onCancel?: () => void;
}

/** 确认弹窗（用于清空收藏夹等不可逆操作） */
export class ConfirmModal extends Modal {
	private readonly options: ConfirmModalOptions;

	constructor(app: App, options: ConfirmModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText(this.options.title);
		this.modalEl.addClass('mathbox-prompt-modal');
		contentEl.addClass('mathbox-prompt-content');

		makeEl('p', { cls: 'mathbox-confirm-message', text: this.options.message, parent: contentEl });

		const row = makeEl('div', { cls: 'mathbox-prompt-actions', parent: contentEl });
		const cancelBtn = makeEl('button', {
			cls: 'mathbox-btn is-text',
			text: this.options.cancelText,
			parent: row,
			attr: { type: 'button' },
		});
		const okBtn = makeEl('button', {
			cls: 'mathbox-btn is-text mod-warning',
			text: this.options.okText,
			parent: row,
			attr: { type: 'button' },
		});

		cancelBtn.addEventListener('click', () => this.close());
		okBtn.addEventListener('click', () => {
			this.confirmed = true;
			this.close();
			this.options.onConfirm();
		});
	}

	onClose(): void {
		// 未确认就关闭（取消按钮 / Esc / 点击外部）时通知调用方，避免 Promise 悬挂
		if (!this.confirmed) this.options.onCancel?.();
		this.confirmed = false;
		this.contentEl.replaceChildren();
	}

	/** 是否已确认（区分「确认关闭」与「取消关闭」） */
	private confirmed = false;
}
