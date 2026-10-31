/**
 * 面板 DOM 辅助与图标
 *
 *  · Icons               —— Lucide 图标名常量（经宿主 setIcon 注入）
 *  · windowIcon          —— 宿主同款 12×12 窗口控件 SVG（min/max/restore/close）
 *  · makeEl / setBtnIcon —— DOM 创建与图标注入辅助
 *  · 按钮 / 下拉构造      —— windowControlButton / iconButton / buildSelect 等
 *  · clamp —— 数值小工具
 */

import { setIcon } from 'obsidian';

// ---------------------------------------------------------------- 图标常量

export const Icons = {
	brand: 'sigma',
	/** 宿主内置的侧边栏开合动画图标（外框 rect + 内条 rect，随开合加宽） */
	sideToggle: 'sidebar-toggle-button-icon',
	star: 'star',
	settings: 'settings',
	download: 'download',
	copy: 'copy',
	eraser: 'eraser',
	pin: 'pin',
	unpin: 'pin-off',
	pencil: 'pencil',
	trash: 'trash-2',
	chevronDown: 'chevron-down',
} as const;

// ---------------------------------------------------------------- 窗口控件 SVG（宿主同款）

/**
 * 窗口控件图标（12×12 细线，几何参数逐项取自 Obsidian titlebar-button，
 * 与 Obsidian 在 Windows 下的最小化 / 最大化 / 还原 / 关闭图标完全一致；
 * 以 createElementNS 构建，不经过 innerHTML）
 */
export type WindowIconKind = 'minimize' | 'maximize' | 'restore' | 'close';

const SVG_NS = 'http://www.w3.org/2000/svg';

export function windowIcon(kind: WindowIconKind): SVGSVGElement {
	const svg = document.createElementNS(SVG_NS, 'svg');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('width', '12');
	svg.setAttribute('height', '12');
	svg.setAttribute('viewBox', '0 0 12 12');

	const add = (tag: 'rect' | 'path', attrs: Record<string, string>): void => {
		const el = document.createElementNS(SVG_NS, tag);
		for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
		svg.appendChild(el);
	};

	switch (kind) {
		case 'minimize':
			add('rect', { fill: 'currentColor', width: '10', height: '1', x: '1', y: '6' });
			break;
		case 'maximize':
			add('rect', { width: '9', height: '9', x: '1.5', y: '1.5', fill: 'none', stroke: 'currentColor' });
			break;
		case 'restore':
			svg.setAttribute('fill', 'none');
			add('path', { d: 'M1.5 3.5H8.5V10.5H1.5V3.5Z', stroke: 'currentColor' });
			add('path', { d: 'M4 2H10V8H9V9H11V1H3V3H4V2Z', fill: 'currentColor' });
			break;
		case 'close':
			add('path', {
				d: 'M10.052 10.968 1.03 1.93l.849-.848 9.023 9.037-.849.848Z',
				fill: 'currentColor',
				'fill-rule': 'evenodd',
			});
			add('path', {
				d: 'M1.023 10.112 10.06 1.09l.848.85-9.037 9.023-.848-.85Z',
				fill: 'currentColor',
				'fill-rule': 'evenodd',
			});
			break;
	}
	return svg;
}

// ---------------------------------------------------------------- DOM 创建辅助

export interface ElOptions {
	cls?: string;
	text?: string;
	attr?: Record<string, string>;
	parent?: HTMLElement;
}

export function makeEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options: ElOptions = {},
): HTMLElementTagNameMap[K] {
	const node = createEl(tag);
	if (options.cls) node.className = options.cls;
	if (options.text !== undefined) node.textContent = options.text;
	if (options.attr) {
		for (const [key, value] of Object.entries(options.attr)) node.setAttribute(key, value);
	}
	if (options.parent) options.parent.appendChild(node);
	return node;
}

/** 在按钮内放置一个 Lucide 图标 */
export function setBtnIcon(btn: HTMLElement, name: string): void {
	btn.replaceChildren();
	const holder = makeEl('span', { cls: 'mathbox-icon' });
	setIcon(holder, name);
	btn.appendChild(holder);
}

