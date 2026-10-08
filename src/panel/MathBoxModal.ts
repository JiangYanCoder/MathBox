/**
 * MathBox 面板：相对编辑器的独立浮动窗口
 *
 * 布局（对应设计文档 §3.1）：
 *   顶栏（可拖拽移动；置顶 / 设置 / 侧边栏开合 ‖ 最小化 / 最大化 / 关闭）
 *   ├─ A 渲染区（收藏 · 导出）
 *   ├─ B 选项栏（字号 · 字体 · 颜色 · 环境 ‖ 行内 · 行间）
 *   ├─ 拖拽分隔条
 *   └─ C 源码区（复制 · 清空）  ┃ 拖拽调宽 ┃  D 侧边栏（快捷工具 / 公式模板 / 收藏夹）
 *
 * 面板可拖动、可缩放（右/下/右下三个把手），最大化铺满屏幕，最小化折叠为仅顶栏。
 *
 * 底层实现（v3.2）：**不再继承宿主 Modal**，改为继承自建 `FloatingWindow`
 * （挂 document.body 的 fixed 窗口，见该文件头说明）。由此：
 *  · 不再受宿主 Modal 结构变动影响（无原生头部 × 与横条冲突）；
 *  · 窗口的尺寸 / 层级 / 最小化 / 最大化 / 置顶完全自主；
 *  · 不拦截面板以外的点击，更像常驻工具窗口。
 */

import {
	App,
	Editor,
	MarkdownView,
	Menu,
	Notice,
	setIcon,
	type MenuPositionDef,
} from 'obsidian';
import {
	PANEL_MIN_HEIGHT,
	PANEL_MIN_WIDTH,
	RENDER_DEBOUNCE_MS,
	SIDE_PANE_MAX_WIDTH,
	SIDE_PANE_MIN_WIDTH,
	SPLIT_MIN_PX,
} from '../core/constants';
import { createDebounce, type Debounced } from '../core/debounce';
import { buildInsertText, splitCursor } from '../core/insert';
import { expandMacros, countExpandableMacros } from '../core/macros';
import { applyEnvironment, looksLikeLatex } from '../core/latex';
import { detectStyle } from '../core/wrap';
import { exportFormula } from '../exporter';
import {
	addFavorite,
	createFavorite,
	favoriteGroupOptions,
	findDuplicate,
	hasGroup,
	makeDefaultName,
	removeFavoriteGroups,
	UNGROUPED_ID,
	type GroupCascade,
} from '../favorites/store';
import type { Translator } from '../i18n';
import type MathBoxPlugin from '../main';
import type {
	ExportFormat,
	FavoriteItem,
	FormulaStyle,
	InsertMode,
	Lang,
	PanelRect,
} from '../types';
import { PromptModal } from './favoriteDialog';
import { createOptionSection, type OptionSectionApi } from './sections/optionSection';
import { createRenderSection, type RenderSectionApi } from './sections/renderSection';
import { createSideSection, type SideSectionApi } from './sections/sideSection';
import { createSourceSection, type SourceSectionApi } from './sections/sourceSection';
import type { PanelContext } from './sections/context';
import { clamp, Icons, makeEl, windowControlButton, windowIcon } from './ui';
import { FloatingWindow } from './FloatingWindow';

const EXPORT_ICONS: Record<ExportFormat, string> = {
	latex: 'code',
	mathml: 'file-code',
	svg: 'image',
	png: 'file-image',
};

const EXPORT_FORMATS: readonly ExportFormat[] = ['latex', 'mathml', 'svg', 'png'];

/** 面板可缩放方向 */
type ResizeDir = 'e' | 's' | 'se';

const RESIZE_DIRS: readonly ResizeDir[] = ['e', 's', 'se'];

/** 默认面板尺寸（px），与 styles.css 中的兜底值保持一致 */
const DEFAULT_PANEL_WIDTH = 1120;
const DEFAULT_PANEL_HEIGHT = 780;

export interface MathBoxModalOptions {
	/** 唤起时的编辑器实例（插入目标），可能为空 */
	editor: Editor | null;
	/** 预填源码（右键唤起且选区形似 LaTeX 时） */
	prefill?: string;
}

export class MathBoxModal extends FloatingWindow implements PanelContext {
	readonly plugin: MathBoxPlugin;
	readonly lang: Lang;
	readonly t: Translator;

	private readonly options: MathBoxModalOptions;
	private readonly renderDebounced: Debounced<[]>;

	private source = '';
	private editor: Editor | null;
	private maximized = false;

