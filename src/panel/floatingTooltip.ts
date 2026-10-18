/**
 * 悬停提示浮层（符号按钮 / 模板条目专用）
 *
 * 需求（王先生 2026-10-18）：鼠标移到按钮上方时弹出提示，
 * **第一行显示 LaTeX 源码、第二行显示中文 / 英文备注**。
 *
 * 原生 `title` 属性做不到两行样式化文本（且各平台渲染差异大），故自建：
 *  · 全局单例，挂 `document.body`，`position: fixed` 跟随按钮定位；
 *  · hover 延迟 `SHOW_DELAY` 毫秒再显示（避免扫过时连续弹出），移出立即收起；
 *  · 键盘焦点（Tab）同样触发，保证可达性；
 *  · 滚动 / 窗口缩放 / Esc 时收起；
 *  · `pointer-events: none`：浮层不拦截鼠标，不会打断点击。
 */

import { makeEl } from './ui';

/** hover 多久后显示（毫秒） */
const SHOW_DELAY = 300;

/** 浮层与按钮的间距 */
const GAP = 8;

/** 浮层与视口边缘的最小留白 */
const EDGE = 8;

export interface TooltipContent {
	/** 第一行：LaTeX 源码 */
	latex: string;
	/** 第二行：中文 / 英文备注；省略时只显示一行 */
	remark?: string;
}

export class FloatingTooltip {
	private static shared_: FloatingTooltip | null = null;

	/** 全局单例：面板内所有按钮共用同一个浮层，避免重复建节点 */
	static shared(): FloatingTooltip {
		FloatingTooltip.shared_ ??= new FloatingTooltip();
		return FloatingTooltip.shared_;
	}

	private readonly el: HTMLElement;
	private readonly codeEl: HTMLElement;
	private readonly remarkEl: HTMLElement;
	private timer: number | null = null;
	private current: HTMLElement | null = null;

	private constructor() {
		this.el = makeEl('div', { cls: 'mathbox-tip', attr: { role: 'tooltip' } });
		this.codeEl = makeEl('code', { cls: 'mathbox-tip-latex', parent: this.el });
		this.remarkEl = makeEl('div', { cls: 'mathbox-tip-remark', parent: this.el });
		this.el.hidden = true;
		document.body.appendChild(this.el);

		// 捕获阶段监听滚动：面板内滚动容器（非 window）也要能收起
		window.addEventListener('scroll', this.hide, true);
		window.addEventListener('resize', this.hide);
		document.addEventListener('keydown', this.onKeyDown, true);
	}

	/**
	 * 给目标元素绑定悬停提示。
	 * `content` 用惰性函数，浮层真正显示时才求值（切换语言后无需重新绑定）。
	 */
	attach(target: HTMLElement, content: () => TooltipContent): void {
		target.addEventListener('mouseenter', () => this.schedule(target, content));
		target.addEventListener('mouseleave', this.hide);
		target.addEventListener('focus', () => this.schedule(target, content));
		target.addEventListener('blur', this.hide);
	}

	/** 立即收起（滚动、缩放、Esc、鼠标移出时调用） */
	hide = (): void => {
		this.cancelTimer();
		if (!this.el.hidden) {
			this.el.hidden = true;
			this.current = null;
		}
	};

	private readonly onKeyDown = (ev: KeyboardEvent): void => {
		if (ev.key === 'Escape') this.hide();
	};

	private cancelTimer(): void {
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
	}

	private schedule(target: HTMLElement, content: () => TooltipContent): void {
		this.cancelTimer();
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.show(target, content());
		}, SHOW_DELAY);
	}

	private show(target: HTMLElement, content: TooltipContent): void {
		if (!target.isConnected) return;
		this.current = target;

		this.codeEl.textContent = content.latex;
		if (content.remark) {
			this.remarkEl.textContent = content.remark;
			this.remarkEl.hidden = false;
		} else {
			this.remarkEl.hidden = true;
		}

		this.el.hidden = false;
		this.place(target);
	}

	/** 定位：默认在按钮下方居中；下方放不下则翻到上方；左右夹在视口内 */
	private place(target: HTMLElement): void {
		const anchor = target.getBoundingClientRect();
		const box = this.el.getBoundingClientRect();

		let left = anchor.left + anchor.width / 2 - box.width / 2;
		left = Math.max(EDGE, Math.min(left, window.innerWidth - box.width - EDGE));

		let top = anchor.bottom + GAP;
		if (top + box.height > window.innerHeight - EDGE) top = anchor.top - box.height - GAP;
		if (top < EDGE) top = EDGE;

		this.el.style.left = `${Math.round(left)}px`;
		this.el.style.top = `${Math.round(top)}px`;
	}
}
