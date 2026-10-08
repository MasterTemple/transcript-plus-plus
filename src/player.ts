import { setIcon, type App, type TFile } from 'obsidian';

export interface PlayerOptions {
	/** Used while the file doesn't say how long it is (e.g. WebM recorded in a browser): the transcript's end. */
	fallbackDuration?: number;
	/** Playback speed to start with, and where to report changes. */
	rate?: number;
	onRate?(rate: number): void;
}

const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];

/**
 * The player above a transcript (view and embeds): the vault file through Obsidian's resource URL, with
 * our own controls (large touch targets, a draggable progress bar, ±10 s, speed). Audio-only files
 * (including audio-only WebM) show just the controls once their metadata says there is no picture.
 */
export class MediaPlayer {
	readonly root: HTMLElement;
	readonly el: HTMLVideoElement;
	private clipStart = 0;
	private clipEnd: number | null = null;
	private listeners: (() => void)[] = [];
	private seekEl!: HTMLInputElement;
	private curEl!: HTMLElement;
	private totalEl!: HTMLElement;
	private playEl!: HTMLElement;
	private dragging = false;
	/** Set while the browser is made to find a missing duration (see `fixDuration`). */
	private probing = false;
	private pendingTime: number | null = null;

	constructor(
		container: HTMLElement,
		app: App,
		readonly file: TFile,
		private opts: PlayerOptions = {},
	) {
		const root = (this.root = container.createDiv({ cls: 'tpp-player-ui is-audio' }));
		const el = (this.el = root.createEl('video', { cls: 'tpp-media' }));
		el.preload = 'metadata';
		el.playsInline = true;
		el.src = app.vault.getResourcePath(file);
		el.playbackRate = opts.rate ?? 1;
		el.addEventListener('click', () => this.toggle());
		this.buildControls();
		this.on('loadedmetadata', () => {
			root.toggleClass('is-audio', !el.videoWidth);
			this.fixDuration();
			this.update();
		});
		this.on('durationchange', () => {
			if (this.probing && Number.isFinite(el.duration)) {
				this.probing = false;
				el.currentTime = this.pendingTime ?? 0;
				this.pendingTime = null;
			}
			this.update();
		});
		this.on('timeupdate', () => {
			// A clip stops at its end.
			if (this.clipEnd !== null && el.currentTime >= this.clipEnd) {
				el.pause();
				this.clipEnd = null;
			}
			this.update();
		});
		this.on('seeking', () => {
			if (this.clipEnd !== null && (el.currentTime > this.clipEnd + 0.5 || el.currentTime < this.clipStart - 0.5)) this.clipEnd = null;
		});
		for (const type of ['play', 'pause', 'ended'] as const) this.on(type, () => this.update());
		this.on('ratechange', () => this.update());
	}

	/**
	 * Browser-recorded WebM has no duration in its header (`Infinity`): seeking far past the end makes
	 * the browser read to the end and learn it. Meanwhile the transcript's length stands in.
	 */
	private fixDuration(): void {
		if (Number.isFinite(this.el.duration) || this.probing) return;
		this.probing = true;
		this.pendingTime ??= this.el.currentTime;
		this.el.currentTime = 1e101;
	}