	private panelEl!: HTMLElement;
	private mainEl!: HTMLElement;
	private topBarEl!: HTMLElement;
	private renderSection!: RenderSectionApi;
	private optionSection!: OptionSectionApi;
	private sourceSection!: SourceSectionApi;
	private sideSection!: SideSectionApi;

	private maximizeBtn!: HTMLElement;
	private minimizeBtn!: HTMLElement;
	private sideBtn!: HTMLButtonElement;
	/** 最小化（折叠为仅顶栏）状态 */
	private minimized = false;
	/** 折叠前的几何，用于还原 */
	private restoreMinRect: PanelRect | null = null;
	private splitterEl!: HTMLElement;
	private sideResizer!: HTMLElement;
	private readonly resizeHandles: HTMLElement[] = [];
	/** 最大化前的几何，用于还原 */
	private restoreRect: PanelRect | null = null;

	constructor(app: App, plugin: MathBoxPlugin, options: MathBoxModalOptions) {
		super(app);
		this.plugin = plugin;
		this.options = options;
		this.editor = options.editor;
		this.t = plugin.translator;
		this.lang = plugin.lang;
		this.renderDebounced = createDebounce(() => {
			void this.renderSection.update();
		}, RENDER_DEBOUNCE_MS);
	}

	// ---------------------------------------------------------------- 生命周期

	onOpen(): void {
		void this.buildUi();
		window.addEventListener('resize', this.onWindowResize);
	}

	onClose(): void {
		this.renderDebounced.cancel();
		window.removeEventListener('resize', this.onWindowResize);
		this.contentEl.replaceChildren();
		this.plugin.notifyPanelClosed(this);
	}

	private readonly onWindowResize = (): void => {
		// 最大化时由 CSS 铺满；最小化时读到的只是顶栏几何——
		// 此时若重算几何会把「折叠态尺寸」写进内联样式，导致还原后尺寸偏差，故两者都跳过
		if (this.maximized || this.minimized) return;
		this.applyRect(this.clampRect(this.readRect()));
	};

	private async buildUi(): Promise<void> {
		// v3.2：面板已脱离宿主 Modal（自建 FloatingWindow），不再有原生头部节点；
		// 这里仍做一次兜底清理——万一社区主题或宿主给 .modal 注入了头部结构
		// （.modal-header-button / .modal-close-button / .modal-header），一并移除，
		// 避免它们压盖自绘顶栏或在顶栏上方留下异色横线。
		this.modalEl.querySelector('.modal-header-button')?.remove();
		this.modalEl.querySelector('.modal-close-button')?.remove();
		this.modalEl.querySelector('.modal-header')?.remove();
		this.contentEl.addClass('mathbox-content');

		this.panelEl = makeEl('div', { cls: 'mathbox-panel', parent: this.contentEl });
		this.buildTopBar();

		const body = makeEl('div', { cls: 'mathbox-body', parent: this.panelEl });
		this.mainEl = makeEl('div', { cls: 'mathbox-main', parent: body });

		this.renderSection = createRenderSection(this);
		this.optionSection = createOptionSection(this);
		this.sourceSection = createSourceSection(this);
		this.sideSection = createSideSection(this);

		const splitter = makeEl('div', {
			cls: 'mathbox-splitter',
			parent: this.mainEl,
			attr: { role: 'separator', 'aria-orientation': 'horizontal' },
		});

		// 主区自上而下：渲染区 → 宽度调节条 → 选项栏（字号/字体/颜色/环境）→ 源码区
		// 选项栏与字号字体仍归属下方的输入区域，不随分隔条移动（v3.2）
		this.mainEl.append(
			this.renderSection.el,
			splitter,
			this.optionSection.el,
			this.sourceSection.el,
		);

		// 侧边栏宽度拖拽把手（位于主区与侧边栏之间）
		this.sideResizer = makeEl('div', {
			cls: 'mathbox-side-resizer',
			parent: body,
			attr: { role: 'separator', 'aria-orientation': 'vertical' },
		});
		this.sideResizer.title = this.t('panel.resizeSide');

		body.appendChild(this.sideSection.el);

		this.splitterEl = splitter;
		this.attachSplitter(splitter);
		this.attachSideResizer();

		this.applySplit();
		this.applySidePaneState();
		this.applySideWidth();

		// 浮动模式才需要窗口级几何（拖拽 / 缩放 / 最大化 / 居中）；
		// 停靠模式（标签页）下尺寸由工作区托管
		if (!this.isDocked()) {
			this.buildResizeHandles();
			this.attachPanelDrag();
			this.applyRect(this.resolveInitialRect());
		}

		this.registerHotkeys();

		// 预填：右键唤起且选区形似 LaTeX
		const prefill = this.options.prefill?.trim();
		if (prefill) {
			this.source = prefill;
			this.sourceSection.setValue(prefill, prefill.length);
		}

		this.syncControls();
		await this.renderSection.update();
		this.sourceSection.focus();
	}

