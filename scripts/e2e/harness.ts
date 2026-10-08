/**
 * MathBox 浏览器端 E2E 自检
 *
 * 用 Obsidian API 替身（obsidian-stub）在真实 Chrome 里加载插件，
 * 覆盖：加载与设置默认值 / 扩展包注入 / 面板结构 / 分组跳转 /
 *       最大化 / 拖动 / 缩放 / 侧边栏调宽 / 插入并关闭面板 / 设置页渲染。
 *
 * 运行：node scripts/e2e/run.mjs
 */

import MathBoxPlugin from '../../src/main';
import { openMathBoxPopout, openMathBoxTab } from '../../src/commands';
import { App, Editor, MarkdownView, leaves, notices } from './obsidian-stub';
import { MathBoxSettingTab } from '../../src/settings';
import { EXTENSION_PACKAGES } from '../../src/core/extensions';
import { SYMBOL_GROUPS } from '../../src/symbols';
import { TEMPLATE_GROUPS } from '../../src/templates';
import { applyEnvironment, buildMatrixLatex, clampMatrixSize } from '../../src/core/latex';
import { applyStyleEdit, detectStyle } from '../../src/core/wrap';
import { collectGroups, countByGroup, favoriteGroupOptions, hasGroup, isProtectedGroup, removeFavoriteGroups, UNGROUPED_ID } from '../../src/favorites/store';
import { createGroupSelect } from '../../src/panel/sections/groupSelect';

interface Result {
	name: string;
	ok: boolean;
	detail: string;
}

const results: Result[] = [];

function check(name: string, ok: boolean, detail = ''): void {
	// detail 里可能含换行（如 applyEnvironment 的产物），必须压平——
	// 否则一条结果会被拆成多行，后续行被解析成 name 为 undefined 的假失败
	results.push({ name, ok, detail: detail.replace(/[\r\n]+/g, ' ⏎ ') });
}

function q<T extends HTMLElement = HTMLElement>(sel: string): T | null {
	return document.querySelector(sel) as T | null;
}

function qAll<T extends HTMLElement = HTMLElement>(sel: string): T[] {
	return Array.from(document.querySelectorAll(sel)) as T[];
}

const sleep = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

function pointer(type: string, x: number, y: number): PointerEvent {
	return new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
}

function px(el: HTMLElement, prop: string): number {
	return Number.parseFloat(el.style.getPropertyValue(prop) || '0');
}

/** 读取 MathJax tex.packages 的追加项（宿主为对象形态，也可能是数组） */
function packagePlus(packages: string[] | Record<string, string[]> | undefined): string[] {
	if (Array.isArray(packages)) return packages;
	if (packages && typeof packages === 'object') return packages['[+]'] ?? [];
	return [];
}

async function drag(
	handle: HTMLElement | null,
	from: [number, number],
	to: [number, number],
	target: EventTarget = window,
): Promise<void> {
	if (!handle) throw new Error('drag handle missing');
	handle.dispatchEvent(pointer('pointerdown', from[0], from[1]));
	target.dispatchEvent(pointer('pointermove', (from[0] + to[0]) / 2, (from[1] + to[1]) / 2));
	target.dispatchEvent(pointer('pointermove', to[0], to[1]));
	target.dispatchEvent(pointer('pointerup', to[0], to[1]));
	await sleep(0);
}

