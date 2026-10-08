/**
 * 剪贴板与文件下载工具
 */

/** 复制文本到剪贴板；失败时回退到 execCommand */
export async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return legacyCopy(text);
	}
}

function legacyCopy(text: string): boolean {
	try {
		const ta = createEl('textarea');
		ta.value = text;
		ta.setAttribute('readonly', '');
		ta.setCssProps({ position: 'fixed', top: '-1000px', opacity: '0' });
		document.body.appendChild(ta);
		ta.select();
		const ok = document.execCommand('copy');
		document.body.removeChild(ta);
		return ok;
	} catch {
		return false;
	}
}

/** 触发一次文件下载 */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = createEl('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(text: string, filename: string, mime: string): void {
	downloadBlob(new Blob([text], { type: `${mime};charset=utf-8` }), filename);
}

/** `20261007-2110` 形式的文件名后缀 */
export function timestampSuffix(): string {
	const d = new Date();
	const p = (n: number): string => String(n).padStart(2, '0');
	return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** 让浏览器读取一个本地文件（用于导入收藏夹 JSON） */
export function pickTextFile(accept: string): Promise<string | null> {
	return new Promise((resolve) => {
		const input = createEl('input');
		input.type = 'file';
		input.accept = accept;
		input.setCssProps({ display: 'none' });
		input.addEventListener('change', () => {
			const file = input.files?.[0];
			if (!file) {
				resolve(null);
				document.body.removeChild(input);
				return;
			}
			const reader = new FileReader();
			reader.onload = () => {
				resolve(typeof reader.result === 'string' ? reader.result : null);
				document.body.removeChild(input);
			};
			reader.onerror = () => {
				resolve(null);
				document.body.removeChild(input);
			};
			reader.readAsText(file);
		});
		input.addEventListener('cancel', () => {
			resolve(null);
			document.body.removeChild(input);
		});
		document.body.appendChild(input);
		input.click();
	});
}