	private buildTopBar(): void {
		const bar = makeEl('header', { cls: 'mathbox-topbar', parent: this.panelEl });

		const brand = makeEl('div', { cls: 'mathbox-brand', parent: bar });
		const brandIcon = makeEl('span', { cls: 'mathbox-icon mathbox-brand-icon', parent: brand });
		this.setIcon(brandIcon, Icons.brand);
		makeEl('span', { cls: 'mathbox-brand-name', text: this.t('panel.title'), parent: brand });
		makeEl('span', { cls: 'mathbox-badge', text: this.t('panel.badge'), parent: brand });

		// 工具按钮组（设置 / 侧边栏开合）：挂宿主 titlebar-button 类，
		// 与右侧窗口三键共用同一套内边距 / 圆角 / 悬停观感，并 stretch 到顶栏全高
		const tools = makeEl('div', { cls: 'mathbox-topbar-tools', parent: bar });

		// 设置：直接打开插件设置界面（宿主 setting.open + openTabById）
		const settingsBtn = makeEl('button', {
			cls: 'titlebar-button mathbox-top-tool',
			attr: { type: 'button', 'aria-label': this.t('panel.settings') },
			parent: tools,
		});
		settingsBtn.title = this.t('panel.settings');
		this.setIcon(settingsBtn, Icons.settings);
		settingsBtn.addEventListener('click', () => this.openPluginSettings());

		// 侧边栏开合：复用宿主 sidebar-toggle-button-icon 动画图标，
		// 与右侧窗口键同挂 titlebar-button 类（同内边距 / 圆角 / 悬停），
		// 面板开合时内条宽度 8.33% ↔ 24% 平滑加宽，与 Obsidian 自身一致
		this.sideBtn = makeEl('button', {
			cls: 'titlebar-button mathbox-side-toggle',
			attr: { type: 'button', 'aria-label': this.t('panel.toggleSide') },
			parent: tools,
		});
		this.sideBtn.title = this.t('panel.toggleSide');
		this.setIcon(this.sideBtn, Icons.sideToggle);
		this.sideBtn.addEventListener('click', () => this.toggleSidePane());

		// 窗口控件组：复用宿主 .titlebar-button 类与 12×12 细线图标，
		// 观感与 Obsidian 在 Windows 下的窗口按钮一致（关闭键悬停红底白图标）
		const controls = makeEl('div', { cls: 'mathbox-window-controls', parent: bar });
		// 最小化：折叠为仅顶栏（类加在窗口本体 modalEl 上——此前误加在 panelEl，
		// 而窗口高度由 modalEl 撑着，故点击毫无反应）。
		// 停靠模式下最小化交由工作区（收进标签栏），故不渲染这两个键。
		if (!this.isDocked()) {
			this.minimizeBtn = windowControlButton(
				'mod-minimize',
				'minimize',
				this.t('panel.minimize'),
				() => this.toggleMinimize(),
				controls,
			);
			this.maximizeBtn = windowControlButton(
				'mod-maximize',
				'maximize',
				this.t('panel.maximize'),
				() => this.toggleMaximize(),
				controls,
			);
		} else {
			this.minimizeBtn = makeEl('div', { cls: 'mathbox-wbtn', parent: controls });
			this.minimizeBtn.hidden = true;
			this.maximizeBtn = this.minimizeBtn;
		}
		windowControlButton(
			'mod-close',
			'close',
			this.t('common.close'),
			() => this.close(),
			controls,
		);

		this.topBarEl = bar;
	}

	// ------------------------------------------------------------ 顶栏工具按钮

	/** 打开插件设置界面（宿主 setting.open + openTabById 定位到本插件） */
	private openPluginSettings(): void {
		const app = this.app as App & {
			setting?: { open(): void; openTabById(id: string): void };
		};
		try {
			app.setting?.open();
			app.setting?.openTabById(this.plugin.manifest.id);
		} catch {
			this.notify(this.t('toast.settingsFailed'), true);
		}
	}