	private buildControls(): void {
		const bar = this.root.createDiv('tpp-controls');
		const button = (cls: string, icon: string, label: string, onClick: () => void) => {
			const b = bar.createEl('button', { cls: `tpp-control ${cls}`, attr: { 'aria-label': label, type: 'button' } });
			setIcon(b, icon);
			b.addEventListener('click', (e) => {
				e.preventDefault();
				onClick();
			});
			return b;
		};
		button('tpp-back', 'rotate-ccw', 'Back 10 seconds', () => this.skip(-10));
		this.playEl = button('tpp-play', 'play', 'Play', () => this.toggle());
		button('tpp-forward', 'rotate-cw', 'Forward 10 seconds', () => this.skip(10));
		this.curEl = bar.createSpan({ cls: 'tpp-time tpp-time-current', text: '0:00' });
		const seek = (this.seekEl = bar.createEl('input', { cls: 'tpp-seek', type: 'range', attr: { min: '0', max: '0', step: '0.1', 'aria-label': 'Position' } }));
		seek.addEventListener('input', () => {
			this.dragging = true;
			this.el.currentTime = Number(seek.value);
			this.update();
		});
		seek.addEventListener('change', () => (this.dragging = false));
		// Touches on the bar belong to it (not to Obsidian's swipe gestures).
		for (const type of ['touchstart', 'touchmove', 'touchend']) seek.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
		this.totalEl = bar.createSpan({ cls: 'tpp-time tpp-time-total', text: '0:00' });
		const rate = bar.createEl('button', { cls: 'tpp-control tpp-rate', attr: { 'aria-label': 'Playback speed', type: 'button' } });
		rate.addEventListener('click', (e) => {
			e.preventDefault();
			const next = RATES[(RATES.indexOf(this.el.playbackRate) + 1) % RATES.length] ?? 1;
			this.el.playbackRate = next;
			this.opts.onRate?.(next);
		});
		button('tpp-fullscreen', 'maximize', 'Full screen', () => {
			const v = this.el as HTMLVideoElement & { webkitEnterFullscreen?: () => void };
			if (v.requestFullscreen) void v.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
			else v.webkitEnterFullscreen?.();
		});
	}

	/** Duration in seconds (the file's, else the transcript's), or 0. */
	get duration(): number {
		const d = this.el.duration;
		return Number.isFinite(d) && d > 0 ? d : (this.opts.fallbackDuration ?? 0);
	}

	private update(): void {
		const { el } = this;
		const d = this.duration;
		const t = this.probing ? (this.pendingTime ?? 0) : el.currentTime;
		this.seekEl.max = String(d);
		if (!this.dragging) this.seekEl.value = String(t);
		this.seekEl.style.setProperty('--progress', d ? `${Math.min(100, (t / d) * 100)}%` : '0%');
		this.curEl.setText(clock(t));
		this.totalEl.setText(d ? clock(d) : '–:––');
		const playing = !el.paused;
		if (this.playEl.dataset.state !== String(playing)) {
			this.playEl.dataset.state = String(playing);
			setIcon(this.playEl, playing ? 'pause' : 'play');
			this.playEl.setAttr('aria-label', playing ? 'Pause' : 'Play');
		}
		const rate = this.root.querySelector('.tpp-rate');
		rate?.setText(`${el.playbackRate}×`);
	}

	/** Listen to the media element (until `destroy`, or the returned function). */
	on<K extends keyof HTMLMediaElementEventMap>(type: K, fn: (e: HTMLMediaElementEventMap[K]) => void): () => void {
		this.el.addEventListener(type, fn);
		const off = () => this.el.removeEventListener(type, fn);
		this.listeners.push(off);
		return off;
	}

	get time(): number {
		return this.probing ? (this.pendingTime ?? 0) : this.el.currentTime;
	}

	get paused(): boolean {
		return this.el.paused;
	}

	toggle(): void {
		if (this.el.paused) void this.el.play().catch(() => {});
		else this.el.pause();
	}

	skip(delta: number): void {
		this.seek(Math.max(0, Math.min(this.duration || Infinity, this.time + delta)), !this.el.paused);
	}

	seek(time: number, play = false): void {
		this.clipEnd = null;
		if (this.probing) this.pendingTime = time;
		else this.el.currentTime = time;
		this.update();
		if (play) void this.el.play().catch(() => {});
	}

	/** Play from `start` and pause at `end`. */
	playClip(start: number, end: number): void {
		this.seek(start, true);
		this.clipStart = start;
		this.clipEnd = end;
	}

	destroy(): void {
		this.listeners.forEach((off) => off());
		this.el.pause();
		this.el.removeAttribute('src');
		this.el.load();
		this.root.remove();
	}
}

function clock(t: number): string {
	const total = Math.max(0, Math.floor(t));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
