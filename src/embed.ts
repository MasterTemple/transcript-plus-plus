import { DocumentEmbed, MediaPlayer } from 'file-plus-plus/obsidian';
import type { ParsedLocator } from 'file-plus-plus/core';
import { findMedia } from './media';
import type { TranscriptReader } from './reader';
import type TranscriptPlusPlus from './main';
import { parseTimeLocator } from './time';
import type { Transcript } from './transcript';

/** `![[talk.srt#t=…]]` and hover previews: the media (cued to the passage) above the transcript. */
export class TranscriptEmbed extends DocumentEmbed<Transcript, TranscriptReader> {
	private player: MediaPlayer | null = null;
	private playerEl!: HTMLElement;

	protected override buildExtraUi(): void {
		this.playerEl = createDiv('tpp-player tpp-embed-player');
		this.containerEl.insertBefore(this.playerEl, this.host);
	}

	protected override onReaderReady(reader: TranscriptReader, loc: ParsedLocator, range: Range | null): void {
		const plugin = this.plugin as unknown as TranscriptPlusPlus;
		const s = plugin.settings;
		const media = findMedia(plugin.app, this.file, s.mediaPatterns, s.mediaOverrides);
		this.player?.destroy();
		this.playerEl.empty();
		if (!media) return;
		const player = (this.player = new MediaPlayer(this.playerEl, plugin.app.vault.getResourcePath(media), { fallbackDuration: reader.transcript.duration, rate: s.playbackRate }));
		const t = loc.locator ? parseTimeLocator(loc.locator) : null;
		const cues = !t && range ? reader.cuesOf(range) : [];
		const start = t?.start ?? cues[0]?.start ?? 0;
		const end = t ? t.end : (cues[cues.length - 1]?.end ?? null);
		// Show the passage's first frame; playing stops at its end (once).
		player.on('loadedmetadata', () => player.seek(start));
		let clip = end !== null;
		player.on('play', () => {
			if (clip && end !== null) {
				clip = false;
				if (player.time < start - 0.5 || player.time > end) player.seek(start);
				player.playClip(player.time, end);
			}
		});
		player.on('timeupdate', () => reader.setPlaying(reader.cueAt(player.time)));
	}

	override onunload(): void {
		this.player?.destroy();
		this.player = null;
		super.onunload();
	}
}