	/**
	 * 最小化 / 还原：折叠为仅顶栏（高度随顶栏收缩），再次点击还原。
	 * 类加在窗口本体 `modalEl` 上并同步给 `panelEl`：
	 * 窗口高度由 modalEl 的内联 height 决定，只加在 panelEl 上不会收缩（v3.2 修复）。
	 */
	/**
	 * 最小化 / 还原：折叠为仅顶栏（高度随顶栏收缩），再次点击还原。
	 *
	 * 尺寸还原的关键在于**顺序**（v3.2 修复）：
	 *  · 折叠时必须**先记录几何、再加折叠类**——`getBoundingClientRect()` 会强制重排，
	 *    若先加类再读，拿到的已是折叠后的高度（仅顶栏高），还原时就会「回不到原尺寸」；
	 *  · 还原时同样**先解除折叠类、再写回几何**，否则旧的 `height:auto` 会被写入。
	 *  · 记录的是用户调整后的真实宽高（含拖拽移动后的位置），还原时按当前视口适配，
	 *    但**不回写设置记忆**，窗口后续变大仍能恢复原尺寸。
	 */
	private toggleMinimize(): void {
		// 处于最大化时先退出最大化——其还原几何即为「最小化前」的尺寸
		if (this.maximized) this.toggleMaximize();

		if (!this.minimized) {
			// ① 先记录（此刻仍是展开状态，读到的是真实宽高）
			this.restoreMinRect = this.clampRect(this.readRect());
			this.minimized = true;
			this.modalEl.classList.add('is-minimized');
			this.panelEl.classList.add('is-minimized');
		} else {
			// ② 先解除折叠，再写回几何（clampRect 负责视口适配，不改设置记忆）
			this.minimized = false;
			this.modalEl.classList.remove('is-minimized');
			this.panelEl.classList.remove('is-minimized');
			this.applyRect(this.clampRect(this.restoreMinRect ?? this.readRect()));
			this.restoreMinRect = null;
		}

		const label = this.minimized ? this.t('panel.restore') : this.t('panel.minimize');
		this.minimizeBtn.title = label;
		this.minimizeBtn.setAttribute('aria-label', label);
		this.minimizeBtn.replaceChildren(
			windowIcon(this.minimized ? 'restore' : 'minimize'),
		);
	}

	/** 面板自身的图标注入 */
	private setIcon(host: HTMLElement, name: string): void {
		setIcon(host, name);
	}

	/**
	 * Ctrl/Cmd+Enter 插入。
	 * 脱离 Modal 后不再有宿主的 keymap Scope，改为监听窗口本体：
	 * 只有焦点在窗口内时才响应，不抢全局热键。
	 */
	private registerHotkeys(): void {
		this.modalEl.addEventListener('keydown', (ev: KeyboardEvent) => {
			if (!(ev.ctrlKey || ev.metaKey) || ev.key !== 'Enter') return;
			ev.preventDefault();
			this.insertToNote(this.plugin.settings.insertMode);
		});
	}

	// ---------------------------------------------------------------- 几何

	/**
	 * 初始几何：位置始终居中，尺寸沿用上次记忆（无记忆用默认尺寸）。
	 * 只记尺寸不记位置——跨窗口状态（最大化 / 外接屏切换）恢复旧位置
	 * 会呈现为明显的「弹出不居中」，居中位置则永远稳妥。
	 */
	private resolveInitialRect(): PanelRect {
		const saved = this.plugin.settings.panelRect;
		const width = Math.min(saved?.width ?? DEFAULT_PANEL_WIDTH, window.innerWidth * 0.94);
		const height = Math.min(saved?.height ?? DEFAULT_PANEL_HEIGHT, window.innerHeight * 0.9);
		return this.clampRect({
			x: Math.round((window.innerWidth - width) / 2),
			y: Math.round((window.innerHeight - height) / 2),
			width: Math.round(width),
			height: Math.round(height),
		});
	}

	/** 读取当前实际几何（最大化时返回视口尺寸） */
	private readRect(): PanelRect {
		const rect = this.modalEl.getBoundingClientRect();
		return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
	}

	/** 把几何限制在视口内（允许部分越界但保证顶栏可抓取） */
	private clampRect(rect: PanelRect): PanelRect {
		const maxW = window.innerWidth;
		const maxH = window.innerHeight;
		const width = clamp(rect.width, PANEL_MIN_WIDTH, Math.max(PANEL_MIN_WIDTH, maxW));
		const height = clamp(rect.height, PANEL_MIN_HEIGHT, Math.max(PANEL_MIN_HEIGHT, maxH));
		const x = clamp(rect.x, -(width - 160), maxW - 120);
		const y = clamp(rect.y, 0, Math.max(0, maxH - 48));
		return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
	}

