/**
 * 分组管理弹窗：删除收藏夹分组（单个 / 批量）
 *
 * 需求（王先生 2026-10-08）：
 *  · 分组列表提供删除入口，支持单个删除与批量删除；
 *  · 删除前二次确认，并提示该分组下的条目数量；
 *  · 分组含条目时明确处理方式：仅移出分组（默认，保留条目）或级联删除条目；
 *  · 预置分组（最优控制 / 自动控制 / 轨道力学）与「未分组」不可删除。
 *
 * 弹窗只负责交互与确认；实际数据变更由调用方用 `removeFavoriteGroups()` 纯函数
 * 落盘执行（失败时调用方回滚并返回 false，弹窗据此提示错误）。
 */

import { App, Modal, Notice } from 'obsidian';
import {
	countByGroup,
	FAVORITE_GROUP_PRESETS,
	isProtectedGroup,
	UNGROUPED_GROUP,
	UNGROUPED_ID,
	type GroupCascade,
} from '../favorites/store';
import type { FavoriteItem, Lang } from '../types';
import { ConfirmModal } from './favoriteDialog';
import { makeEl } from './ui';

export interface GroupManagerLabels {
	title: string;
	empty: string;
	selectAll: string;
	/** 受保护分组（仅「未分组」）不可删除的原因提示 */
	protectedHint: string;
	/** 预置分组角标（示例数据标记） */
	presetTag: string;
	itemsCount: (n: number) => string;
	deleteOne: string;
	keepItems: string;
	deleteItems: string;
	itemsPolicy: string;
	deleteSelected: string;
	confirmTitle: string;
	confirmMessage: (names: string[], n: number, cascade: GroupCascade) => string;
	okText: string;
	cancelText: string;
	deleted: (groups: number, items: number) => string;
	failed: string;
}

export interface GroupManagerModalOptions {
	lang: Lang;
	labels: GroupManagerLabels;
	/** 全部可删除的自建分组（名称即 id） */
	customGroups: readonly string[];
	items: readonly FavoriteItem[];
	/** 执行删除；返回 false 表示失败（调用方已回滚数据） */
	onDelete: (targets: string[], cascade: GroupCascade) => Promise<boolean>;
}

export class GroupManagerModal extends Modal {
	private readonly options: GroupManagerModalOptions;
	/** 勾选状态（分组 id → 是否选中），仅自建分组可勾选。
	 *  用 Map 而非 Set：本项目 obsidian 类型链把 lib 降到 ES5，Set 缺少 set() 方法 */
	private readonly selected = new Map<string, boolean>();
	private cascade: GroupCascade = 'keep-items';

