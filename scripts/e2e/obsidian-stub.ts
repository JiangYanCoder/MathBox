/**
 * 测试用 Obsidian API 替身（仅覆盖 MathBox 用到的子集）
 *
 * 目标：让插件源码能在真实浏览器里跑起来，从而对面板交互做端到端验证。
 * 不追求 API 完整，只保证「用到的部分」行为合理。
 */

export const notices: string[] = [];
(globalThis as unknown as { __notices: string[] }).__notices = notices;

/* ------------------------- 全局 DOM 扩展（Obsidian 注入） ------------------------- */

interface Patched extends HTMLElement {
	createEl(tag: string, opts?: { cls?: string; text?: string; attr?: Record<string, string> }): HTMLElement;
	createDiv(opts?: { cls?: string; text?: string }): HTMLElement;
	createSpan(opts?: { cls?: string; text?: string }): HTMLElement;
	empty(): void;
	addClass(cls: string): void;
	removeClass(cls: string): void;
	setText(text: string): void;
	instanceOf(ctor: unknown): boolean;
}

function patch(proto: HTMLElement): void {
	const p = proto as unknown as Record<string, unknown>;
	p['createEl'] = function (this: HTMLElement, tag: string, opts?: Record<string, unknown>) {
		const child = document.createElement(tag);
		if (opts?.['cls']) child.className = String(opts['cls']);
		if (opts?.['text'] !== undefined) child.textContent = String(opts['text']);
		const attr = opts?.['attr'] as Record<string, string> | undefined;
		if (attr) for (const [k, v] of Object.entries(attr)) child.setAttribute(k, v);
		this.appendChild(child);
		return child;
	};
	p['createDiv'] = function (this: HTMLElement, opts?: Record<string, unknown>) {
		return (this as unknown as Patched).createEl('div', opts);
	};
	p['createSpan'] = function (this: HTMLElement, opts?: Record<string, unknown>) {
		return (this as unknown as Patched).createEl('span', opts);
	};
	p['empty'] = function (this: HTMLElement) {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
	p['addClass'] = function (this: HTMLElement, cls: string) {
		this.classList.add(cls);
	};
	p['removeClass'] = function (this: HTMLElement, cls: string) {
		this.classList.remove(cls);
	};
	p['setText'] = function (this: HTMLElement, text: string) {
		this.textContent = text;
	};
	p['instanceOf'] = function (this: HTMLElement, ctor: unknown) {
		return this instanceof (ctor as new () => unknown);
	};
}

patch(HTMLElement.prototype);
(globalThis as unknown as Record<string, unknown>)['createEl'] = (
	tag: string,
	opts?: Record<string, unknown>,
): HTMLElement => (document.body as unknown as Patched).createEl(tag, opts);
(globalThis as unknown as Record<string, unknown>)['createDiv'] = (opts?: Record<string, unknown>): HTMLElement =>
	createEl('div', opts);
(globalThis as unknown as Record<string, unknown>)['createSpan'] = (opts?: Record<string, unknown>): HTMLElement =>
	createEl('span', opts);

/* --------------------------------- 基础类型 --------------------------------- */

export class App {
	workspace = {
		on: () => ({}),
		getActiveViewOfType: (ctor: unknown) =>
			ctor === MarkdownView ? (globalThis as unknown as { __view?: unknown }).__view : null,
		/** 以标签页 / 拆分打开：替身只记录 leaf 与视图状态 */
		getLeaf: (_newLeaf?: unknown): WorkspaceLeaf => createLeaf(),
		/** 独立窗口：替身同样返回一个新 leaf，并标记为 popout */
		openPopoutLeaf: (): WorkspaceLeaf => {
			const leaf = createLeaf();
			leaf.popout = true;
			return leaf;
		},
		/** 把已有 leaf 移到独立窗口（吸附 → 独立） */
		moveLeafToPopout: (leaf: WorkspaceLeaf): void => {
			leaf.popout = true;
		},
		revealLeaf: (): void => {},
		getLeavesOfType: (type: string): WorkspaceLeaf[] => leaves.filter((l) => l.state?.type === type),
	};
	vault = {};
}

/** 视图与 leaf 的注册表（供测试断言） */
export const leaves: WorkspaceLeaf[] = [];

function createLeaf(): WorkspaceLeaf {
	const leaf = new WorkspaceLeaf();
	leaves.push(leaf);
	return leaf;
}

export class MarkdownView {
	editor = { getSelection: () => '', replaceSelection: () => {} };
}

export class Editor {
	constructor(
		private readonly onReplace: (text: string) => void,
		private readonly selection = '',
	) {}
	getSelection(): string {
		return this.selection;
	}
	replaceSelection(text: string): void {
		this.onReplace(text);
	}
}

export interface EditorLike {
	getSelection(): string;
	replaceSelection(text: string): void;
}

export class Plugin {
	app: unknown;
	manifest: unknown;
	commands: unknown[] = [];
	ribbonIcons: unknown[] = [];
	settingTabs: unknown[] = [];
	views: Array<{ type: string; creator: unknown }> = [];
	data: unknown = null;

	constructor(app: unknown, manifest: unknown) {
		this.app = app;
		this.manifest = manifest;
	}
	async loadData(): Promise<unknown> {
		return this.data;
	}
	async saveData(data: unknown): Promise<void> {
		this.data = data;
	}
	addRibbonIcon(): HTMLElement {
		const el = createEl('div');
		this.ribbonIcons.push(el);
		return el;
	}
	addCommand(cmd: unknown): unknown {
		this.commands.push(cmd);
		return cmd;
	}
	addSettingTab(tab: unknown): void {
		this.settingTabs.push(tab);
	}
	registerView(type: string, creator: (leaf: WorkspaceLeaf) => ItemView): void {
		this.views.push({ type, creator });
		viewCreators.set(type, creator);
	}
	registerEvent(): void {}
	registerDomEvent(): void {}
	registerInterval(): void {}
	/** register() 登记的回调（宿主 Component 在卸载时执行；见 obsidian.d.ts） */
	readonly cleanups: Array<() => unknown> = [];
	register(cb: () => unknown): void {
		this.cleanups.push(cb);
	}
}

export class Scope {
	register(): unknown {
		return {};
	}
}

export class Component {
	onload(): void {}
	onunload(): void {}
	close(): void {
		this.onunload();
	}
}

/** 视图工厂注册表（registerView 写入，setViewState 取用） */
export const viewCreators = new Map<string, (leaf: WorkspaceLeaf) => ItemView>();

/** WorkspaceLeaf 替身：只实现视图装载所需的最小面 */
export class WorkspaceLeaf {
	view: ItemView | null = null;
	state: { type?: string; active?: boolean } | null = null;
	/** 是否位于独立窗口（openPopoutLeaf / moveLeafToPopout 置位） */
	popout = false;

	detach(): void {
		this.view?.close();
		this.view = null;
	}

	async setViewState(state: { type?: string; active?: boolean }): Promise<void> {
		this.state = state;
		const creator = state.type ? viewCreators.get(state.type) : undefined;
		if (!creator) return;
		const view = creator(this);
		this.view = view;
		// 模拟宿主把视图内容挂进工作区
		document.body.appendChild(view.containerEl);
		view.onOpen();
	}
}

/** ItemView 替身：提供 contentEl / app / close()，供 MathBoxView 挂载面板 */
export class ItemView extends Component {
	app: unknown;
	containerEl: HTMLElement;
	contentEl: HTMLElement;
	leaf: WorkspaceLeaf;

	constructor(leaf: WorkspaceLeaf) {
		super();
		this.leaf = leaf;
		// 真实宿主会给视图注入 app（View.app）；替身从全局取当前 App 实例
		this.app = (globalThis as unknown as { __app?: unknown }).__app ?? null;
		this.containerEl = createEl('div');
		this.contentEl = this.containerEl.createDiv();
	}
	getViewType(): string {
		return '';
	}
	getDisplayText(): string {
		return '';
	}
	getIcon(): string {
		return '';
	}
	/** 关闭视图：触发 onClose 并从工作区移除（与宿主一致） */
	close(): void {
		this.onClose();
		this.containerEl.remove();
	}
	async onOpen(): Promise<void> {}
	async onClose(): Promise<void> {}
}

/** Modal：复刻 Obsidian 的 .modal-container > .modal > .modal-content 结构 */
export class Modal extends Component {
	app: unknown;
	containerEl: HTMLElement;
	modalEl: HTMLElement;
	titleEl: HTMLElement;
	contentEl: HTMLElement;
	scope = new Scope();
	closed = false;

	constructor(app: unknown) {
		super();
		this.app = app;
		this.containerEl = createEl('div');
		this.containerEl.className = 'modal-container';
		this.modalEl = this.containerEl.createDiv({ cls: 'modal' });
		// 复刻宿主 1.14+ 结构：关闭按钮 .modal-header-button（旧版 .modal-close-button
		// 一并放上，验证插件对两类都能移除），标题外包 .modal-header 横条
		this.modalEl.createDiv({ cls: 'modal-header-button mod-raised clickable-icon' });
		this.modalEl.createDiv({ cls: 'modal-close-button' });
		const headerEl = this.modalEl.createDiv({ cls: 'modal-header' });
		this.titleEl = headerEl.createDiv({ cls: 'modal-title' });
		this.contentEl = this.modalEl.createDiv({ cls: 'modal-content' });
	}
	open(): void {
		document.body.appendChild(this.containerEl);
		this.closed = false;
		this.onOpen();
	}
	close(): void {
		this.closed = true;
		this.onClose();
		this.containerEl.remove();
	}
	onOpen(): void {}
	onClose(): void {}
}

export class MenuItem {
	setTitle(): this {
		return this;
	}
	setIcon(): this {
		return this;
	}
	onClick(): this {
		return this;
	}
}

export class Menu {
	items: MenuItem[] = [];
	addItem(cb: (item: MenuItem) => void): this {
		const item = new MenuItem();
		this.items.push(item);
		cb(item);
		return this;
	}
	showAtPosition(): void {}
}

export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class Setting {
	settingEl: HTMLElement;
	nameEl: HTMLElement;
	descEl: HTMLElement;
	controlEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		this.settingEl = containerEl.createDiv({ cls: 'setting-item' });
		this.nameEl = this.settingEl.createDiv({ cls: 'setting-item-name' });
		this.descEl = this.settingEl.createDiv({ cls: 'setting-item-description' });
		this.controlEl = this.settingEl.createDiv({ cls: 'setting-item-control' });
	}
	setName(name: string): this {
		this.nameEl.textContent = name;
		return this;
	}
	setDesc(desc: string): this {
		this.descEl.textContent = desc;
		return this;
	}
	setHeading(): this {
		return this;
	}
	setClass(): this {
		return this;
	}
	addDropdown(cb: (dd: FakeDropdown) => void): this {
		cb(new FakeDropdown(this.controlEl));
		return this;
	}
	addToggle(cb: (t: FakeToggle) => void): this {
		cb(new FakeToggle(this.controlEl));
		return this;
	}
	addButton(cb: (b: FakeButton) => void): this {
		cb(new FakeButton(this.controlEl));
		return this;
	}
	addText(cb: (t: FakeText) => void): this {
		cb(new FakeText(this.controlEl));
		return this;
	}
}