	/** 应用几何（脱离文档流，绝对定位于 modal-container 之上） */
	private applyRect(rect: PanelRect): void {
		if (this.maximized) return;
		// position: absolute 与 margin: 0 由 .mathbox-modal 类提供，此处只写动态数值
		this.modalEl.style.setProperty('left', `${rect.x}px`);
		this.modalEl.style.setProperty('top', `${rect.y}px`);
		this.modalEl.style.setProperty('width', `${rect.width}px`);
		this.modalEl.style.setProperty('height', `${rect.height}px`);
	}

	/** 拖拽移动：抓顶栏空白处（按钮与窗口控件不触发） */
	private attachPanelDrag(): void {
		this.topBarEl.addEventListener('pointerdown', (ev: PointerEvent) => {
			if (ev.button !== 0 || this.maximized) return;
			const target = ev.target;
			if (
				target instanceof HTMLElement &&
				target.closest('button, .titlebar-button, .clickable-icon')
			) {
				return;
			}

			ev.preventDefault();
			const start = this.readRect();
			const startX = ev.clientX;
			const startY = ev.clientY;

			const onMove = (moveEv: PointerEvent): void => {
				this.applyRect(
					this.clampRect({
						...start,
						x: start.x + (moveEv.clientX - startX),
						y: start.y + (moveEv.clientY - startY),
					}),
				);
			};
			const onUp = (): void => {
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				document.body.classList.remove('mathbox-dragging');
				this.plugin.rememberPanelRect(this.clampRect(this.readRect()));
			};

			document.body.classList.add('mathbox-dragging');
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		});
	}

	/** 缩放：右 / 下 / 右下三个把手 */
	private buildResizeHandles(): void {
		for (const dir of RESIZE_DIRS) {
			const handle = makeEl('div', {
				cls: `mathbox-resize-handle is-${dir}`,
				parent: this.panelEl,
				attr: { 'data-dir': dir },
			});
			this.attachResize(handle, dir);
			this.resizeHandles.push(handle);
		}
	}

	private attachResize(handle: HTMLElement, dir: ResizeDir): void {
		handle.addEventListener('pointerdown', (ev: PointerEvent) => {
			if (ev.button !== 0 || this.maximized) return;
			ev.preventDefault();
			ev.stopPropagation();

			const start = this.readRect();
			const startX = ev.clientX;
			const startY = ev.clientY;

			const onMove = (moveEv: PointerEvent): void => {
				const next: PanelRect = { ...start };
				if (dir === 'e' || dir === 'se') next.width = start.width + (moveEv.clientX - startX);
				if (dir === 's' || dir === 'se') next.height = start.height + (moveEv.clientY - startY);
				this.applyRect(this.clampRect(next));
			};
			const onUp = (): void => {
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				document.body.classList.remove('mathbox-resizing-panel');
				this.plugin.rememberPanelRect(this.clampRect(this.readRect()));
			};

			document.body.classList.add('mathbox-resizing-panel');
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		});
	}

	private toggleMaximize(): void {
		this.maximized = !this.maximized;
		if (this.maximized) {
			// 记住还原目标
			this.restoreRect = this.clampRect(this.readRect());
			this.modalEl.classList.add('is-maximized');
			this.modalEl.style.removeProperty('left');
			this.modalEl.style.removeProperty('top');
			this.modalEl.style.removeProperty('width');
			this.modalEl.style.removeProperty('height');		} else {
			this.modalEl.classList.remove('is-maximized');
			// 清除最大化时移除的内联尺寸，再写回还原几何
			this.applyRect(this.clampRect(this.restoreRect ?? this.resolveInitialRect()));
		}
		this.syncResizeHandles();
		this.maximizeBtn.title = this.maximized ? this.t('panel.restore') : this.t('panel.maximize');
		this.maximizeBtn.setAttribute('aria-label', this.maximizeBtn.title);
		// 宿主同款：最大化 / 还原图标互换（12×12 细线）
		this.maximizeBtn.replaceChildren(windowIcon(this.maximized ? 'restore' : 'maximize'));
	}

	private syncResizeHandles(): void {
		for (const handle of this.resizeHandles) {
			handle.toggleAttribute('hidden', this.maximized);
		}
	}

	// ---------------------------------------------------------------- 侧边栏

	private toggleSidePane(): void {
		const collapsed = this.panelEl.classList.toggle('is-side-collapsed');
		this.plugin.settings.sidePaneOpen = !collapsed;
		this.plugin.queueSave();
	}

	private applySidePaneState(): void {
		if (!this.plugin.settings.sidePaneOpen) {
			this.panelEl.classList.add('is-side-collapsed');
		}
	}