	constructor(app: App, options: GroupManagerModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		const t = this.options.labels;
		this.titleEl.setText(t.title);
		this.modalEl.addClass('mathbox-prompt-modal');
		contentEl.addClass('mathbox-prompt-content');

		const counts = countByGroup(this.options.items, this.options.customGroups);
		const list = makeEl('div', { cls: 'mathbox-group-list', parent: contentEl });

		/** 当前勾选的自建分组 */
		const picked = (): string[] => Array.from(this.selected.entries()).filter(([, on]) => on).map(([id]) => id);

		const boxes: HTMLInputElement[] = [];
		let refresh: () => void = () => undefined;

		/**
		 * 追加一行。`removable` 由「是否受保护」决定——
		 * 预置分组（最优控制 / 自动控制 / 轨道力学）**可删除**，仅「未分组」受保护。
		 */
		const addRow = (id: string, name: string, removable: boolean, note?: string): void => {
			const row = makeEl('div', { cls: 'mathbox-group-row', parent: list });
			if (!removable) row.classList.add('is-protected');

			const box = makeEl('input', {
				cls: 'mathbox-group-check',
				parent: row,
				attr: { type: 'checkbox', 'data-group': id },
			});
			box.disabled = !removable;
			if (removable) {
				this.selected.set(id, false);
				boxes.push(box);
			}

			const nameWrap = makeEl('span', { cls: 'mathbox-group-name', parent: row });
			makeEl('span', { text: name, parent: nameWrap });
			if (note) makeEl('span', { cls: 'mathbox-group-tag', text: note, parent: nameWrap });
			makeEl('span', {
				cls: 'mathbox-group-count',
				text: t.itemsCount(counts.get(id) ?? 0),
				parent: row,
			});

			// 单个删除入口：与批量一致走「勾选 + 确认」，保证提示与处理方式相同
			const del = makeEl('button', {
				cls: 'mathbox-btn is-text mathbox-group-del',
				text: '✕',
				attr: { type: 'button', 'aria-label': `${t.deleteOne}：${name}` },
				parent: row,
			});
			del.title = removable ? `${t.deleteOne}：${name}` : t.protectedHint;
			del.disabled = !removable;
			del.addEventListener('click', () => {
				if (!removable) return;
				// 单选当前行：勾选状态与批量选择互斥，保证确认提示只涉及一个分组
				for (const other of boxes) other.checked = other === box;
				for (const [key] of this.selected) this.selected.set(key, key === id);
				allBox.checked = false;
				refresh();
			});
		};

		// 预置分组：可删除，标注「示例」（其条目来自首次使用的示例收藏）
		for (const preset of FAVORITE_GROUP_PRESETS) {
			addRow(preset.id, preset.name[this.options.lang], !isProtectedGroup(preset.id), t.presetTag);
		}
		// 自建分组：全部可删
		for (const name of this.options.customGroups) {
			if (FAVORITE_GROUP_PRESETS.some((p) => p.id === name)) continue;
			addRow(name, name, !isProtectedGroup(name));
		}
		// 「未分组」：受保护，条目数为 0 时也列出（说明其为兜底归属）
		addRow(UNGROUPED_ID, UNGROUPED_GROUP.name[this.options.lang], !isProtectedGroup(UNGROUPED_ID));

		const removableCount = this.options.customGroups.filter((g) => !isProtectedGroup(g)).length;
		if (removableCount === 0) {
			makeEl('div', { cls: 'mathbox-side-hint', text: t.empty, parent: contentEl });
		}
		makeEl('div', { cls: 'mathbox-side-hint', text: t.protectedHint, parent: contentEl });

		// 批量：全选 / 全不选
		const selectAll = makeEl('label', { cls: 'mathbox-group-all', parent: contentEl });
		const allBox = makeEl('input', {
			cls: 'mathbox-group-check',
			parent: selectAll,
			attr: { type: 'checkbox' },
		});
		makeEl('span', { text: t.selectAll, parent: selectAll });

		// 条目处理方式
		const policy = makeEl('div', { cls: 'mathbox-group-policy', parent: contentEl });
		makeEl('span', { cls: 'mathbox-group-policy-label', text: t.itemsPolicy, parent: policy });
		const keepRadio = makeEl('input', {
			cls: 'mathbox-group-check',
			parent: policy,
			attr: { type: 'radio', name: 'mathbox-group-cascade', value: 'keep-items' },
		});
		keepRadio.checked = true;
		makeEl('span', { text: t.keepItems, parent: policy });
		const delRadio = makeEl('input', {
			cls: 'mathbox-group-check',
			parent: policy,
			attr: { type: 'radio', name: 'mathbox-group-cascade', value: 'delete-items' },
		});
		makeEl('span', { text: t.deleteItems, parent: policy });
		keepRadio.addEventListener('change', () => {
			if (keepRadio.checked) this.cascade = 'keep-items';
		});
		delRadio.addEventListener('change', () => {
			if (delRadio.checked) this.cascade = 'delete-items';
		});

		// 底部：删除所选
		const row = makeEl('div', { cls: 'mathbox-prompt-actions', parent: contentEl });
		const cancelBtn = makeEl('button', {
			cls: 'mathbox-btn is-text',
			text: t.cancelText,
			attr: { type: 'button' },
			parent: row,
		});
		const delBtn = makeEl('button', {
			cls: 'mathbox-btn is-text mod-warning',
			text: t.deleteSelected,
			attr: { type: 'button' },
			parent: row,
		});

		refresh = (): void => {
			const n = picked().length;
			delBtn.disabled = n === 0;
			delBtn.textContent = n > 0 ? `${t.deleteSelected}（${n}）` : t.deleteSelected;
		};

		for (const box of boxes) {
			box.addEventListener('change', () => {
				const id = box.getAttribute('data-group');
				if (id) this.selected.set(id, box.checked);
				allBox.checked = boxes.length > 0 && boxes.every((b) => b.checked);
				refresh();
			});
		}
		allBox.addEventListener('change', () => {
			for (const box of boxes) box.checked = allBox.checked;
			for (const box of boxes) {
				const id = box.getAttribute('data-group');
				if (id) this.selected.set(id, allBox.checked);
			}
			refresh();
		});
		refresh();

		cancelBtn.addEventListener('click', () => this.close());
		delBtn.addEventListener('click', () => {
			void this.confirmAndDelete(picked());
		});
	}

	/** 二次确认 → 执行删除 → 提示（失败保持弹窗打开，便于重试或改设置） */
	private async confirmAndDelete(targets: string[]): Promise<void> {
		if (targets.length === 0) return;
		const t = this.options.labels;
		const counts = countByGroup(this.options.items, this.options.customGroups);
		const total = targets.reduce((n, id) => n + (counts.get(id) ?? 0), 0);

		const confirmed = await new Promise<boolean>((resolve) => {
			new ConfirmModal(this.app, {
				title: t.confirmTitle,
				message: t.confirmMessage(targets, total, this.cascade),
				okText: t.okText,
				cancelText: t.cancelText,
				onConfirm: () => resolve(true),
				onCancel: () => resolve(false),
			}).open();
		});
		if (!confirmed) return;

		const ok = await this.options.onDelete(targets, this.cascade);
		if (!ok) {
			new Notice(t.failed);
			return;
		}
		new Notice(t.deleted(targets.length, this.cascade === 'delete-items' ? total : 0));
		this.close();
	}
}