class FakeDropdown {
	el: HTMLSelectElement;
	constructor(parent: HTMLElement) {
		this.el = parent.createEl('select') as HTMLSelectElement;
	}
	addOption(value: string, label: string): this {
		const opt = document.createElement('option');
		opt.value = value;
		opt.textContent = label;
		this.el.appendChild(opt);
		return this;
	}
	setValue(value: string): this {
		this.el.value = value;
		return this;
	}
	onChange(): this {
		return this;
	}
}

class FakeToggle {
	constructor(parent: HTMLElement) {
		parent.createEl('input', { attr: { type: 'checkbox' } });
	}
	setValue(): this {
		return this;
	}
	onChange(): this {
		return this;
	}
}

class FakeButton {
	constructor(parent: HTMLElement) {
		parent.createEl('button');
	}
	setButtonText(): this {
		return this;
	}
	setWarning(): this {
		return this;
	}
	setCta(): this {
		return this;
	}
	onClick(): this {
		return this;
	}
}

class FakeText {
	constructor(parent: HTMLElement) {
		parent.createEl('input', { attr: { type: 'text' } });
	}
	setPlaceholder(): this {
		return this;
	}
	setValue(): this {
		return this;
	}
	onChange(): this {
		return this;
	}
}

export class PluginSettingTab {
	app: unknown;
	plugin: unknown;
	containerEl: HTMLElement;
	constructor(app: unknown, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
		this.containerEl = createEl('div');
	}
	display(): void {}
	hide(): void {}
}