	private applySideWidth(): void {
		const width = clamp(
			this.plugin.settings.sidePaneWidth,
			SIDE_PANE_MIN_WIDTH,
			SIDE_PANE_MAX_WIDTH,
		);
		this.panelEl.style.setProperty('--mathbox-side-width', `${Math.round(width)}px`);
		this.sideResizer.setAttribute('aria-valuenow', String(Math.round(width)));
	}

	/** 侧边栏宽度拖拽 */
	private attachSideResizer(): void {
		this.sideResizer.addEventListener('pointerdown', (ev: PointerEvent) => {
			if (ev.button !== 0) return;
			ev.preventDefault();
			const startX = ev.clientX;
			const startWidth = clamp(
				this.plugin.settings.sidePaneWidth,
				SIDE_PANE_MIN_WIDTH,
				SIDE_PANE_MAX_WIDTH,
			);
			const panewidth = this.sideSection.el.getBoundingClientRect().width || startWidth;

			const onMove = (moveEv: PointerEvent): void => {
				// 向左拖 = 变宽
				const next = clamp(
					startWidth + (startX - moveEv.clientX),
					SIDE_PANE_MIN_WIDTH,
					Math.min(SIDE_PANE_MAX_WIDTH, window.innerWidth * 0.7),
				);
				this.plugin.settings.sidePaneWidth = next;
				this.applySideWidth();
			};
			const onUp = (): void => {
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				document.body.classList.remove('mathbox-resizing');
				if (panewidth !== this.plugin.settings.sidePaneWidth) this.plugin.queueSave();
			};

			document.body.classList.add('mathbox-resizing');
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		});
	}

	/**
	 * 上下两块（渲染区 / 源码区）的可分配高度与比例边界。
	 *
	 * · `total`：扣除分隔条与选项栏两个 auto 行后的高度——**1 px 鼠标位移对应 1 px 高度变化**，
	 *   分隔条因此严格跟随鼠标，无跳变；
	 * · `min` / `max`：在 total 基础上保证两块各自的最小像素高度（`SPLIT_MIN_PX`），
	 *   并强制 `min + max === 1`、`min ≤ max`——否则面板很矮时会出现 min > max 的
	 *   退化区间，clamp 后比例被钉死、拖拽完全失效；
	 * · 空间不足以同时满足两个最小高度时（total < 2 × 最小高度），退到软下限 0.2，
	 *   保证仍可拖动，且任何一侧都不会被压没。
	 */
	private splitGeometry(): { total: number; min: number; max: number } {
		const mainH = this.mainEl.getBoundingClientRect().height;
		const autoH =
			(this.splitterEl?.getBoundingClientRect().height ?? 0) +
			(this.optionSection?.el.getBoundingClientRect().height ?? 0);
		const total = Math.max(1, mainH - autoH);
		const raw = SPLIT_MIN_PX / total;
		const min = raw <= 0.5 ? Math.max(raw, 0.2) : 0.2;
		return { total, min, max: 1 - min };
	}

	private applySplit(): void {
		const { total, min, max } = this.splitGeometry();
		// 布局未就绪（面板刚挂载、主区高度尚未确定）时不做归一化回写，避免污染记忆值
		if (total < SPLIT_MIN_PX) {
			const fallback = clamp(this.plugin.settings.splitRatio, 0.2, 0.8);
			this.mainEl.style.gridTemplateRows = `${fallback}fr auto auto ${1 - fallback}fr`;
			return;
		}
		const ratio = clamp(this.plugin.settings.splitRatio, min, max);
		// 归一化回写：越界值（如窗口缩小后）不留存在设置里，避免下次开面板时跳变
		this.plugin.settings.splitRatio = ratio;
		this.mainEl.style.gridTemplateRows = `${ratio}fr auto auto ${1 - ratio}fr`;
	}

	private attachSplitter(splitter: HTMLElement): void {
		splitter.addEventListener('pointerdown', (ev: PointerEvent) => {
			ev.preventDefault();
			const startY = ev.clientY;
			// 以**实际渲染高度**为起点（而非设置值），确保起始即"零位移 = 零变化"
			const { total, min, max } = this.splitGeometry();
			const startRatio = clamp(
				(this.renderSection?.el.getBoundingClientRect().height ?? 0) / total,
				min,
				max,
			);

			const onMove = (moveEv: PointerEvent): void => {
				// 方向：分隔条在渲染区与输入区之间 —— 鼠标上移（delta<0）压缩渲染区、
				// 放大源码区；下移则相反。故比例与位移**同号**。
				const deltaPx = moveEv.clientY - startY;
				this.plugin.settings.splitRatio = clamp(startRatio + deltaPx / total, min, max);
				this.applySplit();
			};
			const onUp = (): void => {
				window.removeEventListener('pointermove', onMove);
				window.removeEventListener('pointerup', onUp);
				document.body.classList.remove('mathbox-resizing');
				// 松手后定稿：按当前实际几何回写比例并落盘
				this.plugin.settings.splitRatio =
					(this.renderSection?.el.getBoundingClientRect().height ?? 0) / this.splitGeometry().total;
				this.applySplit();
				this.plugin.queueSave();
			};

			document.body.classList.add('mathbox-resizing');
			window.addEventListener('pointermove', onMove);
			window.addEventListener('pointerup', onUp);
		});
	}

