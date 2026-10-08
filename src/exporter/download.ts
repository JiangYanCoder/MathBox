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

/**
 * 判定「用户取消了选择」的宽限时长（ms）。
 *
 * 关闭文件选择器与 change / cancel 事件送达之间有极短空档，先等一拍再判取消，
 * 避免抢在真正的选择之前把结果定成 null。
 */
const PICK_CANCEL_GRACE_MS = 300;

/**
 * 让浏览器读取一个本地文件（用于导入收藏夹 JSON）。
 *
 * 三条结束路径，全部经 `finish()` 单一出口收尾：
 *  · change 带文件  → 读盘完成后回填内容；
 *  · change 无文件  → 部分引擎在「取消」时以空 files 触发 change；
 *  · cancel        → 现代 Chromium 在直接关闭选择器时改发的就是它。
 *
 * 另有 `focus` 兜底：个别引擎（旧版 / 部分移动端 WebView）关闭选择器时
 * change 与 cancel 都不触发，此时 Promise 会永远挂起（调用方静默无反应），
 * 且 <input> 一直留在 body 里。选择器关闭后窗口会重获焦点，据此判定取消。
 */
export function pickTextFile(accept: string): Promise<string | null> {
	return new Promise((resolve) => {
		const input = createEl('input');
		input.type = 'file';
		input.accept = accept;
		input.setCssProps({ display: 'none' });

		let settled = false;
		/** change 已带文件触发（正在读盘）——兜底不得再判为「取消」而抢走结果 */
		let picking = false;

		/** 唯一结算出口：只 resolve 一次，并保证 <input> 一定从 DOM 移除 */
		function finish(value: string | null): void {
			if (settled) return;
			settled = true;
			window.removeEventListener('focus', onFocus);
			input.remove(); // 节点已分离时是安全的空操作
			resolve(value);
		}

		/** focus 兜底：见函数头说明 */
		function onFocus(): void {
			window.setTimeout(() => {
				if (!picking) finish(null);
			}, PICK_CANCEL_GRACE_MS);
		}

		input.addEventListener('change', () => {
			const file = input.files?.[0];
			if (!file) {
				finish(null);
				return;
			}
			picking = true;
			const reader = new FileReader();
			reader.onload = () => finish(typeof reader.result === 'string' ? reader.result : null);
			reader.onerror = () => finish(null);
			reader.readAsText(file);
		});

		input.addEventListener('cancel', () => finish(null));

		// 在 click() 之前注册：click 会同步返回，其间不可能有别的焦点事件
		window.addEventListener('focus', onFocus, { once: true });

		document.body.appendChild(input);
		input.click();
	});
}