// ---------------------------------------------------------------- 按钮 / 下拉构造

/**
 * 窗口控件按钮：直接复用宿主 `.titlebar-button` 类。
 * 观感与交互随宿主平台自动一致（Windows：padding 0 16px、悬停灰底；
 * 关闭键悬停红底白图标），图标用宿主同款 12×12 细线几何。
 */
export function windowControlButton(
	mod: 'mod-minimize' | 'mod-maximize' | 'mod-close',
	icon: WindowIconKind,
	label: string,
	onClick: () => void,
	parent?: HTMLElement,
): HTMLElement {
	const btn = makeEl('div', {
		cls: `mathbox-wbtn titlebar-button ${mod}`,
		attr: { 'aria-label': label },
		...(parent ? { parent } : {}),
	});
	btn.appendChild(windowIcon(icon));
	btn.addEventListener('click', onClick);
	return btn;
}

export interface IconButtonOptions {
	cls?: string;
	parent?: HTMLElement;
}

/** 图标按钮：统一 27×27，带 aria-label 与 title */
export function iconButton(
	iconName: string,
	label: string,
	options: IconButtonOptions = {},
): HTMLButtonElement {
	const btn = makeEl('button', {
		cls: `mathbox-btn ${options.cls ?? ''}`.trim(),
		attr: { type: 'button', 'aria-label': label },
		...(options.parent ? { parent: options.parent } : {}),
	});
	btn.title = label;
	setBtnIcon(btn, iconName);
	return btn;
}

export interface SelectOption {
	value: string;
	label: string;
	/** 选项右侧的色板（颜色下拉用） */
	swatch?: string;
}

/** 原生 select + Obsidian dropdown 外观 */
export function buildSelect(
	options: readonly SelectOption[],
	value: string,
	onChange: (value: string) => void,
	label: string,
): HTMLSelectElement {
	const select = makeEl('select', { cls: 'dropdown mathbox-select', attr: { 'aria-label': label } });
	select.title = label;
	for (const option of options) {
		const opt = makeEl('option', { text: option.label, attr: { value: option.value } });
		if (option.swatch) opt.style.setProperty('--mathbox-swatch', option.swatch);
		select.appendChild(opt);
	}
	select.value = value;
	select.addEventListener('change', () => onChange(select.value));
	return select;
}

// ---------------------------------------------------------------- 加减号步进器

export interface StepperOptions {
	/** 组合的无障碍名称（如「预览字号」） */
	label: string;
	/** 当前值（px） */
	value: number;
	min: number;
	max: number;
	/** 输入框清空（提交空值）时的复位目标（默认字号） */
	defaultValue: number;
	/** 减小 / 增大按钮的无障碍名称 */
	decreaseLabel: string;
	increaseLabel: string;
	/** 数值输入框的悬停提示（含「可直接输入 / 清空复位」说明） */
	valueHint?: string;
	onChange: (value: number) => void;
	parent?: HTMLElement;
}

export interface StepperApi {
	el: HTMLElement;
	getValue(): number;
	/** 外部同步（设置页改动后回写界面）；emit 为 true 时触发 onChange */
	setValue(value: number, emit?: boolean): void;
}

/**
 * 加减号步进器（v3.4.1 字号调节）：
 *   `−` / 数值输入框 / `＋` 三段，两侧按钮 27×27（与 `iconButton` **完全同宽同高**）。
 *
 * 交互：
 *  · 单击 ±1；到达上下界时对应按钮自动禁用；
 *  · 数值框**可直接键入**：点击即全选，回车 / 失焦提交，Esc 撤销，越界夹取，清空则回默认字号；
 *  · 键盘：↑/↓ 调节（输入框内与外层一致）。
 */