	// ------------------------------------------------------------ PanelContext

	getSource(): string {
		return this.source;
	}

	getSelection(): { start: number; end: number } {
		const ta = this.sourceSection?.getTextarea();
		if (!ta) return { start: 0, end: 0 };
		const start = ta.selectionStart ?? 0;
		return { start, end: ta.selectionEnd ?? start };
	}

	handleEditorInput(value: string): void {
		this.source = value;
		this.syncControls();
		this.requestRender();
	}

	setSource(value: string, caret?: number): void {
		this.source = value;
		this.sourceSection.setValue(value, caret);
		this.syncControls();
		this.requestRender();
	}

	insertIntoSource(text: string): void {
		const ta = this.sourceSection.getTextarea();
		const value = ta.value;
		const start = ta.selectionStart ?? value.length;
		const end = ta.selectionEnd ?? start;
		const { body, caret } = splitCursor(text);
		this.setSource(value.slice(0, start) + body + value.slice(end), start + caret);
		ta.focus();
	}

	replaceSourceWith(text: string): void {
		const { body, caret } = splitCursor(text);
		this.setSource(body, caret);
		this.sourceSection.focus();
	}

	getStyle(): FormulaStyle {
		return detectStyle(this.source);
	}

	applyEnvironment(env: string): void {
		// 源码为空时也允许插入：先搭出 `\begin{array}{cc} … \end{array}` 骨架再填内容。
		// array 等需要列格式的环境由 core/latex 的 ENV_PREAMBLE 补默认参数，
		// 否则 MathJax 会报 "Illegal preamble token ()"。
		if (!env) {
			this.setSource(applyEnvironment(this.source, env));
			return;
		}
		this.setSource(applyEnvironment(this.source, env));
	}

	requestRender(): void {
		this.renderDebounced();
	}

	getRenderedElement(): HTMLElement | null {
		return this.renderSection?.getContentEl() ?? null;
	}

	// ------------------------------------------------------------ 收藏 / 导出

	/** 用户自建分组（预置三大分组之外） */
	private customGroups(): string[] {
		return this.plugin.settings.favoriteGroups ?? [];
	}

	/**
	 * 解析收藏目标分组：若为新填的分组名，先登记到设置再返回其 id；
	 * 未分组哨兵值统一归一为空（条目不写 group 字段）。
	 */
	private resolveFavoriteGroup(group: string | undefined): string {
		const name = (group ?? '').trim();
		if (!name || name === UNGROUPED_ID) return '';
		if (hasGroup(this.plugin.settings.favorites, name, this.customGroups())) return name;
		this.plugin.settings.favoriteGroups = [...this.customGroups(), name];
		this.plugin.queueSave();
		return name;
	}

	addCurrentToFavorites(): void {
		const source = this.source.trim();
		if (!source) {
			this.notify(this.t('toast.emptySource'), true);
			return;
		}
		if (findDuplicate(this.plugin.settings.favorites, source)) {
			this.notify(this.t('fav.exists'));
			return;
		}
		new PromptModal(this.app, {
			title: this.t('fav.addTitle'),
			placeholder: this.t('fav.namePlaceholder'),
			value: makeDefaultName(source),
			group: {
				label: this.t('fav.groupLabel'),
				options: favoriteGroupOptions(
					this.plugin.settings.favorites,
					this.plugin.lang,
					this.customGroups(),
				),
				value: UNGROUPED_ID,
				// 收藏时可直接建新分组：选中后填名称，随本次收藏一并落盘
				allowCreate: true,
				createLabel: this.t('fav.newGroupOption'),
				createPlaceholder: this.t('fav.newGroupPlaceholder'),
			},
			okText: this.t('common.ok'),
			cancelText: this.t('common.cancel'),
			onSubmit: (name, group) => {
				const target = this.resolveFavoriteGroup(group);
				const item = createFavorite(source, name, detectStyle(source), target);
				this.mutateFavorites((list) => addFavorite(list, item));
				this.notify(this.t('fav.added'));
			},
		}).open();
	}

