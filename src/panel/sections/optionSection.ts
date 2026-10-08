/**
 * B 区：选项栏
 *
 * 左侧为输入选项（字号 / 字体 / 颜色 / 环境），右侧为**插入动作**
 * （行内公式 / 行间公式）——单击即写入正文并关闭面板，不存在持久选中态。
 */

import {
	applyStyleEdit,
	COLOR_PRESETS,
	FONT_COMMANDS,
	isValidColor,
	SIZE_COMMANDS,
	type StyleKind,
} from '../../core/wrap';
import type { FormulaStyle } from '../../types';
import { PromptModal } from '../favoriteDialog';
import { buildSelect, makeEl, setBtnIcon, type SelectOption } from '../ui';
import type { PanelContext } from './context';

export interface OptionSectionApi {
	el: HTMLElement;
	sync(style: FormulaStyle): void;
}

const ENVIRONMENTS = ['', 'align', 'cases', 'pmatrix', 'bmatrix', 'array'] as const;

const CUSTOM_COLOR = '__custom__';

export function createOptionSection(ctx: PanelContext): OptionSectionApi {
	const t = ctx.t;
	const el = makeEl('div', { cls: 'mathbox-optionbar' });
	const left = makeEl('div', { cls: 'mathbox-option-left', parent: el });
	const right = makeEl('div', { cls: 'mathbox-option-right', parent: el });

	const sizeOptions: SelectOption[] = [
		{ value: '', label: t('option.fontSizeDefault') },
		...SIZE_COMMANDS.map((cmd) => ({ value: cmd, label: cmd.slice(1) })),
	];

	const fontOptions: SelectOption[] = [
		{ value: '', label: t('option.fontDefault') },
		...FONT_COMMANDS.map((cmd) => ({ value: cmd, label: cmd.slice(1) })),
	];

	const colorOptions: SelectOption[] = [
		{ value: '', label: t('option.colorDefault') },
		...COLOR_PRESETS.map((preset) => ({
			value: preset.value,
			label: preset.value,
			swatch: preset.hex,
		})),
		{ value: CUSTOM_COLOR, label: t('option.customColor') },
	];

	const envOptions: SelectOption[] = ENVIRONMENTS.map((env) => ({
		value: env,
		label: env ? env : t('option.envNone'),
	}));

	function runStyleEdit(kind: StyleKind, value: string): void {
		const source = ctx.getSource();
		const selection = ctx.getSelection();
		const edit = applyStyleEdit(source, selection.start, selection.end, kind, value);
		if (edit.text === source) return;
		ctx.setSource(edit.text, edit.end);
	}

	const sizeSelect = buildSelect(sizeOptions, '', (value) => runStyleEdit('fontSize', value), t('option.fontSize'));
	const fontSelect = buildSelect(fontOptions, '', (value) => runStyleEdit('font', value), t('option.font'));
	const colorSelect = buildSelect(colorOptions, '', (value) => handleColor(value), t('option.color'));
	const envSelect = buildSelect(envOptions, '', (value) => ctx.applyEnvironment(value), t('option.environment'));

	const colorWrap = makeEl('div', { cls: 'mathbox-color-wrap' });
	const colorDot = makeEl('span', { cls: 'mathbox-color-dot', parent: colorWrap });
	colorWrap.appendChild(colorSelect);

	/** 色点反映当前颜色（原生 select 无法给 option 上色） */
	function updateColorDot(color: string): void {
		const preset = COLOR_PRESETS.find((item) => item.value === color);
		if (preset) {
			colorDot.style.background = preset.hex;
			colorDot.hidden = false;
			return;
		}
		if (color && isValidColor(color)) {
			colorDot.style.background = color;
			colorDot.hidden = false;
			return;
		}
		colorDot.hidden = true;
	}

	function handleColor(value: string): void {
		if (value !== CUSTOM_COLOR) {
			updateColorDot(value);
			runStyleEdit('color', value);
			return;
		}
		new PromptModal(ctx.app, {
			title: t('option.customColor'),
			placeholder: t('option.customColorPrompt'),
			value: '',
			okText: t('common.ok'),
			cancelText: t('common.cancel'),
			onSubmit: (input) => {
				const color = input.trim();
				if (!color) {
					colorSelect.value = '';
					return;
				}
				if (!isValidColor(color)) {
					ctx.notify(t('option.customColorInvalid'), true);
					colorSelect.value = '';
					return;
				}
				runStyleEdit('color', color);
			},
		}).open();
	}

	left.append(sizeSelect, fontSelect, colorWrap);

	const envWrap = makeEl('div', { cls: 'mathbox-env-wrap', parent: left });
	envWrap.appendChild(envSelect);
	envWrap.title = t('option.envHint');

	const inlineBtn = makeEl('button', {
		cls: 'mathbox-btn is-text mathbox-action',
		attr: { type: 'button' },
		parent: right,
	});
	inlineBtn.title = t('option.inlineHint');
	setBtnIcon(inlineBtn, 'align-left');
	makeEl('span', { text: t('option.inline'), parent: inlineBtn });

	const displayBtn = makeEl('button', {
		cls: 'mathbox-btn is-text mathbox-action',
		attr: { type: 'button' },
		parent: right,
	});
	displayBtn.title = t('option.displayHint');
	setBtnIcon(displayBtn, 'align-center');
	makeEl('span', { text: t('option.display'), parent: displayBtn });

	inlineBtn.addEventListener('click', () => ctx.insertToNote('inline'));
	displayBtn.addEventListener('click', () => ctx.insertToNote('display'));

	function sync(style: FormulaStyle): void {
		sizeSelect.value = style.fontSize;
		fontSelect.value = style.font;
		const knownColor = COLOR_PRESETS.some((preset) => preset.value === style.color);
		if (!style.color || knownColor) {
			colorSelect.value = style.color;
		} else if (isValidColor(style.color)) {
			colorSelect.value = CUSTOM_COLOR;
		} else {
			colorSelect.value = '';
		}
		updateColorDot(style.color);
	}

	return { el, sync };
}
