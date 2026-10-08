/**
 * 分组选择器（快捷工具 / 公式模板 / 收藏夹共用）
 *
 * 交互范式（v3.2 定稿）：
 *  · 页顶一个「选择按钮」，显示当前所在分组 + 下拉箭头；
 *  · 单击按钮弹出全部分组的列表（当前分组高亮），点选即**快速跳转**到该分组
 *    ——跳转 = 滚动容器滚到该分组标题处，内容区始终保留全部分组，不会只显示一个；
 *  · 手动滚动内容区时反向联动：按钮文案与列表高亮同步切换到当前分组（scroll spy）；
 *  · 分组只有一项时同样可弹出（列表仅一行），交互行为不退化。
 *
 * 实现要点：
 *  · 下拉列表挂 document.body 并以 position:fixed 对齐选择按钮——
 *    侧边栏控制行有 overflow 裁剪，内挂会被切掉；
 *  · **层级必须高于 Obsidian Modal**：宿主 --layer-modal 为 50、--layer-popover 为 30，
 *    若沿用 popover 层级，下拉会被 Modal 盖住而「看似点不动」；
 *    故 CSS 取 --layer-menu（65），与宿主自身菜单同级；
 *  · 外部点击通过 document 级 pointerdown（捕获阶段）检测，Esc 亦可收起；
 *    宿主节点被移除或 destroy() 后监听自动清理，不泄漏。
 */

import { setIcon } from 'obsidian';
import { Icons, makeEl } from '../ui';

// ---------------------------------------------------------------- 类型

/** 下拉列表中的一个可选项 */
export interface GroupSelectItem {
	id: string;
	label: string;
}

export interface GroupSelectOptions {
	/** 选择按钮的挂载容器（侧边栏控制行） */
	parent: HTMLElement;
	/** 全部分组（允许只有 1 项） */
	items: readonly GroupSelectItem[];
	/** 选择按钮 tooltip */
	hint: string;
	/** 点选回调：跳转动作由外部执行（滚动到该分组），index 为 items 下标 */
	onSelect: (index: number) => void;
}

export interface GroupSelectApi {
	/** 选择按钮元素 */
	readonly el: HTMLButtonElement;
	/** 当前选中下标 */
	current(): number;
	/** 滚动联动：只更新按钮文案与列表高亮，不触发 onSelect（避免滚动→跳转回环） */
	setCurrent(index: number): void;
	/** 程序化点选：等同点列表项（更新高亮 + 触发 onSelect） */
	pick(index: number): void;
	/** 收起下拉并移除全部监听（容器销毁 / 切换标签页前调用） */
	destroy(): void;
}

// ---------------------------------------------------------------- 实现

export function createGroupSelect(options: GroupSelectOptions): GroupSelectApi {
	const { items, hint, onSelect } = options;

	let current = 0;
	let dropdown: HTMLElement | null = null;
	let outsideListener: ((ev: PointerEvent) => void) | null = null;
	let keyListener: ((ev: KeyboardEvent) => void) | null = null;

	// ---- 选择按钮（当前分组名 + 下拉箭头） ----
	const selectBtn = makeEl('button', {
		cls: 'mathbox-gselect',
		attr: { type: 'button', 'aria-haspopup': 'listbox' },
		parent: options.parent,
	});
	selectBtn.title = hint;
	const label = makeEl('span', {
		cls: 'mathbox-gselect-label',
		text: items[0]?.label ?? '',
		parent: selectBtn,
	});
	const iconHolder = makeEl('span', { cls: 'mathbox-icon', parent: selectBtn });
	setIcon(iconHolder, Icons.chevronDown);

	// ---- 下拉列表的收起（含监听清理） ----
	const closeDropdown = (): void => {
		dropdown?.remove();
		dropdown = null;
		if (outsideListener) {
			document.removeEventListener('pointerdown', outsideListener, true);
			outsideListener = null;
		}
		if (keyListener) {
			document.removeEventListener('keydown', keyListener, true);
			keyListener = null;
		}
		selectBtn.classList.remove('is-open');
	};

	// ---- 当前分组（按钮文案 + 列表高亮） ----
	const paintCurrent = (index: number): void => {
		current = index;
		label.textContent = items[index]?.label ?? '';
		if (!dropdown) return;
		const entries = dropdown.querySelectorAll<HTMLElement>('.mathbox-gselect-item');
		entries.forEach((entry, i) => entry.classList.toggle('is-active', i === index));
	};

	// ---- 点选：外部执行跳转 ----
	const pick = (index: number): void => {
		if (index < 0 || index >= items.length) return;
		paintCurrent(index);
		closeDropdown();
		onSelect(index);
	};

	// ---- 下拉列表的展开 / 再点收起 ----
	const toggleDropdown = (): void => {
		if (dropdown) {
			closeDropdown();
			return;
		}
		const menu = makeEl('div', { cls: 'mathbox-gselect-dropdown' });
		dropdown = menu;
		document.body.appendChild(menu);

		items.forEach((item, index) => {
			const entry = makeEl('button', {
				cls: `mathbox-gselect-item${index === current ? ' is-active' : ''}`,
				text: item.label,
				attr: { type: 'button', role: 'option' },
				parent: menu,
			});
			entry.addEventListener('click', () => pick(index));
		});

		// 定位：贴选择按钮下沿；下方空间不足则翻到上方，左右夹在视口内
		const rect = selectBtn.getBoundingClientRect();
		const width = Math.max(rect.width, 120);
		menu.style.width = `${width}px`;
		menu.style.left = `${Math.min(rect.left, Math.max(8, window.innerWidth - width - 8))}px`;
		const below = rect.bottom + 2;
		const needed = menu.offsetHeight;
		menu.style.top =
			below + needed > window.innerHeight && rect.top - needed - 2 > 0
				? `${rect.top - needed - 2}px`
				: `${below}px`;
		selectBtn.classList.add('is-open');

		outsideListener = (ev: PointerEvent) => {
			// 宿主节点已被移除（如切换标签页）时自我清理，避免监听泄漏
			if (!dropdown || !dropdown.isConnected || !selectBtn.isConnected) {
				closeDropdown();
				return;
			}
			const target = ev.target;
			if (target instanceof Node && !dropdown.contains(target) && !selectBtn.contains(target)) {
				closeDropdown();
			}
		};
		document.addEventListener('pointerdown', outsideListener, true);

		keyListener = (ev: KeyboardEvent) => {
			if (ev.key === 'Escape') closeDropdown();
		};
		document.addEventListener('keydown', keyListener, true);
	};

	selectBtn.addEventListener('click', toggleDropdown);

	return {
		el: selectBtn,
		current: () => current,
		setCurrent: (index: number) => {
			if (index < 0 || index >= items.length || index === current) return;
			paintCurrent(index);
		},
		pick,
		destroy: closeDropdown,
	};
}
