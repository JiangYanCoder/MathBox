/**
 * 纯逻辑防抖器（不依赖 Obsidian 宿主，可独立单测）
 */

export interface Debounced<A extends unknown[]> {
	(...args: A): void;
	/** 取消尚未触发的调用 */
	cancel(): void;
	/** 立即执行尚未触发的调用 */
	flush(): void;
}

export function createDebounce<A extends unknown[]>(
	fn: (...args: A) => void,
	wait: number,
): Debounced<A> {
	let timer: number | null = null;
	let pending: A | null = null;

	const invoke = (): void => {
		timer = null;
		const args = pending;
		pending = null;
		if (args) fn(...args);
	};

	const debounced = ((...args: A): void => {
		pending = args;
		if (timer !== null) window.clearTimeout(timer);
		timer = window.setTimeout(invoke, wait);
	}) as Debounced<A>;

	debounced.cancel = (): void => {
		if (timer !== null) window.clearTimeout(timer);
		timer = null;
		pending = null;
	};

	debounced.flush = (): void => {
		if (timer !== null) {
			window.clearTimeout(timer);
			invoke();
		}
	};

	return debounced;
}