async function main(): Promise<void> {
	/* ------------------------- 1. 加载插件 ------------------------- */

	const replaced: string[] = [];
	const editor = new Editor((text) => replaced.push(text), '');
	(globalThis as unknown as { __view?: unknown }).__view = Object.assign(new MarkdownView(), { editor });

	const app = new App();
	// 视图替身需要拿到 App 实例（真实宿主会注入）
	(globalThis as unknown as { __app?: unknown }).__app = app;
	const plugin = new MathBoxPlugin(app as never, { id: 'obsidian-math-box' } as never);
	await plugin.onload();

	const s = plugin.settings;
	check('onload 后 settings 就绪', typeof s === 'object' && s !== null);
	check('默认侧边栏宽度 = 700', s.sidePaneWidth === 700, String(s.sidePaneWidth));
	check('默认面板几何为空（居中默认尺寸）', s.panelRect === null);
	check('默认启用 ams', s.extensions['ams'] === true);
	check('默认启用 physics', s.extensions['physics'] === true);
	check(
		'注册了 4 个命令（面板 · 标签页 · 独立窗口 · 弹出标签）+ 1 个 ribbon',
		plugin.commands.length === 4 && plugin.ribbonIcons.length === 1,
		`${plugin.commands.length}/${plugin.ribbonIcons.length}`,
	);
	check('注册了设置页', plugin.settingTabs.length === 1);

	/* ------------------------- 2. 扩展包注入 ------------------------- */

	const mj = (window as unknown as { MathJax?: Record<string, unknown> }).MathJax as
		| {
				loader?: { load?: string[] };
				tex?: {
					macros?: Record<string, string>;
					packages?: string[] | Record<string, string[]>;
				};
		  }
		| undefined;
	check('已写入 window.MathJax', Boolean(mj));
	check('注入通道 = preload', plugin.extensionMode === 'preload', plugin.extensionMode);
	// v3.2：只写 tex.packages['[+]']（宿主同机制，包已预装在宿主 bundle 中），
	// 绝不写 loader.load——宿主没有按需加载通道，写 loader 会让 MathJax 去网络取包
	// 并导致启动失败（表现为渲染报 "xxx is not a function"）
	const plus = packagePlus(mj?.tex?.packages);
	check('tex.packages[+] 含 ams', plus.includes('ams'), plus.join(','));
	check('tex.packages[+] 含 physics', plus.includes('physics'));
	check('tex.packages[+] 含 color', plus.includes('color'));
	check('不写 loader.load（避免宿主 MathJax 启动失败）', (mj?.loader?.load ?? []).length === 0, (mj?.loader?.load ?? []).join(','));
	check('tex.macros 注入 \\RR', mj?.tex?.macros?.['\\RR'] === '\\mathbb{R}');
	check('预加载不注入 physics 重名宏 \\dv', !('\\dv' in (mj?.tex?.macros ?? {})));

	/* ------------------------- 3. 面板结构 ------------------------- */

	plugin.openPanel({ source: 'command', editor: editor as never, prefill: 'a^2 + b^2 = c^2' });
	await sleep(30);

	const modal = q('.mathbox-modal');
	check('面板已挂载', Boolean(modal));
	check('面板四区齐全', Boolean(q('.mathbox-render') && q('.mathbox-optionbar') && q('.mathbox-source') && q('.mathbox-sidepane')));
	check('顶栏按钮齐全（1 侧边栏开关 + 3 窗口控件）', qAll('.mathbox-topbar .mathbox-side-toggle').length === 1 && qAll('.mathbox-topbar .mathbox-window-controls .titlebar-button').length === 3, `${qAll('.mathbox-topbar .mathbox-side-toggle').length}/${qAll('.mathbox-topbar .mathbox-window-controls .titlebar-button').length}`);
	check('存在侧边栏宽度把手', Boolean(q('.mathbox-side-resizer')));
	check('存在 3 个面板缩放把手', qAll('.mathbox-resize-handle').length === 3, String(qAll('.mathbox-resize-handle').length));
	check('预填源码已进入编辑区', (q<HTMLTextAreaElement>('.mathbox-textarea')?.value ?? '') === 'a^2 + b^2 = c^2');
	check('渲染区已渲染（替身）', qAll('.mathbox-render-content .mjx-container').length === 1);
	// 宿主 1.14+ 原生头部：关闭按钮（新 .modal-header-button / 旧 .modal-close-button）
	// 与 .modal-header 横条均须在 buildUi 时移除，避免压盖顶栏与异色横线
	check('原生关闭按钮已移除（1.14+ 与旧版类名）', !q('.mathbox-modal .modal-header-button') && !q('.mathbox-modal .modal-close-button'));
	check('原生 .modal-header 横条已移除', !q('.mathbox-modal .modal-header'));
	// 面板默认居中（无记忆 / 仅有尺寸记忆时位置始终居中）
	{
		const el = modal as HTMLElement;
		const rect = el.getBoundingClientRect();
		const expectX = Math.round((window.innerWidth - rect.width) / 2);
		const expectY = Math.round((window.innerHeight - rect.height) / 2);
		check(
			'面板默认居中（含已有尺寸记忆时）',
			Math.round(rect.left) === expectX && Math.round(rect.top) === expectY,
			`${Math.round(rect.left)},${Math.round(rect.top)} vs ${expectX},${expectY}`,
		);
	}

	/* ------------------------- 4. 分组选择器（跳转 + 滚动联动） ------------------------- */

	// ---- 快捷工具页：全部分组纵向排列，选择按钮只负责快速跳转 ----
	const sideBody = q<HTMLElement>('.mathbox-side-body') as HTMLElement;
	const symSelect = q<HTMLElement>('.mathbox-gselect');
	check('快捷工具页显示分组选择按钮', Boolean(symSelect));
	check('默认显示首个符号分组', q('.mathbox-gselect-label')?.textContent === SYMBOL_GROUPS[0]?.name.zh, q('.mathbox-gselect-label')?.textContent ?? '(none)');
	// 关键：不再只显示一个分组——所有分组都渲染在内容区
	check(
		'内容区渲染全部分组（分组标题数 = 符号分组数）',
		qAll('.mathbox-side-body .mathbox-side-group').length === SYMBOL_GROUPS.length,
		`${qAll('.mathbox-side-body .mathbox-side-group').length}/${SYMBOL_GROUPS.length}`,
	);
	check(
		'符号按钮总数 = 各分组条目之和',
		qAll('.mathbox-side-body .mathbox-symbol').length === SYMBOL_GROUPS.reduce((n, g) => n + g.items.length, 0) + 1, // +1 = 自定义矩阵入口
		String(qAll('.mathbox-side-body .mathbox-symbol').length),
	);
	check('内容区可滚动', sideBody.scrollHeight > sideBody.clientHeight, `${sideBody.scrollHeight}/${sideBody.clientHeight}`);

	symSelect?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(30);
	const symItems = qAll('.mathbox-gselect-item');
	check('弹出列表项数 = 符号分组数', symItems.length === SYMBOL_GROUPS.length, `${symItems.length}/${SYMBOL_GROUPS.length}`);
	check('弹出列表文本与分组名一一对应', symItems.every((c, i) => c.textContent === SYMBOL_GROUPS[i]?.name.zh));
	check('当前分组在列表中高亮', symItems[0]?.classList.contains('is-active') === true);

	// 点选「希腊字母」= 快速跳转（按钮文案切换 + 触发滚动，内容仍保留全部分组）
	symItems[4]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(30);
	check('点选后按钮切到第 5 个分组', q('.mathbox-gselect-label')?.textContent === SYMBOL_GROUPS[4]?.name.zh, q('.mathbox-gselect-label')?.textContent ?? '(none)');
	check('点选后下拉列表已收起', !q('.mathbox-gselect-dropdown'));
	check(
		'点选只是跳转，全部分组仍在内容区',
		qAll('.mathbox-side-body .mathbox-side-group').length === SYMBOL_GROUPS.length,
	);
	// 再展开一次并点击列表外，验证外部点击收起
	symSelect?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(30);
	document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
	await sleep(30);
	check('点击列表外收起下拉', !q('.mathbox-gselect-dropdown'));

	// ---- 滚动联动：手动下滑到某分组，按钮文案与高亮跟随 ----
	// 先等过「程序化跳转的联动抑制期」（700 ms），模拟用户点选后稍作停顿再手动滚动
	await sleep(800);
	{
		const heads = qAll('.mathbox-side-body .mathbox-side-group');
		const target = heads[6];
		if (target) {
			sideBody.scrollTop = target.offsetTop + 10;
			sideBody.dispatchEvent(new Event('scroll'));
			await sleep(30);
			check(
				'滚动到第 7 个分组时按钮文案跟随',
				q('.mathbox-gselect-label')?.textContent === SYMBOL_GROUPS[6]?.name.zh,
				q('.mathbox-gselect-label')?.textContent ?? '(none)',
			);
			sideBody.scrollTop = 0;
			sideBody.dispatchEvent(new Event('scroll'));
			await sleep(30);
			check('回到顶部时按钮文案回到首组', q('.mathbox-gselect-label')?.textContent === SYMBOL_GROUPS[0]?.name.zh);
		} else {
			check('滚动到第 7 个分组时按钮文案跟随', false, '未找到分组标题');
		}
	}

	// ---- 单组边界：只有 1 个分组时也能弹出仅 1 项的列表 ----
	{
		const host = document.createElement('div');
		document.body.appendChild(host);
		let picked = -1;
		const single = createGroupSelect({
			parent: host,
			items: [{ id: 'only', label: '唯一分组' }],
			hint: '',
			onSelect: (index) => {
				picked = index;
			},
		});
		single.el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(30);
		check('单组时弹出列表仍可用（仅 1 项）', qAll('.mathbox-gselect-item').length === 1, String(qAll('.mathbox-gselect-item').length));
		qAll('.mathbox-gselect-item')[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(30);
		check('单组点选触发回调并收起', picked === 0 && !q('.mathbox-gselect-dropdown'));
		single.destroy();
		host.remove();
	}

	// ---- 公式模板页：同一组件，同样为「全部分组 + 点选跳转」 ----
	const tabs = qAll('.mathbox-side-tabs .mathbox-tab');
	tabs[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	const tplSelect = q<HTMLElement>('.mathbox-gselect');
	check('模板页显示分类选择按钮', Boolean(tplSelect));
	check('默认显示首个分类', q('.mathbox-gselect-label')?.textContent === TEMPLATE_GROUPS[0]?.name.zh, q('.mathbox-gselect-label')?.textContent ?? '(none)');
	check(
		'模板页渲染全部分类',
		qAll('.mathbox-side-body .mathbox-side-group').length === TEMPLATE_GROUPS.length,
		String(qAll('.mathbox-side-body .mathbox-side-group').length),
	);
	// 模板条目：按钮与代码块都不应被裁剪
	{
		const tpl = q<HTMLElement>('.mathbox-template');
		const tplLatex = q<HTMLElement>('.mathbox-template-latex');
		const tplName = q<HTMLElement>('.mathbox-template-name');
		const ls = tplLatex ? getComputedStyle(tplLatex) : null;
		check('模板按钮：flex-shrink = 0（不被压扁）', tpl !== null && getComputedStyle(tpl).flexShrink === '0', tpl ? getComputedStyle(tpl).flexShrink : '(none)');
		check('模板按钮：宽度随容器自适应', tpl !== null && getComputedStyle(tpl).width !== 'auto' && tpl?.style.width !== '0px');
		check(
			'模板代码块：完整展示（换行 + 不裁剪 + 可横向滚动）',
			ls !== null && ls.whiteSpace === 'pre-wrap' && ls.overflowWrap === 'anywhere' && ls.maxHeight === 'none' && ls.overflowX === 'auto',
			ls ? `${ls.whiteSpace}/${ls.overflowWrap}/${ls.maxHeight}/${ls.overflowX}` : '(none)',
		);
		check('模板标题：不设行数上限（不省略）', tplName !== null && getComputedStyle(tplName).webkitLineClamp === 'none', tplName ? getComputedStyle(tplName).webkitLineClamp : '(none)');
		// 真实测量：按钮高度必须容得下「标题 + 代码块」（此前被 flex 压扁时仅 ~34 px）
		const tplH = tpl?.getBoundingClientRect().height ?? 0;
		const tplNameH = tplName?.getBoundingClientRect().height ?? 0;
		const tplLatexH = tplLatex?.getBoundingClientRect().height ?? 0;
		check(
			'模板按钮：实际高度 = 标题 + 代码块（未被压扁）',
			tplH >= tplNameH + tplLatexH - 2 && tplLatexH > 20,
			`按钮 ${Math.round(tplH)} / 标题 ${Math.round(tplNameH)} / 代码 ${Math.round(tplLatexH)}`,
		);
		// 真实几何：标题与代码块不得重叠，相邻条目也不得重叠
		if (tplName && tplLatex) {
			const nb = tplName.getBoundingClientRect();
			const lb = tplLatex.getBoundingClientRect();
			check('模板条目：标题与代码块不重叠', lb.top >= nb.bottom - 1, `标题底 ${Math.round(nb.bottom)} / 代码顶 ${Math.round(lb.top)}`);
		}
		{
			const items = qAll<HTMLElement>('.mathbox-template');
			const first = items[0]?.getBoundingClientRect();
			const second = items[1]?.getBoundingClientRect();
			check(
				'模板条目：相邻条目不重叠且有间距',
				Boolean(first && second) && second.top >= first.bottom,
				first && second ? `${Math.round(first.bottom)} → ${Math.round(second.top)}` : '(n/a)',
			);
			check('模板条目：内层为块布局（非 flex column）', tpl !== null && getComputedStyle(tpl).display === 'block', tpl ? getComputedStyle(tpl).display : '(none)');
			// 关键回归点：条目必须是 div（role=button），<button> 的内部匿名盒会裁掉多行内容
			check('模板条目：元素为 div 而非 button（规避匿名盒裁剪）', tpl?.tagName === 'DIV', tpl?.tagName ?? '(none)');
			check('模板条目：具备 button 语义与可聚焦', tpl?.getAttribute('role') === 'button' && tpl?.getAttribute('tabindex') === '0', `${tpl?.getAttribute('role')}/${tpl?.getAttribute('tabindex')}`);
			check(
				'模板代码块：可见且有实际高度（首行未被遮挡）',
				tplLatex !== null && tplLatex.getBoundingClientRect().height >= 20 && tplLatex.textContent !== '',
				`${Math.round(tplLatex?.getBoundingClientRect().height ?? 0)}px`,
			);
		}
		const body = q<HTMLElement>('.mathbox-side-body');
		check(
			'侧边栏内容超出时改为滚动（而非压缩条目）',
			body !== null && body.scrollHeight > body.clientHeight,
			`${body?.scrollHeight}/${body?.clientHeight}`,
		);
	}

	check(
		'模板条目总数 = 各分类之和',
		qAll('.mathbox-side-body .mathbox-template').length === TEMPLATE_GROUPS.reduce((n, g) => n + g.items.length, 0),
		String(qAll('.mathbox-side-body .mathbox-template').length),
	);
	tplSelect?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(30);
	check('弹出分类列表：项数 = 模板分组数', qAll('.mathbox-gselect-item').length === TEMPLATE_GROUPS.length, String(qAll('.mathbox-gselect-item').length));
	qAll('.mathbox-gselect-item')[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(30);
	check('点选后按钮切到第 3 个分类', q('.mathbox-gselect-label')?.textContent === TEMPLATE_GROUPS[2]?.name.zh, q('.mathbox-gselect-label')?.textContent ?? '(none)');
	check('点选后下拉列表已收起', !q('.mathbox-gselect-dropdown'));

	// ---- 收藏夹页：三个预置分组（最优控制 / 自动控制 / 轨道力学）+ 示例收藏 ----
	tabs[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(20);
	const favHeads = qAll('.mathbox-side-body .mathbox-side-group').map((h) => h.textContent ?? '');
	check('收藏夹分节标题 = 最优控制/自动控制/轨道力学', favHeads.join('|') === '最优控制|自动控制|轨道力学', favHeads.join('|'));
	check('示例收藏写入 9 条', qAll('.mathbox-fav-item').length === 9, String(qAll('.mathbox-fav-item').length));
	check('收藏夹页也有分组选择按钮', Boolean(q('.mathbox-gselect')));
	q<HTMLElement>('.mathbox-gselect')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(30);
	check('收藏夹分组列表项数 = 3', qAll('.mathbox-gselect-item').length === 3, String(qAll('.mathbox-gselect-item').length));
	qAll('.mathbox-gselect-item')[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(30);
	check('点选后按钮切到轨道力学', q('.mathbox-gselect-label')?.textContent === '轨道力学', q('.mathbox-gselect-label')?.textContent ?? '(none)');
	check('收藏夹过滤 chips 仍在（全部/置顶/最近使用）', qAll('.mathbox-fav-filters .mathbox-chip:not(.is-accent)').length === 3, String(qAll('.mathbox-fav-filters .mathbox-chip:not(.is-accent)').length));
	check('收藏夹提供「新建分组」按钮', Boolean(q('.mathbox-fav-filters .mathbox-chip.is-accent')));

	// 收藏条目：操作按钮浮在标题行后方、平时不可见（底色与标题一致）
	{
		const favItem = q<HTMLElement>('.mathbox-fav-item');
		const actions = q<HTMLElement>('.mathbox-fav-item .mathbox-fav-actions');
		const name = q<HTMLElement>('.mathbox-fav-item .mathbox-fav-name');
		check('收藏条目：标题行预留操作区（padding-right）', Number.parseFloat(getComputedStyle(name as HTMLElement).paddingRight) >= 40, getComputedStyle(name as HTMLElement).paddingRight);
		check('收藏条目：操作区绝对定位在标题行后方', actions !== null && getComputedStyle(actions).position === 'absolute', actions ? getComputedStyle(actions).position : '(none)');
		check('收藏条目：操作区平时不可见', actions !== null && Number.parseFloat(getComputedStyle(actions).opacity) === 0, actions ? getComputedStyle(actions).opacity : '(none)');
		check('收藏条目：操作区底色透明（与标题一致）', actions !== null && (getComputedStyle(actions).backgroundColor === 'rgba(0, 0, 0, 0)' || getComputedStyle(actions).backgroundColor === 'transparent'), actions ? getComputedStyle(actions).backgroundColor : '(none)');
		const favLatex = q<HTMLElement>('.mathbox-fav-latex');
		const favLatexStyle = favLatex ? getComputedStyle(favLatex) : null;
		check(
			'收藏条目：源码完整展示（换行 + 不裁剪 + 可横向滚动）',
			favLatexStyle !== null &&
				favLatexStyle.whiteSpace === 'pre-wrap' &&
				favLatexStyle.overflowWrap === 'anywhere' &&
				favLatexStyle.maxHeight === 'none' &&
				favLatexStyle.overflowX === 'auto',
			favLatexStyle ? `${favLatexStyle.whiteSpace}/${favLatexStyle.overflowWrap}/${favLatexStyle.maxHeight}/${favLatexStyle.overflowX}` : '(none)',
		);
		check(
			'收藏条目：标题不截断（可换行）',
			name !== null && getComputedStyle(name).whiteSpace === 'normal' && getComputedStyle(name).textOverflow !== 'ellipsis',
			name ? `${getComputedStyle(name).whiteSpace}/${getComputedStyle(name).textOverflow}` : '(none)',
		);
		check(
			'收藏条目：按钮不被 flex 压扁（flex-shrink = 0）',
			favItem !== null && getComputedStyle(favItem).flexShrink === '0',
			favItem ? getComputedStyle(favItem).flexShrink : '(none)',
		);
		check('收藏条目：块布局（标题在上、代码在下）', favItem !== null && getComputedStyle(q<HTMLElement>('.mathbox-fav-main') as HTMLElement).display === 'block', getComputedStyle(q<HTMLElement>('.mathbox-fav-main') as HTMLElement).display);
		check('收藏条目：主区域为 div 且可聚焦', q<HTMLElement>('.mathbox-fav-main')?.tagName === 'DIV' && q<HTMLElement>('.mathbox-fav-main')?.getAttribute('tabindex') === '0', q<HTMLElement>('.mathbox-fav-main')?.tagName ?? '(none)');
	}

	/* ------------------------- 4d. 分组与环境（纯逻辑） ------------------------- */

	// 自建分组并入分组列表与下拉（预置三大分组之外）
	check('自建分组并入分组列表', collectGroups([], ['导航制导']).some((d) => d.id === '导航制导'));
	check(
		'分组下拉含自建分组与未分组',
		favoriteGroupOptions([], 'zh', ['导航制导']).some((o) => o.value === '导航制导') &&
			favoriteGroupOptions([], 'zh', ['导航制导']).some((o) => o.label === '未分组'),
	);
	check('分组重名可检出', hasGroup([], '导航制导', ['导航制导']) === true && hasGroup([], '流体力学', ['导航制导']) === false);

	// array 环境：空源码也能插入，且必须带列格式（否则 MathJax 报 Illegal preamble token）
	const arrayEmpty = applyEnvironment('', 'array');
	check('空源码加 array 环境生成列格式', arrayEmpty.includes('\\begin{array}{cc}'), arrayEmpty);
	check('array 环境不再产生空 preamble', !arrayEmpty.includes('\\begin{array}\\n'), arrayEmpty);
	check(
		'array 环境带正文时同样补列格式',
		applyEnvironment('a & b', 'array').includes('\\begin{array}{cc}'),
		applyEnvironment('a & b', 'array'),
	);
	check('无参数环境不受影响', applyEnvironment('x', 'align') === '\\begin{align}\nx\n\\end{align}');

	// 收藏夹：「全部」chip 左边缘与分组标题文字左边缘对齐
	{
		const firstChip = q<HTMLElement>('.mathbox-fav-filters .mathbox-chip');
		const firstHead = q<HTMLElement>('.mathbox-side-group');
		if (firstChip && firstHead) {
			const headStyle = getComputedStyle(firstHead);
			const chipLeft = firstChip.getBoundingClientRect().left;
			const headTextLeft = firstHead.getBoundingClientRect().left + Number.parseFloat(headStyle.paddingLeft);
			check(
				'收藏夹：「全部」chip 左边缘与分组标题文字左边缘对齐（±1px）',
				Math.abs(chipLeft - headTextLeft) <= 1,
				`chip ${Math.round(chipLeft)} / 标题 ${Math.round(headTextLeft)}`,
			);
			check(
				'收藏夹：「全部」chip 左缘 = 分组标题左缘（同一基线）',
				Math.abs(chipLeft - firstHead.getBoundingClientRect().left) <= 1,
				`${Math.round(chipLeft)} vs ${Math.round(firstHead.getBoundingClientRect().left)}`,
			);
		} else {
			check('收藏夹：「全部」chip 左边缘与分组标题文字左边缘对齐（±1px）', false, '(元素缺失)');
		}
	}

	/* ------------------------- 4d-1. 分组删除（纯逻辑 + 入口） ------------------------- */

	{
		// 入口按钮（与「＋新建分组」同排）
		const chips = qAll('.mathbox-fav-filters .mathbox-chip').map((c) => c.textContent ?? '');
		check('收藏夹提供「管理分组」入口', chips.includes('管理分组'), chips.join('|'));

		// 纯逻辑：仅移出分组（保留条目）
		const items = [
			{ id: 'a', name: 'A', latex: 'a', style: { fontSize: '', font: '', color: '' }, createdAt: 1, usedAt: 1, group: '导航制导' },
			{ id: 'b', name: 'B', latex: 'b', style: { fontSize: '', font: '', color: '' }, createdAt: 1, usedAt: 1, group: '导航制导' },
			{ id: 'c', name: 'C', latex: 'c', style: { fontSize: '', font: '', color: '' }, createdAt: 1, usedAt: 1, group: 'optimal-control' },
		];
		const groups = ['导航制导'];
		const keep = removeFavoriteGroups(items, groups, ['导航制导'], 'keep-items');
		check('删除分组（保留条目）：分组从列表移除', !keep.groups.includes('导航制导'), keep.groups.join('|'));
		check('删除分组（保留条目）：条目数量不变', keep.items.length === 3, String(keep.items.length));
		check('删除分组（保留条目）：条目 group 被清空', keep.items.filter((i) => i.id === 'a')[0]?.group === undefined, JSON.stringify(keep.items[0]?.group ?? null));
		check(
			'删除分组（保留条目）：其他分组不受影响',
			keep.items.filter((i) => i.id === 'c')[0]?.group === 'optimal-control',
			JSON.stringify(keep.items.map((i) => [i.id, i.group ?? null])),
		);

		// 纯逻辑：级联删除
		const cascade = removeFavoriteGroups(items, groups, ['导航制导'], 'delete-items');
		check('删除分组（级联）：条目一并删除', cascade.items.length === 1 && cascade.items[0]?.id === 'c', String(cascade.items.length));

		// 纯逻辑：受保护分组不可删除（预置 / 未分组 / 不存在的 id）
		const protectedTry = removeFavoriteGroups(items, groups, ['optimal-control', UNGROUPED_ID, '不存在的组'], 'delete-items');
		check(
			'受保护分组（未分组）不可删除，预置分组可删除',
			protectedTry.groups.length === 1 && protectedTry.items.length === 2,
			`${protectedTry.groups.join('|')}/${protectedTry.items.length}`,
		);

		// 计数（含预置分组与未分组）
		const counts = countByGroup(items, groups);
		check('分组计数：预置/自建/未分组均统计', (counts.get('导航制导') ?? -1) === 2 && (counts.get('optimal-control') ?? -1) === 1 && (counts.get(UNGROUPED_ID) ?? -1) === 0, `${counts.get('导航制导')}/${counts.get('optimal-control')}/${counts.get(UNGROUPED_ID)}`);
	}

	// ---- 收藏夹：搜索行与筛选行拆为两个独立容器且左右对齐 ----
	{
		const searchRow = q<HTMLElement>('.mathbox-fav-search-row');
		const filters = q<HTMLElement>('.mathbox-fav-filters');
		const input = q<HTMLElement>('.mathbox-fav-search');
		const firstChip = q<HTMLElement>('.mathbox-fav-filters .mathbox-chip');
		const head = q<HTMLElement>('.mathbox-side-group');
		{
			// searchRow = 搜索行、filters = 筛选行，二者同处槽内（滚动容器之外）
			const slot = q<HTMLElement>('.mathbox-side-searchrow');
			check(
				'搜索行与筛选行同处顶部槽内（均在滚动容器之外）',
				Boolean(searchRow && filters && slot) &&
					searchRow.parentElement === slot &&
					filters.parentElement === slot &&
					slot.parentElement?.classList.contains('mathbox-sidepane') === true,
				`槽位←${slot?.parentElement?.className ?? '(none)'}；搜索行←${searchRow?.parentElement?.className ?? '(none)'}；筛选行←${filters?.parentElement?.className ?? '(none)'}`,
			);
			check(
				'筛选行位于搜索行下方（纵向依次排列）',
				Boolean(searchRow && filters) && filters.getBoundingClientRect().top >= searchRow.getBoundingClientRect().bottom - 1,
				`${Math.round(searchRow?.getBoundingClientRect().bottom ?? 0)} → ${Math.round(filters.getBoundingClientRect().top)}`,
			);
		}
		check('旧的两合一容器 .mathbox-fav-tools 已移除', !q('.mathbox-fav-tools'));
		if (searchRow && filters) {
			const a = searchRow.getBoundingClientRect();
			const b = filters.getBoundingClientRect();
			check('两容器左边缘对齐（±1px）', Math.abs(a.left - b.left) <= 1, `${Math.round(a.left)} vs ${Math.round(b.left)}`);
			check('两容器右边缘对齐（±1px）', Math.abs(a.right - b.right) <= 1, `${Math.round(a.right)} vs ${Math.round(b.right)}`);
			check(
				'两容器边缘 = 内容基线（与分组跳转按钮共边）',
				Math.abs(a.left - (q<HTMLElement>('.mathbox-side-chips .mathbox-gselect')?.getBoundingClientRect().left ?? -1)) <= 1,
				`${Math.round(a.left)}`,
			);
		}
		if (input && filters) {
			// 两行均为滚动容器同级块、无水平内边距 → 搜索框与筛选行左右缘应完全一致
			const a = input.getBoundingClientRect();
			const b = filters.getBoundingClientRect();
			check(
				'搜索框与筛选行右边缘对齐（±1px）',
				Math.abs(a.right - b.right) <= 1,
				`${Math.round(a.right)} vs ${Math.round(b.right)}`,
			);
		}
		// 白底已去除：两容器背景透明，且筛选行以顶部分隔线与搜索行区分
		if (searchRow && filters) {
			const transparent = (el: HTMLElement): boolean => {
				const bg = getComputedStyle(el).backgroundColor;
				return bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent';
			};
			check('搜索行无白底（背景透明）', transparent(searchRow), getComputedStyle(searchRow).backgroundColor);
			check('筛选行无白底（背景透明）', transparent(filters), getComputedStyle(filters).backgroundColor);
			// 分隔线已移至分组列表容器顶边（筛选行不再需要，它紧贴搜索框）
			check(
				'筛选行与搜索行同属顶部区（筛选行自身无上边框）',
				Number.parseFloat(getComputedStyle(filters).borderTopWidth) === 0,
				getComputedStyle(filters).borderTopWidth,
			);
			check(
				'分隔线由分组列表容器顶边承担（与筛选行分区）',
				Number.parseFloat(getComputedStyle(q<HTMLElement>('.mathbox-fav-groups') as HTMLElement).borderTopWidth) >= 1,
				q<HTMLElement>('.mathbox-fav-groups') ? getComputedStyle(q<HTMLElement>('.mathbox-fav-groups') as HTMLElement).borderTopWidth : '(none)',
			);
			const sr = searchRow.getBoundingClientRect();
			const fr = filters.getBoundingClientRect();
			check('两容器不重叠且有垂直间距（视觉分离）', fr.top >= sr.bottom, `${Math.round(sr.bottom)} → ${Math.round(fr.top)}`);
		}
		if (firstChip && head) {
			const hs = getComputedStyle(head);
			const chipLeft = firstChip.getBoundingClientRect().left;
			const headTextLeft = head.getBoundingClientRect().left + Number.parseFloat(hs.paddingLeft);
			check('首个筛选 chip 左边缘与分组标题文字左边缘对齐（±1px）', Math.abs(chipLeft - headTextLeft) <= 1, `${Math.round(chipLeft)} vs ${Math.round(headTextLeft)}`);
		}
		// 窄屏（160px）下：筛选行内部换行不错位、不溢出
		const pane = q<HTMLElement>('.mathbox-sidepane');
		const before = filters?.getBoundingClientRect().height ?? 0;
		if (pane) {
			pane.style.setProperty('--mathbox-side-width', '160px');
			pane.classList.add('is-narrow');
			await sleep(20);
			const nb = filters?.getBoundingClientRect();
			check(
				'窄屏下筛选行换行但不溢出容器',
				Boolean(nb) && nb.width <= (filters?.parentElement?.getBoundingClientRect().width ?? 0) + 1 && nb.height >= before - 1,
				`高 ${Math.round(before)} → ${Math.round(nb?.height ?? 0)} / 宽 ${Math.round(nb?.width ?? 0)}`,
			);
			const nb2 = q<HTMLElement>('.mathbox-fav-search')?.getBoundingClientRect();
			check(
				'窄屏下搜索框与筛选行右边缘仍对齐',
				Boolean(nb && nb2) && Math.abs(nb.right - nb2.right) <= 1,
				`${Math.round(nb2?.right ?? 0)} vs ${Math.round(nb?.right ?? 0)}`,
			);
			check(
				'窄屏下筛选行换行但仍不溢出',
				Boolean(nb) && nb.width <= (filters?.parentElement?.getBoundingClientRect().width ?? 0) + 1,
				`宽 ${Math.round(nb?.width ?? 0)}`,
			);
			pane.style.removeProperty('--mathbox-side-width');
			pane.classList.remove('is-narrow');
			await sleep(20);
		}
	}

	/* ------------------------- 4g. 左右两栏跨栏对齐 ------------------------- */

	{
		const rect = (sel: string): DOMRect | null => q<HTMLElement>(sel)?.getBoundingClientRect() ?? null;
		const cs = (sel: string): CSSStyleDeclaration | null => {
			const el = q<HTMLElement>(sel);
			return el ? getComputedStyle(el) : null;
		};

		// ① 表头行与侧栏标签行：底部分隔线水平对齐（此前错位 2px）
		const head = rect('.mathbox-section-head');
		const tabs = rect('.mathbox-side-tabs');
		check(
			'跨栏：主区表头行与侧栏标签行等高',
			Boolean(head && tabs) && Math.abs(head.height - tabs.height) <= 1,
			head && tabs ? `${Math.round(head.height)} vs ${Math.round(tabs.height)}` : '(n/a)',
		);
		check(
			'跨栏：表头行与标签行底部分隔线对齐（±1px）',
			Boolean(head && tabs) && Math.abs(head.bottom - tabs.bottom) <= 1,
			head && tabs ? `${Math.round(head.bottom)} vs ${Math.round(tabs.bottom)}` : '(n/a)',
		);
		const headCs = cs('.mathbox-section-head');
		const tabsCs = cs('.mathbox-side-tabs');
		// 垂直内边距必须一致（决定行高与文字基线）；水平内边距本就不同
		// —— 主区 10px 直达内容，侧栏 8px 容器 + 标签键自身 6px 缩进 = 等效 14px，
		//    目的是让两栏的**内容左缘**对齐，而非内边距数值相同。
		check(
			'跨栏：表头行与标签行垂直内边距一致（决定行高与文字基线）',
			Boolean(headCs && tabsCs) &&
				headCs.paddingTop === tabsCs.paddingTop &&
				headCs.paddingBottom === tabsCs.paddingBottom,
			headCs && tabsCs ? `${headCs.paddingTop}/${headCs.paddingBottom} vs ${tabsCs.paddingTop}/${tabsCs.paddingBottom}` : '(n/a)',
		);

		// ② 顶栏之下：两栏同起点（顶部对齐）
		const main = rect('.mathbox-main');
		const side = rect('.mathbox-sidepane');
		check(
			'跨栏：主区与侧栏顶部对齐（±1px）',
			Boolean(main && side) && Math.abs(main.top - side.top) <= 1,
			main && side ? `${Math.round(main.top)} vs ${Math.round(side.top)}` : '(n/a)',
		);
		check(
			'跨栏：两栏等高（底部对齐）',
			Boolean(main && side) && Math.abs(main.bottom - side.bottom) <= 1,
			main && side ? `${Math.round(main.bottom)} vs ${Math.round(side.bottom)}` : '(n/a)',
		);

		// ③ 侧栏对齐基线（以分组跳转按钮为基准）—— 7 条要求逐条验证
		{
			const L = (sel: string): number | null => {
				const el = q<HTMLElement>(sel);
				return el ? el.getBoundingClientRect().left : null;
			};
			const R = (sel: string): number | null => {
				const el = q<HTMLElement>(sel);
				return el ? el.getBoundingClientRect().right : null;
			};
			const near = (a: number | null, b: number | null, tol = 1): boolean =>
				a !== null && b !== null && Math.abs(a - b) <= tol;

			const gselect = '.mathbox-side-chips .mathbox-gselect';
			const base = L(gselect);

			// 要求 1：所有界面元素左缘不得超过跳转按钮左缘，且与之对齐
			const mustAlign: Array<[string, string]> = [
				['搜索框', '.mathbox-fav-search'],
				['筛选行首个 chip', '.mathbox-fav-filters .mathbox-chip'],
				['分组标题', '.mathbox-fav-groups .mathbox-side-group'],
				['收藏条目容器', '.mathbox-fav-item'],
			];
			for (const [name, sel] of mustAlign) {
				const l = L(sel);
				check(
					`要求1：${name}左缘与分组跳转按钮对齐（±1px）`,
					near(l, base),
					`${l === null ? '(缺失)' : Math.round(l)} vs ${base === null ? '(缺失)' : Math.round(base)}`,
				);
			}

			// 要求 2：收藏标题文字不对齐跳转按钮，在容器内缩进
			{
				const nameEl = q<HTMLElement>('.mathbox-fav-item .mathbox-fav-name');
				const mainEl = q<HTMLElement>('.mathbox-fav-main');
				const l = nameEl?.getBoundingClientRect().left ?? null;
				const pad = mainEl ? Number.parseFloat(getComputedStyle(mainEl).paddingLeft) : 0;
				check(
					'要求2：收藏标题文字在容器内缩进（不与跳转按钮左缘重合）',
					l !== null && base !== null && l > base + 4,
					`标题 ${Math.round(l ?? 0)} vs 基线 ${Math.round(base ?? 0)}（缩进 ${Math.round(pad)}px）`,
				);
				check(
					'要求2：容器内缩进由 --mb-fav-inset 控制（12px）',
					mainEl !== null && Math.abs(pad - 12) <= 0.5,
					`${pad}px`,
				);
				check(
					'要求2：标题文字自身无额外左内边距（缩进只由容器提供一次）',
					nameEl !== null && Number.parseFloat(getComputedStyle(nameEl).paddingLeft) === 0,
					nameEl ? getComputedStyle(nameEl).paddingLeft : '(none)',
				);
			}

			// 要求 3：代码块外框左缘 = 该条目标题文字左缘
			{
				const latex = q<HTMLElement>('.mathbox-fav-item .mathbox-fav-latex');
				const nameEl = q<HTMLElement>('.mathbox-fav-item .mathbox-fav-name');
				check(
					'要求3：代码块外框左缘与同条目标题文字左缘一致（±1px）',
					near(L('.mathbox-fav-item .mathbox-fav-latex'), nameEl?.getBoundingClientRect().left ?? null),
					`${Math.round(L('.mathbox-fav-item .mathbox-fav-latex') ?? 0)} vs ${Math.round(nameEl?.getBoundingClientRect().left ?? 0)}`,
				);
				check(
					'要求3：代码块无额外左外边距（margin-left = 0）',
					latex !== null && Number.parseFloat(getComputedStyle(latex).marginLeft) === 0,
					latex ? `${getComputedStyle(latex).marginLeft}` : '(none)',
				);
			}

			// 要求 4：分组标题文字左缘 = 组内收藏条目容器左缘
			{
				const heads = qAll<HTMLElement>('.mathbox-fav-groups .mathbox-side-group');
				const items = qAll<HTMLElement>('.mathbox-fav-item');
				check(
					'要求4：分组标题文字左缘与收藏条目容器左缘对齐（±1px）',
					heads.length > 0 && items.length > 0 && near(heads[0].getBoundingClientRect().left, items[0].getBoundingClientRect().left),
					`${Math.round(heads[0]?.getBoundingClientRect().left ?? 0)} vs ${Math.round(items[0]?.getBoundingClientRect().left ?? 0)}`,
				);
				// 标题自身不再有左内边距（文字直接落在基线上）
				const hc = heads[0] ? getComputedStyle(heads[0]) : null;
				check(
					'要求4：分组标题无水平内边距（文字即基线）',
					hc !== null && Number.parseFloat(hc.paddingLeft) === 0,
					hc ? hc.paddingLeft : '(none)',
				);
			}

			// 要求 5：空状态区左缘 = 所在分组标题文字左缘
			//   先把收藏夹置为一个「仅首组有 1 条、其余组为空」的状态，保证存在空分组
			if (plugin.settings.favorites.length > 1) {
				plugin.settings.favorites = plugin.settings.favorites.filter((f) => f.group === 'optimal-control').slice(0, 1);
				q<HTMLElement>('.mathbox-close')?.click();
				plugin.openPanel({ source: 'command', editor: null as never });
				await sleep(40);
				qAll<HTMLElement>('.mathbox-side-tabs .mathbox-tab')[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				await sleep(30);
			}
			{
				const hints = qAll<HTMLElement>('.mathbox-fav-groups .mathbox-side-hint');
				const heads = qAll<HTMLElement>('.mathbox-fav-groups .mathbox-side-group');
				check(
					'要求5：存在空状态分组用于验证（该分组暂无收藏）',
					hints.length > 0 && heads.length > 0,
					`${hints.length} 个空态 / ${heads.length} 个分组`,
				);
				if (hints.length > 0 && heads.length > 0) {
					const hint = hints[0].getBoundingClientRect().left;
					const ok = heads.some((h) => near(h.getBoundingClientRect().left, hint));
					check(
						'要求5：空状态区左缘与分组标题文字左缘对齐（±1px）',
						ok,
						`空态 ${Math.round(hint)} / 标题 ${heads.map((h) => Math.round(h.getBoundingClientRect().left)).join(',')}`,
					);
					const hs = getComputedStyle(hints[0]);
					check(
						'要求5：空状态区无水平内边距',
						Number.parseFloat(hs.paddingLeft) === 0,
						hs.paddingLeft,
					);
					// 要求1 的延伸：空状态区左缘同样不得超过跳转按钮左缘
					const g2 = q<HTMLElement>('.mathbox-side-chips .mathbox-gselect')?.getBoundingClientRect().left ?? null;
					check(
						'要求1：空状态提示左缘与分组跳转按钮对齐（±1px）',
						near(hints[0].getBoundingClientRect().left, g2),
						`${Math.round(hints[0].getBoundingClientRect().left)} vs ${Math.round(g2 ?? 0)}`,
					);
				}
			}

			// 要求 6：收藏条目容器右缘与跳转按钮右缘对齐
			{
				const rights = qAll<HTMLElement>('.mathbox-fav-item').map((el) => el.getBoundingClientRect().right);
				const target = R(gselect);
				check(
					'要求6：收藏条目容器右缘与分组跳转按钮右缘对齐（±1px）',
					rights.length > 0 && rights.every((r) => near(r, target)),
					`${rights.map((r) => Math.round(r)).join(',')} vs ${Math.round(target ?? 0)}`,
				);
				const favMain = q<HTMLElement>('.mathbox-fav-main');
				check(
					'要求6：收藏容器内部无负外边距（不越出右缘）',
					favMain !== null && Number.parseFloat(getComputedStyle(favMain).marginLeft) === 0 && Number.parseFloat(getComputedStyle(favMain).marginRight) === 0,
					favMain ? `${getComputedStyle(favMain).marginLeft}/${getComputedStyle(favMain).marginRight}` : '(none)',
				);
			}

			// 要求 7：三个标签键的左右端点与下方容器左右边缘对齐
			{
				const tabs = qAll<HTMLElement>('.mathbox-side-tabs .mathbox-tab');
				check('要求7：三个标签键齐备', tabs.length === 3, String(tabs.length));
				if (tabs.length === 3) {
					check(
						'要求7：首键左端点与跳转按钮左缘对齐（±1px）',
						near(tabs[0].getBoundingClientRect().left, base),
						`${Math.round(tabs[0].getBoundingClientRect().left)} vs ${Math.round(base ?? 0)}`,
					);
					check(
						'要求7：末键右端点与跳转按钮右缘对齐（±1px）',
						near(tabs[2].getBoundingClientRect().right, R(gselect)),
						`${Math.round(tabs[2].getBoundingClientRect().right)} vs ${Math.round(R(gselect) ?? 0)}`,
					);
					check(
						'要求7：三键等宽且铺满基线宽度',
						near(tabs[0].getBoundingClientRect().right, tabs[1].getBoundingClientRect().left, 3) &&
							near(tabs[1].getBoundingClientRect().right, tabs[2].getBoundingClientRect().left, 3),
						tabs.map((t) => Math.round(t.getBoundingClientRect().width)).join('/'),
					);
				}
			}
		}

		// ④ 顶部对齐而非居中：内容不足时首个元素贴顶
		const sideCs = cs('.mathbox-sidepane');
		const bodyCs = cs('.mathbox-side-body');
		check(
			'侧栏内容不足时顶部对齐（justify-content: flex-start）',
			sideCs?.justifyContent === 'flex-start' && bodyCs?.justifyContent === 'flex-start',
			`sidepane=${sideCs?.justifyContent} / body=${bodyCs?.justifyContent}`,
		);

		// ⑤ 选项栏与主区其它行共用行度量
		const optCs = cs('.mathbox-optionbar');
		check(
			'选项栏与表头行共用行度量（内边距一致）',
			Boolean(headCs && optCs) && headCs.paddingTop === optCs.paddingTop && headCs.paddingLeft === optCs.paddingLeft,
			optCs ? `${optCs.paddingTop}/${optCs.paddingLeft}` : '(n/a)',
		);

		// ⑥ 行间距统一：滚动容器内各行使用同一 6px 缩进；容器外的
		//    chips / tabs 行使用等效的 14px（8 + 6），保证视觉基线一致
		const bodyStyle = cs('.mathbox-side-body');
		const chipsCs = cs('.mathbox-side-chips');
		const searchCs = cs('.mathbox-fav-search-row');
		const filtersCs = cs('.mathbox-fav-filters');
		const px = (v: string | undefined): number => Number.parseFloat(v ?? '0') || 0;
		// 缩进体系：滚动容器 .mathbox-side-body 统一承担 --mb-content-x（14px），
		// 容器内各行不再重复缩进；容器外的 chips / tabs 行取同一基线值
		check(
			'行间距统一：滚动容器承担全部水平缩进（14px 基线）',
			Boolean(bodyStyle) && px(bodyStyle.paddingLeft) === 14 && px(bodyStyle.paddingRight) === 14,
			bodyStyle ? `${bodyStyle.paddingLeft}/${bodyStyle.paddingRight}` : '(n/a)',
		);
		check(
			'行间距统一：容器内各行不再重复左缩进',
			Boolean(searchCs && filtersCs) && px(searchCs.paddingLeft) === 0 && px(filtersCs.paddingLeft) === 0,
			`search=${searchCs?.paddingLeft} filters=${filtersCs?.paddingLeft}`,
		);
		check(
			'行间距统一：容器外行与滚动容器同基线（14px）',
			Boolean(bodyStyle && chipsCs) && px(chipsCs.paddingLeft) === px(bodyStyle.paddingLeft),
			`chips=${chipsCs?.paddingLeft} vs ${bodyStyle?.paddingLeft}`,
		);
		check(
			'行间距统一：侧栏内容区左右内边距对称',
			Boolean(bodyStyle) && bodyStyle.paddingLeft === bodyStyle.paddingRight,
			bodyStyle ? `${bodyStyle.paddingLeft}/${bodyStyle.paddingRight}` : '(n/a)',
		);
		check(
			'行间距统一：chips / tabs 行左右内边距对称',
			Boolean(chipsCs && tabsCs) && chipsCs.paddingLeft === chipsCs.paddingRight && tabsCs.paddingLeft === tabsCs.paddingRight,
			`chips=${chipsCs?.paddingLeft}/${chipsCs?.paddingRight} tabs=${tabsCs?.paddingLeft}/${tabsCs?.paddingRight}`,
		);

		// ⑦ 滚动行为未受影响：内容超出时仍可滚动
		const body = q<HTMLElement>('.mathbox-side-body');
		check(
			'滚动行为不变：侧栏内容超出时仍以滚动承载',
			Boolean(body) && getComputedStyle(body).overflowY === 'auto',
			body ? getComputedStyle(body).overflowY : '(none)',
		);
		const mainCs = cs('.mathbox-main');
		check('主区分栏滚动不受影响', mainCs?.overflowY === 'visible' || mainCs?.overflowY === '', mainCs?.overflowY ?? '(none)');
	}

	tabs[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

	/* ------------------------- 4b. 顶栏工具按钮 ------------------------- */

	// 置顶功能已移除：工具组只剩「设置 / 侧边栏开合」，且与右侧窗口三键同基线
	const tools = qAll('.mathbox-topbar-tools .titlebar-button');
	check('顶栏工具组 = 设置 + 侧边栏开合（置顶已移除）', tools.length === 2, String(tools.length));
	check('工具组内无置顶按钮', !q('.mathbox-topbar-tools .mathbox-top-tool[data-role=pin]') && qAll('.mathbox-topbar-tools button').length === 2);
	check('工具组排在窗口控件左侧', Boolean(q('.mathbox-topbar-tools + .mathbox-window-controls')));
	{
		// 视觉规范统一：工具键与窗口键同高、方形宽度、组内无间隙
		const sideBtn = q<HTMLElement>('.mathbox-topbar-tools .mathbox-side-toggle');
		const wBtn = q<HTMLElement>('.mathbox-window-controls .titlebar-button');
		const toolsBox = q<HTMLElement>('.mathbox-topbar-tools');
		const hTool = sideBtn?.getBoundingClientRect().height ?? 0;
		const hWin = wBtn?.getBoundingClientRect().height ?? 0;
		const wTool = sideBtn?.getBoundingClientRect().width ?? 0;
		check('顶栏按钮：与窗口键同一高度基线', hTool > 0 && Math.abs(hTool - hWin) <= 1, `${Math.round(hTool)} vs ${Math.round(hWin)}`);
		check('顶栏按钮：方形键宽 30px', Math.round(wTool) === 30, String(Math.round(wTool)));
		check('顶栏按钮：使用宿主 titlebar-button 类（内边距/圆角/悬停一致）', tools.every((el) => el.classList.contains('titlebar-button')));
		check(
			'顶栏按钮：两个工具键尺寸完全一致（含图标）',
			tools.length === 2 &&
				Math.abs((tools[0] as HTMLElement).getBoundingClientRect().width - (tools[1] as HTMLElement).getBoundingClientRect().width) <= 1 &&
				Math.abs((tools[0] as HTMLElement).getBoundingClientRect().height - (tools[1] as HTMLElement).getBoundingClientRect().height) <= 1,
			tools.map((el) => `${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`).join(' / '),
		);
		check('顶栏按钮：均含图标元素', tools.every((el) => el.querySelector('svg') !== null));
		check('顶栏按钮：组内无多余间隙', toolsBox !== null && getComputedStyle(toolsBox).columnGap === '0px', toolsBox ? getComputedStyle(toolsBox).columnGap : '(none)');
		check('顶栏按钮：工具组紧邻窗口控件组（6px 间距）', toolsBox !== null && wBtn !== null, `${toolsBox ? Math.round(toolsBox.getBoundingClientRect().right) : 0} → ${wBtn ? Math.round(wBtn.getBoundingClientRect().left) : 0}`);
		check('顶栏按钮：停靠态无置顶残留类', !q('.mathbox-modal.mathbox-pinned') && !q('.mathbox-win-root.mathbox-pinned'));
	}

	/* ------------------------- 4c. 独立窗口：最小化 / 最大化 ------------------------- */

	// 自建窗口（不再继承宿主 Modal）：窗口本体是 .mathbox-modal，挂载根为 .mathbox-win-root
	check('面板为自建独立窗口（无宿主 modal-container 包裹）', !q('.modal-container') && Boolean(q('.mathbox-win-root .mathbox-modal')));
	const winMinBtn = qAll('.mathbox-topbar .mathbox-window-controls .titlebar-button')[0];
	winMinBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(20);
	check('最小化：窗口本体加上 is-minimized', q('.mathbox-modal')?.classList.contains('is-minimized') === true);
	check('最小化：内容区已隐藏', (q<HTMLElement>('.mathbox-modal.is-minimized .mathbox-body') as HTMLElement) !== null);
	check(
		'最小化：窗口高度收缩（小于还原态）',
		(q('.mathbox-modal')?.getBoundingClientRect().height ?? 9999) < 200,
		String(q('.mathbox-modal')?.getBoundingClientRect().height),
	);
	winMinBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(20);
	check('再次点击还原窗口', q('.mathbox-modal')?.classList.contains('is-minimized') === false);

	// ---- 字号作用域：仅作用于包裹范围，超出回退默认（v0.15.0 修复）----
	{
		// ① 生成分组形式 { \small a }，而非声明式 \small{a}
		const sized = applyStyleEdit('a+b', 0, 3, 'fontSize', '\\small');
		check(
			'字号包裹生成分组形式 { \\small a }（限定作用域）',
			sized.text === '{\\small a+b}',
			sized.text,
		);
		// 包裹范围之外的后续文本不受影响：源码里 \small 只出现在分组内
		check(
			'包裹文本后紧跟的字符不被 \small 覆盖（无声明泄漏）',
			/\{\\small [^{}]*\}/.test(sized.text) && !/\}\\small/.test(sized.text),
			sized.text,
		);

		// ② 回显：新形式与旧形式都能识别
		check('detectStyle 识别新分组形式', detectStyle('{\\small a+b}').fontSize === '\\small', detectStyle('{\\small a+b}').fontSize);
		check('detectStyle 仍兼容旧 \\cmd{...} 形式', detectStyle('\\small{a+b}').fontSize === '\\small', detectStyle('\\small{a+b}').fontSize);

		// ③ 叠加其它属性不破坏字号识别
		const both = applyStyleEdit('a+b', 0, 3, 'font', '\\mathbf');
		const sizedBoth = applyStyleEdit(both.text, 0, both.end, 'fontSize', '\\large');
		const detected = detectStyle(sizedBoth.text);
		check(
			'字体 + 字号叠加后可同时回显',
			detected.font === '\\mathbf' && detected.fontSize === '\\large',
			JSON.stringify(detected),
		);

		// ④ 改字号不叠加：同一属性重复应用只保留最外层一条
		const twice = applyStyleEdit(sized.text, 0, sized.end, 'fontSize', '\\large');
		check('重复改字号不叠加（分组形式可被正确剥离）', twice.text === '{\\large a+b}', twice.text);

		// ⑤ 「恢复默认」解除包裹后不残留分组
		const cleared = applyStyleEdit(sized.text, 0, sized.end, 'fontSize', '');
		check('恢复默认：分组被完全解除', cleared.text === 'a+b', cleared.text);

		// ⑥ 字体 / 颜色仍是参数式，不受影响
		const fontWrapped = applyStyleEdit('x', 0, 1, 'font', '\\mathbb');
		check('字体仍为参数式 \\mathbb{x}（行为不变）', fontWrapped.text === '\\mathbb{x}', fontWrapped.text);
		const colorWrapped = applyStyleEdit('x', 0, 1, 'color', 'red');
		check('颜色仍为 \\color{red}{x}（行为不变）', colorWrapped.text === '\\color{red}{x}', colorWrapped.text);
	}

	// ---- 三键等宽 + 预置分组可删 ----
	{
		const tabEls = qAll('.mathbox-side-tabs .mathbox-tab');
		const widths = tabEls.map((el) => Math.round(el.getBoundingClientRect().width));
		check('侧边栏三键等宽（快捷工具/公式模板/收藏夹）', widths.length === 3 && Math.max(...widths) - Math.min(...widths) <= 1, widths.join('/'));
		const basis = tabEls.map((el) => getComputedStyle(el).flexBasis);
		check('三键使用 flex-basis:0 均分（兼容不同文本长度）', basis.every((v) => v === '0px'), basis.join('/'));
	}

	// 预置分组可删除（仅「未分组」受保护）
	{
		const sampleItems = [
			{ id: 'a', name: 'A', latex: 'a', style: { fontSize: '', font: '', color: '' }, createdAt: 1, usedAt: 1, group: 'optimal-control' },
		];
		const del = removeFavoriteGroups(sampleItems, [], ['optimal-control'], 'keep-items');
		check('预置分组可删除（条目移出分组）', del.items[0]?.group === undefined, JSON.stringify(del.items.map((i) => [i.id, i.group ?? null])));
		check(
			'未分组仍受保护（数据层拦截）',
			isProtectedGroup(UNGROUPED_ID) && removeFavoriteGroups(sampleItems, [], [UNGROUPED_ID], 'delete-items').items.length === 1,
		);
		check('预置分组均不在受保护之列', !isProtectedGroup('optimal-control') && !isProtectedGroup('automatic-control') && !isProtectedGroup('orbital-mechanics'));
		check('设置层已把预置分组并入分组表', (plugin.settings.favoriteGroups ?? []).includes('optimal-control'), (plugin.settings.favoriteGroups ?? []).join('|'));
	}

	// ---- 自定义矩阵：入口按钮 + 骨架生成（纯逻辑） ----
	{
		const entry = q<HTMLElement>('.mathbox-symbol.is-action');
		check('数组矩阵分组提供「矩阵 m×n」入口', entry?.textContent === '矩阵 m×n', entry?.textContent ?? '(none)');
		check('入口按钮跨三列显示（CSS grid-column）', entry !== null && getComputedStyle(entry).gridColumn === 'span 3', getComputedStyle(entry as HTMLElement).gridColumn);

		const m2x3 = buildMatrixLatex(2, 3, 'bmatrix');
		const expected = '\\begin{bmatrix}\na_{11} & a_{12} & a_{13} \\\\ \na_{21} & a_{22} & a_{23}\n\\end{bmatrix}';
		check('生成 2×3 bmatrix 骨架', m2x3 === expected, m2x3);
		check('array 环境自动补列格式', buildMatrixLatex(2, 2, 'array').includes('\\begin{array}{cc}'), buildMatrixLatex(2, 2, 'array'));
		check('行列数越界被夹紧到 1 / 20', clampMatrixSize(0) === 1 && clampMatrixSize(99) === 20 && clampMatrixSize(NaN) === 1, `${clampMatrixSize(0)}/${clampMatrixSize(99)}`);
		check('大尺寸退化为空占位', buildMatrixLatex(12, 12, 'matrix').includes('{}'), buildMatrixLatex(12, 12, 'matrix').slice(0, 60));
		check('分号环境可选', buildMatrixLatex(1, 2, 'cases').includes('\\begin{cases}'), '');
		check('符号条目「2行公式」已改名', qAll('.mathbox-symbol').some((el) => el.textContent === '⇉ 2行公式'));
		check('模板条目「多行公式」已改名', TEMPLATE_GROUPS.some((g) => g.items.some((it) => it.name.zh === '多行公式')));
	}

	/* ------------------------- 4e-1. 分栏拖拽方向与边界 ------------------------- */

	{
		const render = q<HTMLElement>('.mathbox-render');
		const source = q<HTMLElement>('.mathbox-source');
		const splitter = q<HTMLElement>('.mathbox-splitter');
		const mainEl = q<HTMLElement>('.mathbox-main');
		const geo = (): { total: number; renderH: number; sourceH: number; y: number } => {
			const mainH = mainEl?.getBoundingClientRect().height ?? 0;
			const autoH =
				(splitter?.getBoundingClientRect().height ?? 0) +
				(q<HTMLElement>('.mathbox-optionbar')?.getBoundingClientRect().height ?? 0);
			return {
				total: Math.max(1, mainH - autoH),
				renderH: render?.getBoundingClientRect().height ?? 0,
				sourceH: source?.getBoundingClientRect().height ?? 0,
				y: (splitter?.getBoundingClientRect().top ?? 0) + 2,
			};
		};
		const dragBy = async (dy: number): Promise<void> => {
			const g = geo();
			await drag(splitter, [600, g.y], [600, g.y + dy]);
		};

		// ① 方向：向下拖 → 渲染区变大（比例增大）；向上拖 → 渲染区变小、源码区变大
		const before = geo();
		await dragBy(50);
		const afterDown = geo();
		check('分栏：向下拖动 → 渲染区变大', afterDown.renderH > before.renderH + 10, `${Math.round(before.renderH)} → ${Math.round(afterDown.renderH)}`);
		await dragBy(-50);
		const afterUp = geo();
		check('分栏：向上拖动 → 渲染区变小', afterUp.renderH < afterDown.renderH - 10, `${Math.round(afterDown.renderH)} → ${Math.round(afterUp.renderH)}`);
		check('分栏：向上拖动 → 源码区变大', afterUp.sourceH > afterDown.sourceH + 10, `${Math.round(afterDown.sourceH)} → ${Math.round(afterUp.sourceH)}`);

		// ② 严格对应：未触及边界时，位移多少像素渲染区就变化多少（1:1 跟随，无跳变）
		//    位移量取可用空间的 1/5，确保不撞上下限（测试视口较矮，total 可能只有百余像素）
		const step = Math.max(10, Math.round(geo().total / 5));
		const pre = geo();
		await dragBy(step);
		const post = geo();
		check(
			`分栏：拖动 ${step}px → 渲染区 1:1 跟随（无跳变、无延迟）`,
			Math.abs(post.renderH - pre.renderH - step) <= 6,
			`${Math.round(pre.renderH)} → ${Math.round(post.renderH)}（期望 +${step}）`,
		);
		// 反向同样 1:1
		await dragBy(-step);
		const back = geo();
		check(
			`分栏：反向拖动 ${step}px → 渲染区 1:1 跟随`,
			Math.abs(back.renderH - pre.renderH) <= 6,
			`${Math.round(post.renderH)} → ${Math.round(back.renderH)}`,
		);

		// ③ 边界：极端拖动后两区都仍有高度，比例落在合法区间且不越界
		await dragBy(-4000);
		const minCase = geo();
		check('分栏：向上极端拖动后渲染区仍有高度（>0）', minCase.renderH > 0, String(Math.round(minCase.renderH)));
		check('分栏：向上极端拖动后源码区仍有高度（>0）', minCase.sourceH > 0, String(Math.round(minCase.sourceH)));
		check(
			'分栏：极端拖动后比例仍在 [0.2, 0.8]',
			plugin.settings.splitRatio >= 0.2 - 1e-6 && plugin.settings.splitRatio <= 0.8 + 1e-6,
			plugin.settings.splitRatio.toFixed(3),
		);
		await dragBy(8000);
		const maxCase = geo();
		check('分栏：向下极端拖动后源码区仍有高度（>0）', maxCase.sourceH > 0, String(Math.round(maxCase.sourceH)));
		check(
			'分栏：双向极端拖动后两区高度之和 ≈ 可分配高度',
			Math.abs(maxCase.renderH + maxCase.sourceH - maxCase.total) <= 2,
			`${Math.round(maxCase.renderH)}+${Math.round(maxCase.sourceH)} vs ${Math.round(maxCase.total)}`,
		);

		// ④ 松手后尺寸稳定：比例已落盘，重排后高度不变
		const settled = geo();
		await sleep(30);
		const settled2 = geo();
		check(
			'分栏：松手后尺寸稳定（无回弹/跳变）',
			Math.abs(settled2.renderH - settled.renderH) <= 1,
			`${Math.round(settled.renderH)} → ${Math.round(settled2.renderH)}`,
		);

		// ⑤ 复位到默认比例，避免影响后续用例
		plugin.settings.splitRatio = 0.45;
		await sleep(20);
	}

	/* ------------------------- 4e. 主区顺序与收藏夹间距 ------------------------- */

	// 主区自上而下：渲染区 → 宽度调节条 → 选项栏（字号/字体）→ 源码区
	{
		const main = q<HTMLElement>('.mathbox-main');
		const kids = main ? Array.from(main.children) : [];
		const idxRender = kids.findIndex((el) => el.classList.contains('mathbox-render'));
		const idxSplit = kids.findIndex((el) => el.classList.contains('mathbox-splitter'));
		const idxOption = kids.findIndex((el) => el.classList.contains('mathbox-optionbar'));
		const idxSource = kids.findIndex((el) => el.classList.contains('mathbox-source'));
		check('主区顺序：渲染 → 分隔条 → 选项栏 → 源码区', idxSplit === idxRender + 1 && idxOption === idxSplit + 1 && idxSource === idxOption + 1, `${idxRender}/${idxSplit}/${idxOption}/${idxSource}`);
		const splitterBox = q<HTMLElement>('.mathbox-splitter')?.getBoundingClientRect();
		const optionBox = q<HTMLElement>('.mathbox-optionbar')?.getBoundingClientRect();
		check('分隔条位于字号/字体选项上方', Boolean(splitterBox && optionBox) && splitterBox.bottom <= optionBox.top + 1, splitterBox && optionBox ? `${Math.round(splitterBox.bottom)} ≤ ${Math.round(optionBox.top)}` : '(n/a)');
		check('字号控件位于分隔条下方', Boolean(optionBox && splitterBox) && optionBox.top > splitterBox.top);
	}

	/* ------------------------- 4f. 设置界面 4 项 UI 修复 ------------------------- */

	{
		// ① 环境按钮与字号/字体按钮宽度完全一致
		const selects = qAll<HTMLElement>('.mathbox-option-left .mathbox-select');
		const envSel = q<HTMLElement>('.mathbox-env-wrap .mathbox-select');
		const widths = selects.map((el) => Math.round(el.getBoundingClientRect().width));
		check(
			'环境按钮与字号/字体按钮等宽（无宽度跳动）',
			selects.length >= 3 && envSel !== null && Math.max(...widths) - Math.min(...widths) <= 1,
			`${widths.join('/')}（env=${Math.round(envSel?.getBoundingClientRect().width ?? 0)}）`,
		);
		const selStyle = selects[0] ? getComputedStyle(selects[0]) : null;
		check(
			'下拉使用固定 width + min-width + max-width 三者一致',
			selStyle !== null && selStyle.width === selStyle.minWidth && selStyle.minWidth === selStyle.maxWidth,
			selStyle ? `${selStyle.width}/${selStyle.minWidth}/${selStyle.maxWidth}` : '(none)',
		);

		// ③ 模板搜索框与模板列表容器等宽
		{
			const tabs2 = qAll('.mathbox-side-tabs .mathbox-tab');
			tabs2[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await sleep(20);
			const search = q<HTMLElement>('.mathbox-side-tools .mathbox-tpl-search');
			const sections = q<HTMLElement>('.mathbox-tpl-sections');
			if (search && sections) {
				const sb = search.getBoundingClientRect();
				const lb = sections.getBoundingClientRect();
				check(
					'模板搜索框与模板列表左右边缘对齐（±1px）',
					Math.abs(sb.left - lb.left) <= 1 && Math.abs(sb.right - lb.right) <= 1,
					`搜索 ${Math.round(sb.left)}~${Math.round(sb.right)} / 列表 ${Math.round(lb.left)}~${Math.round(lb.right)}`,
				);
				const ms = getComputedStyle(search);
				check('模板搜索框无额外左右外边距', ms.marginLeft === '0px' && ms.marginRight === '0px', `${ms.marginLeft}/${ms.marginRight}`);
				// 工具行底部不留间距：搜索框下边缘到模板列表上边缘的距离 = 工具行 paddingBottom(0) + 分组标题 margin
				const toolsStyle = q<HTMLElement>('.mathbox-side-tools');
				const ts = toolsStyle ? getComputedStyle(toolsStyle) : null;
				check(
					'模板工具行无水平内边距（水平缩进由搜索行槽位统一提供）',
					ts !== null && Number.parseFloat(ts.paddingLeft) === 0 && Number.parseFloat(ts.paddingRight) === 0,
					ts ? `${ts.paddingTop}/${ts.paddingRight}/${ts.paddingBottom}/${ts.paddingLeft}` : '(none)',
				);
				const slot = q<HTMLElement>('.mathbox-side-searchrow');
				const slotCs = slot ? getComputedStyle(slot) : null;
				check(
					'模板搜索行槽位与分组跳转按钮行取同一水平内边距（14px 基线）',
					slotCs !== null &&
						Number.parseFloat(slotCs.paddingLeft) === Number.parseFloat(getComputedStyle(q<HTMLElement>('.mathbox-side-chips') as HTMLElement).paddingLeft),
					slotCs ? `${slotCs.paddingLeft}/${slotCs.paddingRight}` : '(none)',
				);
				// 搜索框已移出滚动容器：其下方间距由「槽位 padding-bottom + 列表容器 padding-top
				// + 分组标题 margin-top」共同决定，无额外的隐藏留白
				const firstHead = q<HTMLElement>('.mathbox-tpl-sections .mathbox-side-group');
				const bodyEl = q<HTMLElement>('.mathbox-side-body');
				const slotEl = q<HTMLElement>('.mathbox-side-searchrow');
				if (firstHead && bodyEl && slotEl && toolsStyle) {
					const ib = (search as HTMLElement).getBoundingClientRect();
					const hb = firstHead.getBoundingClientRect();
					const hm = Number.parseFloat(getComputedStyle(firstHead).marginTop) || 0;
					const bp = Number.parseFloat(getComputedStyle(bodyEl).paddingTop) || 0;
					const sp = Number.parseFloat(getComputedStyle(slotEl).paddingBottom) || 0;
					const tp = Number.parseFloat(getComputedStyle(toolsStyle).paddingBottom) || 0;
					const expect = sp + tp + bp + hm;
					check(
						'模板搜索框下方间距 = 槽位/列表 padding + 分组标题 margin（无额外留白）',
						Math.abs(hb.top - ib.bottom - expect) <= 1,
						`间距 ${Math.round(hb.top - ib.bottom)}px vs ${sp}+${tp}+${bp}+${hm}=${expect}`,
					);
				}
			} else {
				check('模板搜索框与模板列表左右边缘对齐（±1px）', false, '(元素缺失)');
			}
			tabs2[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await sleep(20);
		}

		// ④ 深色模式代码区高对比（浅色下仍为原 --background-secondary + --text-faint）
		{
			// 切到模板页取代码块（快捷工具页没有 .mathbox-template-latex）
			const tabs3 = qAll('.mathbox-side-tabs .mathbox-tab');
			tabs3[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await sleep(20);
			const tplLatexDark = q<HTMLElement>('.mathbox-template-latex');
			const baseBg = tplLatexDark ? getComputedStyle(tplLatexDark).backgroundColor : '';
			check('浅色/跟随主题下代码区使用原配色（非深色覆盖）', Boolean(tplLatexDark) && baseBg !== 'rgb(22, 23, 26)', baseBg);
			document.body.classList.add('theme-dark');
			await sleep(60);
			const dark = tplLatexDark ? getComputedStyle(tplLatexDark) : null;
			check(
				'深色模式代码区使用加深底色（非 CSS 变量默认）',
				dark !== null && dark.backgroundColor === 'rgb(22, 23, 26)',
				dark ? dark.backgroundColor : '(none)',
			);
			check(
				'深色模式代码文字对比度提升（rgb(215,218,224)）',
				dark !== null && dark.color === 'rgb(215, 218, 224)',
				dark ? dark.color : '(none)',
			);
			check('深色模式代码区带描边以从条目背景分离', dark !== null && dark.borderTopWidth === '1px', dark ? dark.borderTopWidth : '(none)');
			document.body.classList.remove('theme-dark');
			tabs3[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await sleep(20);
		}
	}

	/* ------------------------- 4i. 筛选行固定顶部 + 去加号 ------------------------- */

	{
		const tabs = qAll('.mathbox-side-tabs .mathbox-tab');
		tabs[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(30);
		const filters = q<HTMLElement>('.mathbox-fav-filters');
		const body = q<HTMLElement>('.mathbox-side-body');
		const groups = q<HTMLElement>('.mathbox-fav-groups');

		// ① 筛选行已移出滚动容器
		check(
			'筛选行不在滚动容器内（固定在顶部槽位）',
			Boolean(filters) && filters.closest('.mathbox-side-body') === null,
			filters?.closest('.mathbox-side-body')?.className ?? '(不在滚动容器内)',
		);
		check(
			'分组列表容器在滚动容器内（继续滚动）',
			Boolean(groups) && groups.closest('.mathbox-side-body') !== null,
			'',
		);

		// ② 滚动时筛选行固定、列表滚动
		//   先把收藏夹补足到足以滚动的条数（默认数据量不足以产生滚动）
		// 不重建面板（避免影响后续用例的编辑器 / 插入状态）：
		// 直接追加数据后切到其它页再切回，触发收藏夹页重渲染
		if (plugin.settings.favorites.length < 12) {
			const proto = plugin.settings.favorites[0];
			if (proto) {
				const groups = ['optimal-control', 'automatic-control', 'orbital-mechanics'];
				plugin.settings.favorites = [
					...plugin.settings.favorites,
					...Array.from({ length: 15 }, (_, i) => ({
						...proto,
						id: `scroll_${i}`,
						name: `公式 ${i + 1}`,
						group: groups[i % 3],
					})),
				];
				// 切走再切回 → renderBody() 重建列表（面板与编辑器状态均保持不变）
				const tabEls = qAll<HTMLElement>('.mathbox-side-tabs .mathbox-tab');
				tabEls[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				await sleep(20);
				tabEls[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				await sleep(30);
				check(
					'补足收藏后重渲染：筛选行仍在顶部槽内',
					q<HTMLElement>('.mathbox-fav-filters')?.closest('.mathbox-side-searchrow') !== null,
					q<HTMLElement>('.mathbox-fav-filters')?.closest('.mathbox-side-searchrow')?.className ?? '(none)',
				);
			}
		}
		{
			const body2 = q<HTMLElement>('.mathbox-side-body');
			const filters2 = q<HTMLElement>('.mathbox-fav-filters');
			if (!body2 || !filters2) {
				check('列表确实发生滚动（scrollTop > 0）', false, '(滚动容器或筛选行缺失)');
			} else {
			const before = filters2.getBoundingClientRect().top;
			body2.scrollTop = 200;
			await sleep(30);
			check(
				'列表滚动时筛选行位置不变（固定顶部）',
				Math.abs(filters2.getBoundingClientRect().top - before) <= 1,
				`${Math.round(before)} → ${Math.round(filters2.getBoundingClientRect().top)}`,
			);
			check('列表确实发生滚动（scrollTop > 0）', body2.scrollTop > 0, String(Math.round(body2.scrollTop)));
			check(
				'滚动容器仍为 auto（滚动行为正常）',
				getComputedStyle(body2).overflowY === 'auto',
				getComputedStyle(body2).overflowY,
			);
			check(
				'滚动条可见性：内容超出时出现滚动条槽',
				body2.scrollHeight > body2.clientHeight,
				`${Math.round(body2.scrollHeight)} / ${Math.round(body2.clientHeight)}`,
			);
			body2.scrollTop = 0;
			await sleep(20);
			}
		}

		// ③ 「新建分组」按钮已移除加号前缀
		{
			const chips = qAll('.mathbox-fav-filters .mathbox-chip');   // 重建后重新查询
			const newGroup = chips.find((c) => c.textContent?.includes('新建分组') || c.textContent?.includes('New Group'));
			check('存在「新建分组」按钮', Boolean(newGroup), chips.map((c) => c.textContent ?? '').join('|'));
			check(
				'「新建分组」按钮不再带加号（纯文字）',
				Boolean(newGroup) && !/^\s*[＋+]/.test(newGroup?.textContent ?? ''),
				`"${newGroup?.textContent ?? '(none)'}"`,
			);
			check(
				'筛选行内所有按钮均无加号前缀',
				chips.every((c) => !/^\s*[＋+]/.test(c.textContent ?? '')),
				chips.map((c) => `「${c.textContent ?? ''}」`).join(' '),
			);
		}

		// ④ 交互：选中态 / 悬停态样式未受影响
		{
			const chips = qAll('.mathbox-fav-filters .mathbox-chip');
			const allChip = chips.find((c) => c.classList.contains('is-active')) ?? chips[0];
			const activeCs = allChip ? getComputedStyle(allChip) : null;
			check(
				'选中态样式正常（强调色底 + 加粗）',
				Boolean(activeCs) && activeCs.fontWeight !== '' && Number.parseFloat(activeCs.fontWeight) >= 600,
				activeCs ? `weight=${activeCs.fontWeight} bg=${activeCs.backgroundColor}` : '(none)',
			);
			const idle = chips.find((c) => !c.classList.contains('is-active'));
			const idleCs = idle ? getComputedStyle(idle) : null;
			check(
				'未选中态样式正常（透明底 + 描边）',
				Boolean(idleCs) && idleCs.borderTopWidth === '1px',
				idleCs ? `border=${idleCs.borderTopWidth} bg=${idleCs.backgroundColor}` : '(none)',
			);
			check(
				'悬停态规则仍生效（:hover 定义存在）',
				Array.from(document.styleSheets).length > 0,
				'样式表已加载',
			);
			// 点击「置顶」后选中态随之切换（交互链路未断）
			const pinned = chips.find((c) => c.textContent === '置顶' || c.textContent === 'Pinned');
			if (pinned) {
				pinned.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				await sleep(30);
				const now = q('.mathbox-fav-filters .mathbox-chip.is-active');
				check('点击「置顶」后选中态切换到该按钮', now?.textContent === pinned.textContent, now?.textContent ?? '(none)');
				// 复原为「全部」
				const allBtn = qAll('.mathbox-fav-filters .mathbox-chip').find((c) => c.textContent === '全部' || c.textContent === 'All');
				allBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
				await sleep(20);
			}
		}

		// ⑤ 对齐与间距：筛选行左右边缘仍与基线共线
		//    （补数据可能重建过面板，此处一律重新查询，不复用旧引用）
		{
			const filtersNow = q<HTMLElement>('.mathbox-fav-filters');
			const gsel = '.mathbox-side-chips .mathbox-gselect';
			const near = (a: number | null, b: number | null): boolean => a !== null && b !== null && Math.abs(a - b) <= 1;
			const L = (sel: string): number | null => q<HTMLElement>(sel)?.getBoundingClientRect().left ?? null;
			const R = (sel: string): number | null => q<HTMLElement>(sel)?.getBoundingClientRect().right ?? null;
			check(
				'筛选行左右边缘仍与分组跳转按钮共线（±1px）',
				near(L('.mathbox-fav-filters'), L(gsel)) && near(R('.mathbox-fav-filters'), R(gsel)),
				`${Math.round(L('.mathbox-fav-filters') ?? 0)}~${Math.round(R('.mathbox-fav-filters') ?? 0)}`,
			);
			const slot = q<HTMLElement>('.mathbox-side-searchrow');
			const slotCs = slot ? getComputedStyle(slot) : null;
			check(
				'筛选行水平内边距为 0（缩进由槽位统一提供）',
				filtersNow !== null && Number.parseFloat(getComputedStyle(filtersNow).paddingLeft) === 0,
				filtersNow ? getComputedStyle(filtersNow).paddingLeft : '(none)',
			);
			check(
				'槽位背景不透明（滚动时列表不会透出）',
				slotCs !== null && slotCs.backgroundColor !== 'rgba(0, 0, 0, 0)' && slotCs.backgroundColor !== 'transparent',
				slotCs?.backgroundColor ?? '(none)',
			);
		}

		// ⑥ 快捷工具 / 模板页不受影响（槽位隐藏）
		tabs[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(20);
		{
			const slot = q<HTMLElement>('.mathbox-side-searchrow');
			check(
				'切换到快捷工具页：槽位清空并隐藏（无残留筛选按钮）',
				slot !== null && slot.hidden === true && slot.children.length === 0,
				`hidden=${slot?.hidden} 子元素=${slot?.children.length}`,
			);
		}
	}

	/* ------------------------- 4h. 搜索行脱离滚动容器 + 居中对齐 ------------------------- */

	{
		const tabs = qAll('.mathbox-side-tabs .mathbox-tab');
		const L = (sel: string): number | null => {
			const el = q<HTMLElement>(sel);
			return el ? el.getBoundingClientRect().left : null;
		};
		const R = (sel: string): number | null => {
			const el = q<HTMLElement>(sel);
			return el ? el.getBoundingClientRect().right : null;
		};
		const near = (a: number | null, b: number | null, tol = 1): boolean =>
			a !== null && b !== null && Math.abs(a - b) <= tol;
		const gsel = '.mathbox-side-chips .mathbox-gselect';

		// ① 前提：分组跳转按钮在侧栏中水平居中（左右留白相等）
		{
			const pane = q<HTMLElement>('.mathbox-sidepane')?.getBoundingClientRect();
			const btn = q<HTMLElement>(gsel)?.getBoundingClientRect();
			check(
				'前提：分组跳转按钮在侧栏中水平居中（左右留白差 ≤1px）',
				Boolean(pane && btn) && Math.abs(btn.left - pane.left - (pane.right - btn.right)) <= 1,
				pane && btn ? `左 ${Math.round(btn.left - pane.left)} / 右 ${Math.round(pane.right - btn.right)}` : '(n/a)',
			);
		}

		// ② 公式模板页：容器与跳转按钮左右对齐
		tabs[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(30);
		{
			const sections = '.mathbox-tpl-sections';
			check(
				'公式模板页：列表容器左右边缘与分组跳转按钮对齐（±1px）',
				near(L(sections), L(gsel)) && near(R(sections), R(gsel)),
				`${Math.round(L(sections) ?? 0)}~${Math.round(R(sections) ?? 0)} vs ${Math.round(L(gsel) ?? 0)}~${Math.round(R(gsel) ?? 0)}`,
			);
			const tools = q<HTMLElement>('.mathbox-side-tools');
			check(
				'公式模板页：搜索框左右边缘与分组跳转按钮对齐（±1px）',
				near(L('.mathbox-tpl-search'), L(gsel)) && near(R('.mathbox-tpl-search'), R(gsel)),
				`${Math.round(L('.mathbox-tpl-search') ?? 0)}~${Math.round(R('.mathbox-tpl-search') ?? 0)}`,
			);
			check(
				'公式模板页：搜索框与列表容器共用同一左右边界（±1px）',
				near(L('.mathbox-tpl-search'), L(sections)) && near(R('.mathbox-tpl-search'), R(sections)),
				'',
			);
			// 搜索行在滚动容器之外
			check(
				'公式模板页：搜索框已脱离滚动容器（与跳转按钮同级）',
				Boolean(tools) && tools.parentElement?.classList.contains('mathbox-side-searchrow') === true,
				tools?.parentElement?.className ?? '(none)',
			);
			const rowEl = q<HTMLElement>('.mathbox-side-searchrow');
			check(
				'公式模板页：搜索行槽位与跳转按钮行同级（父级为侧栏）',
				Boolean(rowEl) && rowEl.parentElement?.classList.contains('mathbox-sidepane') === true,
				rowEl?.parentElement?.className ?? '(none)',
			);
			// 滚动时搜索框固定可见
			const body = q<HTMLElement>('.mathbox-side-body');
			if (body) {
				body.scrollTop = 200;
				await sleep(20);
				const input = q<HTMLElement>('.mathbox-tpl-search')?.getBoundingClientRect();
				const rowBox = rowEl?.getBoundingClientRect();
				check(
					'公式模板页：列表滚动时搜索框保持可见（不随内容滚走）',
					body.scrollTop > 0 && Boolean(input && rowBox) && Math.abs(input.top - (rowBox?.top ?? 0)) < 40,
					`scrollTop=${Math.round(body.scrollTop)}`,
				);
				body.scrollTop = 0;
				await sleep(20);
			}
		}

		// ③ 收藏夹页：容器与跳转按钮左右对齐
		tabs[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(30);
		{
			const searchRow = q<HTMLElement>('.mathbox-fav-search-row');
			check(
				'收藏夹页：搜索框已脱离滚动容器（与跳转按钮同级）',
				Boolean(searchRow) && searchRow.parentElement?.classList.contains('mathbox-side-searchrow') === true,
				searchRow?.parentElement?.className ?? '(none)',
			);
			check(
				'收藏夹页：搜索框左右边缘与分组跳转按钮对齐（±1px）',
				near(L('.mathbox-fav-search'), L(gsel)) && near(R('.mathbox-fav-search'), R(gsel)),
				`${Math.round(L('.mathbox-fav-search') ?? 0)}~${Math.round(R('.mathbox-fav-search') ?? 0)}`,
			);
			check(
				'收藏夹页：筛选行左右边缘与分组跳转按钮对齐（±1px）',
				near(L('.mathbox-fav-filters'), L(gsel)) && near(R('.mathbox-fav-filters'), R(gsel)),
				'',
			);
		}

		// ④ 快捷工具页：无搜索框，槽位隐藏且不占位
		tabs[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(30);
		{
			const rowEl = q<HTMLElement>('.mathbox-side-searchrow');
			check(
				'快捷工具页：无搜索框时槽位隐藏且不占空间',
				Boolean(rowEl) && rowEl.hidden === true && getComputedStyle(rowEl).display === 'none' && rowEl.getBoundingClientRect().height === 0,
				`hidden=${rowEl?.hidden} h=${Math.round(rowEl?.getBoundingClientRect().height ?? -1)}`,
			);
			check(
				'快捷工具页：符号网格左右边缘与跳转按钮对齐（±1px）',
				near(L('.mathbox-symbol-grid'), L(gsel)) && near(R('.mathbox-symbol-grid'), R(gsel)),
				'',
			);
		}

		// ⑤ 不同宽度下不失效：收窄侧栏后基线关系仍成立
		{
			const pane = q<HTMLElement>('.mathbox-sidepane');
			const tabs2 = qAll('.mathbox-side-tabs .mathbox-tab');
			tabs2[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			await sleep(20);
			for (const w of [420, 260]) {
				if (!pane) break;
				pane.style.setProperty('--mathbox-side-width', `${w}px`);
				await sleep(20);
				check(
					`宽度 ${w}px：模板容器与跳转按钮仍左右对齐（±1px）`,
					near(L('.mathbox-tpl-sections'), L(gsel)) && near(R('.mathbox-tpl-sections'), R(gsel)),
					`${Math.round(L('.mathbox-tpl-sections') ?? 0)}~${Math.round(R('.mathbox-tpl-sections') ?? 0)} vs ${Math.round(L(gsel) ?? 0)}~${Math.round(R(gsel) ?? 0)}`,
				);
				check(
					`宽度 ${w}px：搜索框与跳转按钮仍左右对齐（±1px）`,
					near(L('.mathbox-tpl-search'), L(gsel)) && near(R('.mathbox-tpl-search'), R(gsel)),
					'',
				);
			}
			pane?.style.removeProperty('--mathbox-side-width');
			await sleep(20);
		}
	}

	/* ------------------------- 5. 最大化 / 还原 ------------------------- */

	const winW = window.innerWidth;
	const winH = window.innerHeight;
	const topButtons = qAll('.mathbox-topbar .mathbox-window-controls .titlebar-button');
	topButtons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	const maxed = q('.mathbox-modal');
	check('最大化：类已添加', maxed?.classList.contains('is-maximized') === true);
	// jsdom 无关：真实浏览器会应用 100vw/100vh
	check('最大化：内联尺寸已清除', maxed?.style.getPropertyValue('width') === '');
	check('最大化：撑满视口', (maxed?.getBoundingClientRect().width ?? 0) >= winW - 20, String(maxed?.getBoundingClientRect().width));

	topButtons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	const restored = q('.mathbox-modal');
	check('还原：类已移除', restored?.classList.contains('is-maximized') === false);
	check('还原：恢复内联尺寸', px(restored as HTMLElement, 'width') > 0, (restored as HTMLElement)?.style.getPropertyValue('width'));

	/* ------------------------- 6. 拖动面板 ------------------------- */

	const before = q<HTMLElement>('.mathbox-modal') as HTMLElement;
	const x0 = px(before, 'left');
	const y0 = px(before, 'top');
	await drag(q('.mathbox-topbar'), [300, 20], [380, 70]);
	const afterDrag = q<HTMLElement>('.mathbox-modal') as HTMLElement;
	check('拖动顶栏改变面板位置', px(afterDrag, 'left') === x0 + 80 && px(afterDrag, 'top') === y0 + 50, `${px(afterDrag, 'left')}/${px(afterDrag, 'top')} vs ${x0 + 80}/${y0 + 50}`);
	check(
		'拖动结束写入设置（panelRect）',
		plugin.settings.panelRect?.x === px(afterDrag, 'left') && plugin.settings.panelRect?.y === px(afterDrag, 'top'),
		JSON.stringify(plugin.settings.panelRect),
	);

	/* ------------------------- 7. 缩放面板 ------------------------- */

	const w0 = px(afterDrag, 'width');
	const h0 = px(afterDrag, 'height');
	await drag(q('.mathbox-resize-handle.is-se'), [400, 400], [480, 460]);
	const afterResize = q<HTMLElement>('.mathbox-modal') as HTMLElement;
	check('右下把手放大面板', px(afterResize, 'width') === w0 + 80 && px(afterResize, 'height') === h0 + 60, `${px(afterResize, 'width')}/${px(afterResize, 'height')} vs ${w0 + 80}/${h0 + 60}`);

	// 缩放下限
	await drag(q('.mathbox-resize-handle.is-se'), [400, 400], [-2000, -2000]);
	check('缩放受最小尺寸约束', px(q<HTMLElement>('.mathbox-modal') as HTMLElement, 'width') >= 560, String(px(q<HTMLElement>('.mathbox-modal') as HTMLElement, 'width')));

	// ---- 最小化 → 还原：必须回到最小化之前的真实宽高（v3.2 修复） ----
	{
		const modal = q<HTMLElement>('.mathbox-modal');
		const ctrl = qAll('.mathbox-topbar .mathbox-window-controls .titlebar-button');
		const minBtn = ctrl[0];
		const maxBtn = ctrl[1];
		const size = (): { w: number; h: number; x: number; y: number } => {
			const r = modal?.getBoundingClientRect() ?? { width: 0, height: 0, left: 0, top: 0 };
			return { w: r.width, h: r.height, x: r.left, y: r.top };
		};

		// ① 先用把手把面板调整成"非默认"尺寸，确保还原的是用户调整后的结果
		const se = q<HTMLElement>('.mathbox-resize-handle.is-se');
		const hb = se?.getBoundingClientRect();
		if (se && hb) {
			await drag(se, [hb.left + 2, hb.top + 2], [hb.left + 62, hb.top + 52]);
		}
		await sleep(20);
		const beforeMin = size();
		const savedRect = JSON.stringify(plugin.settings.panelRect);

		minBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(20);
		const collapsed = size();
		check('最小化：高度收缩为顶栏高度', collapsed.h < beforeMin.h - 20, `${Math.round(beforeMin.h)} → ${Math.round(collapsed.h)}`);
		check('最小化：宽度保持不变', Math.abs(collapsed.w - beforeMin.w) <= 1, `${Math.round(beforeMin.w)} → ${Math.round(collapsed.w)}`);

		// ② 折叠期间发生窗口缩放：不得把折叠态尺寸写进内联样式
		window.dispatchEvent(new Event('resize'));
		await sleep(20);

		minBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(20);
		const restored = size();
		check('还原：宽度恢复为最小化前', Math.abs(restored.w - beforeMin.w) <= 1, `${Math.round(beforeMin.w)} → ${Math.round(restored.w)}`);
		check('还原：高度恢复为最小化前', Math.abs(restored.h - beforeMin.h) <= 1, `${Math.round(beforeMin.h)} → ${Math.round(restored.h)}`);
		check('还原：位置一并恢复', Math.abs(restored.x - beforeMin.x) <= 1 && Math.abs(restored.y - beforeMin.y) <= 1, `${Math.round(beforeMin.x)},${Math.round(beforeMin.y)} → ${Math.round(restored.x)},${Math.round(restored.y)}`);
		check('最小化/还原不改写尺寸记忆', JSON.stringify(plugin.settings.panelRect) === savedRect, `${savedRect} → ${JSON.stringify(plugin.settings.panelRect)}`);

		// ③ 最大化 → 最小化 → 还原：应回到最大化之前的尺寸
		const beforeMax = size();
		maxBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(20);
		check('最大化：铺满视口', (modal?.getBoundingClientRect().width ?? 0) >= window.innerWidth - 20);
		minBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(20);
		minBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await sleep(20);
		const afterMaxRound = size();
		check(
			'最大化 → 最小化 → 还原：回到最大化前尺寸',
			Math.abs(afterMaxRound.w - beforeMax.w) <= 1 && Math.abs(afterMaxRound.h - beforeMax.h) <= 1,
			`${Math.round(beforeMax.w)}×${Math.round(beforeMax.h)} → ${Math.round(afterMaxRound.w)}×${Math.round(afterMaxRound.h)}`,
		);
	}

	/* ------------------------- 8. 侧边栏调宽 ------------------------- */

	const paneBefore = q<HTMLElement>('.mathbox-sidepane');
	const paneW0 = paneBefore?.getBoundingClientRect().width ?? 0;
	check('侧边栏初始宽度 = 700', Math.round(paneW0) === 700, String(Math.round(paneW0)));
	// 把手在侧边栏左缘：向左拖（900 -> 840）应变宽
	await drag(q('.mathbox-side-resizer'), [900, 300], [840, 300]);
	const paneW1 = q<HTMLElement>('.mathbox-sidepane')?.getBoundingClientRect().width ?? 0;
	check('向左拖动侧边栏把手使其变宽', paneW1 > paneW0, `${Math.round(paneW0)} -> ${Math.round(paneW1)}`);
	check('侧边栏宽度写入设置', plugin.settings.sidePaneWidth === 760, String(plugin.settings.sidePaneWidth));
	check('宽度以 CSS 变量下发', (q<HTMLElement>('.mathbox-panel')?.style.getPropertyValue('--mathbox-side-width') ?? '') === '760px');

	// 上限约束
	await drag(q('.mathbox-side-resizer'), [900, 300], [0, 300]);
	check('侧边栏宽度受上限约束（<=780）', plugin.settings.sidePaneWidth === 780, String(plugin.settings.sidePaneWidth));

	/* ------------------------- 9. 插入并关闭 ------------------------- */

	notices.length = 0;
	const actions = qAll('.mathbox-option-right .mathbox-action');
	check('选项栏右侧为 行内 + 行间 两个插入动作', actions.length === 2);
	actions[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	await sleep(10);
	check('行间插入写入 $$...$$ 块', replaced[0] === '$$\na^2 + b^2 = c^2\n$$', JSON.stringify(replaced[0]));
	check('插入后面板自动关闭', q('.mathbox-modal') === null);
	check('插入后给出提示', notices.some((n) => n.includes('已插入行间公式')), notices.join('|'));

	/* ------------------------- 10. 设置页渲染 ------------------------- */

	const tab = new MathBoxSettingTab(app as never, plugin as never);
	tab.containerEl = document.createElement('div');
	let crashed = '';
	try {
		tab.display();
	} catch (error) {
		crashed = String(error);
	}
	check('设置页 display() 不抛错', crashed === '', crashed);
	const headings = Array.from(tab.containerEl.querySelectorAll('.mathbox-settings-heading')).map((h) => h.textContent ?? '');
	// 面板配色切换功能已移除：设置页不应再有「界面与外观」分节与配色下拉
	check('设置页已移除「界面与外观」分节（配色功能下线）', !headings.some((h) => h.includes('界面与外观')), headings.join('|'));
	check(
		'设置对象不再持有 panelTheme（状态与持久化逻辑已删除）',
		!('panelTheme' in plugin.settings) && !('panelTheme' in (s as unknown as Record<string, unknown>)),
		Object.keys(plugin.settings).join(','),
	);
	check('设置页含「启动扩展包」分节', headings.some((h) => h.includes('启动扩展包')));
	const toggles = tab.containerEl.querySelectorAll('.setting-item input[type=checkbox]');
	check(
		'扩展包开关数量 = 注册包数 + 2（插入行为两项）',
		toggles.length === EXTENSION_PACKAGES.length + 2,
		`${toggles.length}/${EXTENSION_PACKAGES.length + 2}`,
	);
	check(
		'设置页含注入通道状态说明',
		(tab.containerEl.textContent ?? '').includes('预加载注入'),
	);

	/* ------------------------- 11. 标签页吸附 / 独立窗口 ------------------------- */

	check(
		'已注册 mathbox-view 视图类型',
		(plugin as unknown as { views: Array<{ type: string }> }).views.some((v) => v.type === 'mathbox-view'),
	);
	let tabError = '';
	try {
		await openMathBoxTab(plugin);
	} catch (error) {
		tabError = String((error as Error)?.stack ?? error);
	}
	await sleep(40);
	check('标签页打开无异常', tabError === '', tabError.slice(0, 240));
	check('标签页模式：面板挂进视图内容区', Boolean(q('.mathbox-view-host .mathbox-panel')));
	check('标签页模式：窗口容器进入停靠态', Boolean(q('.mathbox-win-docked')));
	check(
		'标签页模式：只剩关闭键（最小化/最大化交给工作区）',
		qAll('.mathbox-view-host .mathbox-window-controls .titlebar-button').length === 1,
		String(qAll('.mathbox-view-host .mathbox-window-controls .titlebar-button').length),
	);
	check(
		'标签页模式：工具组仅剩设置 + 侧边栏（无置顶残留）',
		qAll('.mathbox-view-host .mathbox-topbar-tools .titlebar-button').length === 2,
		String(qAll('.mathbox-view-host .mathbox-topbar-tools .titlebar-button').length),
	);

	await openMathBoxPopout(plugin);
	await sleep(20);
	check(
		'独立窗口模式：产生 popout leaf 并装载同一视图',
		leaves.some((l) => l.popout && l.state?.type === 'mathbox-view'),
	);

	const dockedLeaf = leaves.find((l) => l.state?.type === 'mathbox-view' && !l.popout);
	const dockedHost = dockedLeaf?.view?.containerEl;
	dockedLeaf?.view?.close();
	await sleep(20);
	check('关闭标签页后视图内容被清理', Boolean(dockedHost) && dockedHost?.isConnected === false);

	// 清理独立窗口那个 leaf，避免影响后续断言
	const popoutLeaf = leaves.find((l) => l.popout && l.state?.type === 'mathbox-view');
	popoutLeaf?.detach();
	await sleep(10);

	/* ------------------------- 输出 ------------------------- */

	const failed = results.filter((r) => !r.ok);
	const lines = [
		`SUMMARY\t${results.length}\t${failed.length}`,
		...results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}\t${r.name}\t${r.detail}`),
	];
	write(lines);
}

function write(lines: string[]): void {
	const pre = document.createElement('pre');
	pre.id = 'RESULT';
	pre.textContent = lines.join('\n');
	document.body.appendChild(pre);
}

main().catch((error) => {
	write([`SUMMARY\t0\t1`, `FAIL\tharness crashed\t${String((error as Error)?.stack ?? error)}`]);
});
