/**
 * 自定义矩阵弹窗：输入行数 / 列数 / 环境，插入对应矩阵模板
 *
 * 需求（王先生 2026-10-08）：快捷工具「数组矩阵」分组中可自定义行数与列数，
 * 插入成对应维度的矩阵骨架（如 2×3、3×3），省去手敲 `&` 与 `\\`。
 *
 * 骨架生成是纯逻辑（core/latex 的 buildMatrixLatex），本文件只负责表单与校验。
 */

import { App, Modal } from 'obsidian';
import {
	buildMatrixLatex,
	clampMatrixSize,
	MATRIX_ENVS,
	MATRIX_SIZE_MAX,
	MATRIX_SIZE_MIN,
	type MatrixEnv,
} from '../core/latex';
import { makeEl } from './ui';

export interface MatrixSizeModalOptions {
	title: string;
	rowsLabel: string;
	colsLabel: string;
	envLabel: string;
	okText: string;
	cancelText: string;
	invalidText: string;
	defaultRows: number;
	defaultCols: number;
	defaultEnv: MatrixEnv;
	onSubmit: (latex: string) => void;
}

export class MatrixSizeModal extends Modal {
	private readonly options: MatrixSizeModalOptions;

	constructor(app: App, options: MatrixSizeModalOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.titleEl.setText(this.options.title);
		this.modalEl.addClass('mathbox-prompt-modal');
		contentEl.addClass('mathbox-prompt-content');

		const grid = makeEl('div', { cls: 'mathbox-matrix-grid', parent: contentEl });

		// 行数
		const rowsField = makeEl('label', { cls: 'mathbox-matrix-field', parent: grid });
		makeEl('span', { text: this.options.rowsLabel, parent: rowsField });
		const rowsInput = makeEl('input', {
			cls: 'mathbox-matrix-input',
			parent: rowsField,
			attr: { type: 'number', min: String(MATRIX_SIZE_MIN), max: String(MATRIX_SIZE_MAX) },
		});
		rowsInput.value = String(this.options.defaultRows);

		// 列数
		const colsField = makeEl('label', { cls: 'mathbox-matrix-field', parent: grid });
		makeEl('span', { text: this.options.colsLabel, parent: colsField });
		const colsInput = makeEl('input', {
			cls: 'mathbox-matrix-input',
			parent: colsField,
			attr: { type: 'number', min: String(MATRIX_SIZE_MIN), max: String(MATRIX_SIZE_MAX) },
		});
		colsInput.value = String(this.options.defaultCols);

		// 环境（下拉）
		const envField = makeEl('label', { cls: 'mathbox-matrix-field is-wide', parent: grid });
		makeEl('span', { text: this.options.envLabel, parent: envField });
		const envSelect = makeEl('select', { cls: 'mathbox-matrix-select', parent: envField });
		for (const env of MATRIX_ENVS) {
			const opt = document.createElement('option');
			opt.value = env;
			opt.textContent = `\\begin{${env}}`;
			envSelect.appendChild(opt);
		}
		envSelect.value = this.options.defaultEnv;

		// 尺寸随输入实时反映在标题上（如「2 × 3」）
		const preview = makeEl('div', { cls: 'mathbox-matrix-preview', parent: contentEl });
		const paintPreview = (): void => {
			const r = clampMatrixSize(Number.parseInt(rowsInput.value, 10));
			const c = clampMatrixSize(Number.parseInt(colsInput.value, 10));
			preview.textContent = `${r} × ${c}`;
		};
		rowsInput.addEventListener('input', paintPreview);
		colsInput.addEventListener('input', paintPreview);
		paintPreview();

		const errorBar = makeEl('div', { cls: 'mathbox-note is-error', parent: contentEl });
		errorBar.hidden = true;

		const row = makeEl('div', { cls: 'mathbox-prompt-actions', parent: contentEl });
		const cancelBtn = makeEl('button', {
			cls: 'mathbox-btn is-text',
			text: this.options.cancelText,
			attr: { type: 'button' },
			parent: row,
		});
		const okBtn = makeEl('button', {
			cls: 'mathbox-btn is-text mod-cta',
			text: this.options.okText,
			attr: { type: 'button' },
			parent: row,
		});

		const submit = (): void => {
			const rows = Number.parseInt(rowsInput.value, 10);
			const cols = Number.parseInt(colsInput.value, 10);
			if (
				!Number.isFinite(rows) ||
				!Number.isFinite(cols) ||
				rows < MATRIX_SIZE_MIN ||
				cols < MATRIX_SIZE_MIN ||
				rows > MATRIX_SIZE_MAX ||
				cols > MATRIX_SIZE_MAX
			) {
				errorBar.textContent = this.options.invalidText;
				errorBar.hidden = false;
				return;
			}
			const env = (envSelect.value || this.options.defaultEnv) as MatrixEnv;
			this.close();
			this.options.onSubmit(buildMatrixLatex(rows, cols, env));
		};

		okBtn.addEventListener('click', submit);
		cancelBtn.addEventListener('click', () => this.close());
		for (const input of [rowsInput, colsInput]) {
			input.addEventListener('keydown', (ev: KeyboardEvent) => {
				if (ev.key !== 'Enter') return;
				ev.preventDefault();
				submit();
			});
		}

		window.setTimeout(() => {
			rowsInput.focus();
			rowsInput.select();
		}, 0);
	}

	onClose(): void {
		this.contentEl.replaceChildren();
	}
}
