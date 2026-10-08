/**
 * 自建浮动窗口（v3.2 底层改动：面板不再继承宿主 Modal）
 *
 * 为什么脱离 Modal（王先生 2026-10-08 要求「像 Obsidian 设置面板那样相对编辑器
 * 是一个独立窗口，需要从底层改动」）：
 *  · 宿主 Modal 的内部结构随版本变动——1.14 把关闭按钮改成 `.modal-header-button`、
 *    并新增 `.modal-header` 横条容器，每次变动都与自绘顶栏冲突（× 压盖、异色横线）。
 *    自建窗口不再有宿主头部节点，从根上消除这类冲突；
 *  · Modal 强制套一层 `.modal-container`（全屏遮罩层），窗口的最小化 / 最大化 /
 *    置顶等语义受其布局与层级约束（最小化失效即源于此：类加在 panel 上，
 *    而高度由 modal-container 撑着）；
 *  · 自建窗口挂 `document.body` 并 `position: fixed`，尺寸与位置完全自主，
 *    不拦截面板以外的点击（更像常驻工具窗口，而非模态对话框）。
 *
 * 兼容约定：对外暴露与宿主 Modal 同名的成员——`app` / `containerEl` / `modalEl` /
 * `contentEl` / `open()` / `close()` / `onOpen()` / `onClose()`，
 * 上层（MathBoxModal）因此只需最小改动。
 *
 * 说明：`containerEl` 采用 `display: contents`，只作挂载点，不产生盒模型、
 * 不拦截鼠标事件；窗口本体是 `modalEl`（保留 `modal` 类以复用既有面板样式）。
 */

import type { App } from 'obsidian';

export class FloatingWindow {
	readonly app: App;
	/** 挂载根（display:contents，无盒模型） */
	readonly containerEl: HTMLElement;
	/** 窗口本体：fixed 定位，承担尺寸 / 层级 / 外观 */
	readonly modalEl: HTMLElement;
	/** 窗口内容容器 */
	readonly contentEl: HTMLElement;

	private opened = false;
	private keyHandler: ((ev: KeyboardEvent) => void) | null = null;
	/** 停靠模式：窗口挂进宿主容器（如 ItemView 的内容区）而非 document.body */
	private docked = false;
	/** 关闭请求钩子：停靠模式下由宿主（如工作区 leaf）决定如何关 */
	private closeRequest: (() => void) | null = null;

	constructor(app: App) {
		this.app = app;
		this.containerEl = document.createElement('div');
		this.containerEl.className = 'mathbox-win-root';
		this.modalEl = document.createElement('div');
		this.modalEl.className = 'modal mathbox-modal';
		this.contentEl = document.createElement('div');
		this.contentEl.className = 'modal-content';
		this.modalEl.appendChild(this.contentEl);
		this.containerEl.appendChild(this.modalEl);
	}

	/**
	 * 打开窗口。
	 * @param parent 挂载容器，缺省为 `document.body`（浮动模式）；
	 *               传入其他容器即进入**停靠模式**（如挂进 ItemView 内容区，
	 *               成为工作区标签页；配合 `moveLeafToPopout` 可再变成独立 OS 窗口）。
	 * @param onRequestClose 停靠模式下的关闭回调（用于关闭宿主 leaf）
	 */
	open(parent?: HTMLElement, onRequestClose?: () => void): void {
		if (this.opened) return;
		this.opened = true;
		this.docked = Boolean(parent) && parent !== document.body;
		this.closeRequest = onRequestClose ?? null;
		this.containerEl.classList.toggle('mathbox-win-docked', this.docked);
		(parent ?? document.body).appendChild(this.containerEl);

		// Esc 关闭：仅当焦点位于窗口内时响应，避免抢走宿主的全局 Esc
		this.keyHandler = (ev: KeyboardEvent): void => {
			if (ev.key !== 'Escape') return;
			const active = document.activeElement;
			if (active && !this.containerEl.contains(active)) return;
			ev.preventDefault();
			ev.stopPropagation();
			this.close();
		};
		document.addEventListener('keydown', this.keyHandler, true);

		this.onOpen();
	}

	/** 停靠模式（挂在宿主容器里，而非 document.body 的浮动窗口） */
	isDocked(): boolean {
		return this.docked;
	}

	/** 关闭窗口：移除监听与 DOM */
	close(): void {
		if (!this.opened) return;
		this.opened = false;
		// 停靠模式下把关闭意图交给宿主（如 detach 工作区 leaf）
		this.closeRequest?.();
		this.closeRequest = null;
		this.onClose();
		if (this.keyHandler) {
			document.removeEventListener('keydown', this.keyHandler, true);
			this.keyHandler = null;
		}
		this.containerEl.remove();
	}

	isOpen(): boolean {
		return this.opened;
	}

	/** 子类覆写：打开后 */
	onOpen(): void {
		// 默认无操作
	}

	/** 子类覆写：关闭前（清理定时器 / 监听 / 通知宿主） */
	onClose(): void {
		// 默认无操作
	}
}