export function createStepper(options: StepperOptions): StepperApi {
	const { min, max, defaultValue } = options;
	let value = clamp(Math.round(options.value), min, max);

	const el = makeEl('div', {
		cls: 'mathbox-stepper',
		attr: { role: 'group', 'aria-label': options.label },
		...(options.parent ? { parent: options.parent } : {}),
	});

	const minusBtn = makeEl('button', {
		cls: 'mathbox-stepper-btn',
		text: '−',
		attr: { type: 'button', 'aria-label': options.decreaseLabel },
		parent: el,
	});
	const valueInput = makeEl('input', {
		cls: 'mathbox-stepper-value',
		attr: {
			type: 'text',
			inputmode: 'numeric',
			autocomplete: 'off',
			spellcheck: 'false',
			'aria-label': options.label,
			// 声明「本控件自行处理 Esc」：面板关窗监听在捕获阶段，需要它放行
			'data-esc-stop': '1',
		},
		parent: el,
	});
	const plusBtn = makeEl('button', {
		cls: 'mathbox-stepper-btn',
		text: '＋',
		attr: { type: 'button', 'aria-label': options.increaseLabel },
		parent: el,
	});

	valueInput.title = options.valueHint ?? options.label;

	function paint(): void {
		valueInput.value = String(value);
		minusBtn.toggleAttribute('disabled', value <= min);
		plusBtn.toggleAttribute('disabled', value >= max);
		el.setAttribute('data-value', String(value));
	}

	function commit(next: number, emit = true): void {
		const clamped = clamp(Math.round(next), min, max);
		if (clamped === value) return;
		value = clamped;
		paint();
		if (emit) options.onChange(value);
	}

	/** 提交输入框内容：空 → 默认字号；非法 → 回填当前值；越界 → 夹取 */
	function commitInput(): void {
		// 面板已销毁 / 节点已脱离文档时不再提交，避免把「关闭面板前的半截输入」写进设置
		if (!valueInput.isConnected) return;
		const raw = valueInput.value.trim();
		if (raw === '') {
			commit(defaultValue);
			paint();
			return;
		}
		const parsed = Number.parseFloat(raw);
		if (!Number.isFinite(parsed)) {
			paint();
			return;
		}
		commit(parsed);
		paint();
	}

	minusBtn.addEventListener('click', () => commit(value - 1));
	plusBtn.addEventListener('click', () => commit(value + 1));

	// 数值框：点击即全选，便于直接改写
	valueInput.addEventListener('focus', () => valueInput.select());
	valueInput.addEventListener('click', () => valueInput.select());
	valueInput.addEventListener('blur', () => commitInput());
	valueInput.addEventListener('keydown', (ev: KeyboardEvent) => {
		// 关键：Esc 必须在此拦截并阻止冒泡 —— 否则会冒到面板 / 窗口层，
		// 被宿主当作「关闭面板」，用户的「撤销本次输入」变成「关掉整个面板」。
		if (ev.key === 'Enter') {
			ev.preventDefault();
			ev.stopPropagation();
			commitInput();
			valueInput.select();
		} else if (ev.key === 'Escape') {
			ev.preventDefault();
			ev.stopPropagation();
			paint();
			valueInput.blur();
		} else if (ev.key === 'ArrowUp') {
			ev.preventDefault();
			ev.stopPropagation();
			commit(value + 1);
			valueInput.select();
		} else if (ev.key === 'ArrowDown') {
			ev.preventDefault();
			ev.stopPropagation();
			commit(value - 1);
			valueInput.select();
		}
	});

	// 键盘调节：焦点在 ± 按钮上时也生效（输入框内的方向键已单独处理，避免双步进）
	el.addEventListener('keydown', (ev: KeyboardEvent) => {
		if (ev.target === valueInput) return;
		if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') {
			ev.preventDefault();
			commit(value + 1);
		} else if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') {
			ev.preventDefault();
			commit(value - 1);
		}
	});

	paint();

	return {
		el,
		getValue: () => value,
		setValue(next: number, emit = false): void {
			commit(next, emit);
			paint();
		},
	};
}

// ---------------------------------------------------------------- 数值 / 主题小工具

export function clamp(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}