/* --------------------------------- 宿主能力 --------------------------------- */

export const moment = {
	locale: (): string => 'zh-cn',
};

export function setIcon(host: HTMLElement, name: string): void {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('data-icon', name);
	host.appendChild(svg);
}

/** 渲染：用纯文本替身模拟 mjx-container，便于结构断言 */
/**
 * 宿主懒加载 MathJax 的替身：第一次调用时把 tex2chtml 挂到 window.MathJax 上，
 * 模拟「加载完成后才可用」的真实时序（插件必须先 await loadMathJax 再渲染）。
 */
export function loadMathJax(): Promise<void> {
	const w = window as unknown as { MathJax?: Record<string, unknown> };
	const mj = w.MathJax ?? {};
	mj.tex2chtml = (latex: string): HTMLElement => renderMath(latex);
	mj.startup = { ...((mj.startup as Record<string, unknown>) ?? {}), document: {} };
	w.MathJax = mj;
	return Promise.resolve();
}

export function renderMath(latex: string): HTMLElement {
	const el = createEl('span', { cls: 'mjx-container' });
	el.setAttribute('data-tex', latex);
	el.textContent = latex;
	return el;
}

export function finishRenderMath(): Promise<void> {
	return Promise.resolve();
}

export const Platform = { isDesktopApp: true, isMobile: false, isMobileApp: false, isDesktop: true };