	openExportMenu(anchor: HTMLElement): void {
		const menu = new Menu();
		for (const format of EXPORT_FORMATS) {
			menu.addItem((item) => {
				item.setTitle(this.t(`export.${format}`))
					.setIcon(EXPORT_ICONS[format])
					.onClick(() => {
						void this.runExport(format);
					});
			});
		}
		const rect = anchor.getBoundingClientRect();
		const position: MenuPositionDef = { x: rect.left, y: rect.bottom + 4 };
		menu.showAtPosition(position);
	}

	private async runExport(format: ExportFormat): Promise<void> {
		const source = this.source.trim();
		if (!source) {
			this.notify(this.t('export.empty'), true);
			return;
		}
		const formatName = this.t(`export.${format}`);
		const result = await exportFormula(format, {
			latex: source,
			display: true,
			renderedEl: this.getRenderedElement(),
		});
		if (result.ok) {
			const suffix = result.degraded ? this.t('export.degraded') : '';
			this.notify(this.t('export.done', { format: formatName }) + suffix);
		} else {
			const reason = this.t(`export.reason.${result.reason}`);
			this.notify(this.t('export.failed', { reason }), true);
		}
	}

	getFavorites(): readonly FavoriteItem[] {
		return this.plugin.settings.favorites;
	}

	mutateFavorites(mutator: (list: readonly FavoriteItem[]) => FavoriteItem[]): void {
		this.plugin.setFavorites(mutator(this.plugin.settings.favorites));
		this.sideSection.refreshFavorites();
	}

	refreshFavorites(): void {
		this.sideSection.refreshFavorites();
	}

	/**
	 * 删除收藏夹分组（单个 / 批量）。
	 *
	 * 流程：备份 → 纯函数计算新数据 → 写内存 → 立即落盘；
	 * 落盘失败（磁盘只读、宿主异常等）则**回滚内存**并返回 false，界面保持原状。
	 * 成功后刷新侧边栏（收藏夹页重建分组列表与分组选择器）。
	 */
	async deleteFavoriteGroups(targets: string[], cascade: GroupCascade): Promise<boolean> {
		const groups = this.plugin.settings.favoriteGroups ?? [];
		const backupGroups = [...groups];
		const backupFavorites = [...this.plugin.settings.favorites];
		const { items, groups: nextGroups } = removeFavoriteGroups(backupFavorites, groups, targets, cascade);

		this.plugin.settings.favoriteGroups = nextGroups;
		this.plugin.settings.favorites = items;
		try {
			await this.plugin.saveSettings();
		} catch {
			this.plugin.settings.favoriteGroups = backupGroups;
			this.plugin.settings.favorites = backupFavorites;
			return false;
		}
		this.sideSection.refreshFavorites();
		return true;
	}

	// ------------------------------------------------------------------ 插入

	insertToNote(mode: InsertMode): void {
		const source = this.source.trim();
		if (!source) {
			this.notify(this.t('toast.emptySource'), true);
			return;
		}
		const editor = this.resolveEditor();
		if (!editor) {
			this.notify(this.t('toast.noEditor'), true);
			return;
		}

		let latex = source;
		let expanded = 0;
		if (this.plugin.settings.expandMacros) {
			expanded = countExpandableMacros(source);
			if (expanded > 0) latex = expandMacros(source);
		}

		const text = buildInsertText(latex, mode, {
			compactDisplay: this.plugin.settings.compactDisplay,
		});

		// 一次 replaceSelection，保证一次 Ctrl+Z 整体撤销
		editor.replaceSelection(text);
		this.plugin.rememberInsertMode(mode);

		const message =
			mode === 'inline' ? this.t('toast.insertedInline') : this.t('toast.insertedDisplay');
		this.notify(
			expanded > 0 ? `${message} · ${this.t('toast.macroExpanded', { n: expanded })}` : message,
		);
		this.close();
	}

	private resolveEditor(): Editor | null {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (view) return view.editor;
		return this.editor;
	}

	// ------------------------------------------------------------------ 工具

	private syncControls(): void {
		this.optionSection?.sync(detectStyle(this.source));
	}

	notify(message: string, isError = false): void {
		if (isError) {
			new Notice(message, 4000);
			return;
		}
		new Notice(message, 2500);
	}
}

/** 供 commands 层复用的选区预填判断 */
export function resolvePrefill(selection: string | undefined): string | undefined {
	if (!selection) return undefined;
	return looksLikeLatex(selection) ? selection : undefined;
}
