/**
 * MathBox 工作区视图（标签页 / 独立窗口形态）
 *
 * 需求（王先生 2026-10-08）：面板希望能像标签页一样**吸附在主界面**，
 * 也能**独立成单独窗口**，这样"最小化"就不必只是收缩为顶栏。
 *
 * 宿主提供的能力（obsidian.d.ts 实证）：
 *  · `plugin.registerView(type, viewCreator)` + `ItemView` —— 让面板成为工作区标签页，
 *    可拆分、可停靠侧边，**最小化 = 收进标签栏**；
 *  · `workspace.openPopoutLeaf()` —— 新开一个 OS 级独立窗口；
 *  · `workspace.moveLeafToPopout(leaf)` —— 把已存在的标签页移到独立窗口
 *    （吸附 ⇄ 独立的切换点，用户也可直接拖动标签出窗口）。
 *
 * 实现方式：**不重写面板**，而是把同一个 `MathBoxModal` 以「停靠模式」
 * 挂进本视图的内容区（见 `FloatingWindow.open(parent, onCloseRequest)`）——
 * 尺寸与最小化交给工作区，逻辑与浮动模式完全一致。
 */

import { ItemView, MarkdownView, type WorkspaceLeaf } from 'obsidian';
import type MathBoxPlugin from '../main';
import { MathBoxModal } from './MathBoxModal';

/** 视图类型 id（registerView 与 setViewState 用同一个） */
export const MATHBOX_VIEW_TYPE = 'mathbox-view';

export class MathBoxView extends ItemView {
	private readonly plugin: MathBoxPlugin;
	private modal: MathBoxModal | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: MathBoxPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return MATHBOX_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'MathBox';
	}

	getIcon(): string {
		return 'sigma';
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass('mathbox-view-host');

		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		const modal = new MathBoxModal(this.app, this.plugin, {
			editor: active?.editor ?? null,
		});
		this.modal = modal;
		// 停靠进本视图内容区；面板点关闭时移除这个 leaf（等价于关闭标签页）
		modal.open(this.contentEl, () => {
			this.leaf.detach();
		});
	}

	async onClose(): Promise<void> {
		this.modal?.close();
		this.modal = null;
		this.contentEl.empty();
	}
}
