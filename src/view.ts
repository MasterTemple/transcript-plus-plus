import { DocumentView } from 'file-plus-plus/obsidian';
import { PREFIX, type SelectionInfo } from 'file-plus-plus/core';
import { setIcon, type Menu } from 'obsidian';
import { MediaPlayer, findMedia } from './media';
import type { TranscriptReader } from './reader';
import type TranscriptPlusPlus from './main';
import { parseTimeLocator } from './time';
import type { Transcript } from './transcript';

/** The transcript view: the media player above the transcript, kept in sync with it. */
export class TranscriptView extends DocumentView<Transcript, TranscriptReader> {
	player: MediaPlayer | null = null;
	private playerEl!: HTMLElement;
	private followButton!: HTMLElement;
	/** Until then, playback doesn't scroll the transcript (the user scrolled it). */
	private manualScrollUntil = 0;
	private offReader: (() => void)[] = [];

	private get tpp(): TranscriptPlusPlus {
		return this.plugin as unknown as TranscriptPlusPlus;
	}

	protected override buildExtraUi(): void {
		this.playerEl = this.contentEl.createDiv('tpp-player');
		this.contentEl.insertBefore(this.playerEl, this.mainEl);
		const search = this.toolbarEl.querySelector(`.${PREFIX}-toolbar-button[aria-label="Search"]`);
		this.followButton = this.toolbarButton(this.toolbarEl, 'locate', 'Follow playback', () => this.setFollow(!this.tpp.settings.followPlayback));
		if (search) this.toolbarEl.insertBefore(this.followButton, search);
		this.followButton.toggleClass('is-active', this.tpp.settings.followPlayback);
	}

	private setFollow(on: boolean): void {
		this.tpp.settings.followPlayback = on;
		void this.tpp.saveSettings();
		for (const v of this.tpp.transcriptViews()) v.followButton.toggleClass('is-active', on);
		if (on) this.manualScrollUntil = 0;
	}

	protected override onReaderReady(reader: TranscriptReader): void {
		this.loadPlayer();
		const scroller = reader.scroller;
		const onClick = (e: MouseEvent) => {
			const t = reader.labelTimeAt(e);
			if (t !== null && this.player) {
				e.preventDefault();
				this.player.seek(t, true);
				return;
			}
			// Ctrl/Cmd-click on a cue plays from it.
			const cue = (e.composedPath()[0] as Element | undefined)?.closest?.('[data-cue]') as HTMLElement | null;
			if (cue && (e.ctrlKey || e.metaKey) && this.player) {
				e.preventDefault();
				e.stopPropagation();
				this.player.seek(reader.transcript.cues[Number(cue.dataset.cue)].start, true);
			}
		};
		// Wheel / touch scrolling pauses following for a few seconds.
		const manual = () => (this.manualScrollUntil = Date.now() + 4000);
		scroller.addEventListener('click', onClick, true);
		scroller.addEventListener('wheel', manual, { passive: true });
		scroller.addEventListener('touchmove', manual, { passive: true });
		this.offReader = [
			() => scroller.removeEventListener('click', onClick, true),
			() => scroller.removeEventListener('wheel', manual),
			() => scroller.removeEventListener('touchmove', manual),
		];
	}

	/** (Re)create the player for this transcript's media, or offer to choose one. */
	loadPlayer(): void {
		this.player?.destroy();
		this.player = null;
		this.playerEl.empty();
		if (!this.file || !this.reader) return;
		const s = this.tpp.settings;
		const media = findMedia(this.app, this.file, s.mediaPatterns, s.mediaOverrides);
		if (!media) {
			const row = this.playerEl.createDiv('tpp-player-missing');
			setIcon(row.createSpan(), 'file-audio');
			row.createSpan({ text: 'No audio or video found for this transcript.' });
			row.createEl('button', { text: 'Choose…' }).addEventListener('click', () => this.tpp.chooseMedia(this));
			return;
		}
		const player = (this.player = new MediaPlayer(this.playerEl, this.app, media));
		const reader = this.reader;
		const sync = () => {
			if (this.reader !== reader || this.player !== player) return;
			const changed = reader.setPlaying(player.el.paused && player.time === 0 ? null : reader.cueAt(player.time));
			if (changed && !player.el.paused && this.tpp.settings.followPlayback && Date.now() > this.manualScrollUntil) {
				const r = changed.ownerDocument.createRange();
				r.selectNodeContents(changed);
				const box = reader.scroller.getBoundingClientRect();
				const at = changed.getBoundingClientRect();
				if (at.top < box.top + box.height * 0.15 || at.bottom > box.top + box.height * 0.75) reader.scrollToRange(r, { position: 'center' });
			}
		};
		player.on('timeupdate', sync);
		player.on('seeked', sync);
		if (this.pendingSeek) {
			this.applyLocator(this.pendingSeek);
			this.pendingSeek = null;
		}
	}

	private pendingSeek: string | null = null;

	/** Opening a link to a time seeks (or plays, per settings). */
	protected override onNavigate(locator: string): void {
		if (!this.player) {
			this.pendingSeek = locator;
			return;
		}
		this.applyLocator(locator);
	}

	private applyLocator(locator: string): void {
		const t = parseTimeLocator(locator) ?? this.timesOf(locator);
		if (!t || !this.player) return;
		const mode = this.tpp.settings.linkPlayback;
		if (mode === 'clip' && t.end !== null) this.player.playClip(t.start, t.end);
		else this.player.seek(t.start, mode !== 'seek');
	}

	/** Start and end of any locator (text fragments, cue ids) through the cues it covers. */
	private timesOf(locator: string): { start: number; end: number | null } | null {
		const range = this.reader?.resolve(locator);
		const cues = range && this.reader!.cuesOf(range);
		return cues?.length ? { start: cues[0].start, end: cues[cues.length - 1].end } : null;
	}

	protected override extendSelectionMenu(menu: Menu, info: SelectionInfo): void {
		if (!this.player) return;
		const cues = this.reader?.cuesOf(info.range) ?? [];
		if (!cues.length) return;
		const start = cues[0].start;
		const end = cues[cues.length - 1].end;
		menu.addItem((i) => i.setTitle('Play from here').setIcon('play').setSection('tpp-play').onClick(() => this.player?.seek(start, true)));
		menu.addItem((i) => i.setTitle('Play selection').setIcon('repeat-1').setSection('tpp-play').onClick(() => this.player?.playClip(start, end)));
	}

	protected override onTeardown(): void {
		this.offReader.forEach((off) => off());
		this.offReader = [];
		this.player?.destroy();
		this.player = null;
		this.playerEl?.empty();
	}
}
