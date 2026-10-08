import { FilePlusPlusPlugin, type DocumentEmbed, type DocumentView, type EmbedContext } from 'file-plus-plus/obsidian';
import { FuzzySuggestModal, Notice, Setting, TFile, type WorkspaceLeaf } from 'obsidian';
import { TranscriptEmbed } from './embed';
import { createTranscriptFormat } from './format';
import { MEDIA_EXTENSIONS, findAllMedia, findMedia, findTranscript } from './media';
import type { TranscriptReader } from './reader';
import { TPP_DEFAULTS, type LinkPlayback, type TppSettings } from './settings';
import type { Transcript } from './transcript';
import { TranscriptView } from './view';

/** Transcript++: subtitles and transcripts next to their audio or video (see file-plus-plus). */
export default class TranscriptPlusPlus extends FilePlusPlusPlugin<Transcript, TranscriptReader> {
	readonly format = createTranscriptFormat(() => this.settings);
	declare settings: TppSettings;

	protected override defaultSettings(): TppSettings {
		return { ...super.defaultSettings(), ...structuredClone(TPP_DEFAULTS) };
	}

	override createView(leaf: WorkspaceLeaf): DocumentView<Transcript, TranscriptReader> {
		return new TranscriptView(leaf, this);
	}

	override createEmbed(ctx: EmbedContext, file: TFile, subpath: string): DocumentEmbed<Transcript, TranscriptReader> {
		return new TranscriptEmbed(this, ctx, file, subpath);
	}

	/** Opening a media file (of the chosen types) that has a transcript opens the transcript, playing it. */
	override documentFor(file: TFile): TFile | null {
		const s = this.settings;
		if (!s.openMediaInTranscript.includes(file.extension.toLowerCase())) return null;
		return findTranscript(this.app, file, this.format.extensions, s.mediaPatterns, s.mediaOverrides);
	}

	transcriptViews(): TranscriptView[] {
		return this.views().filter((v): v is TranscriptView => v instanceof TranscriptView);
	}

	/** Transcripts hidden in the file explorer: those a media file opens (when `hideTranscripts`). */
	hiddenTranscripts(): TFile[] {
		const s = this.settings;
		if (!s.hideTranscripts || !s.openMediaInTranscript.length) return [];
		return this.app.vault
			.getFiles()
			.filter((f) => this.format.extensions.includes(f.extension.toLowerCase()))
			.filter((t) => this.allMediaOf(t).some((m) => s.openMediaInTranscript.includes(m.extension.toLowerCase())));
	}

	private hideStyle: HTMLStyleElement | null = null;
	private hideTimer = 0;

	/** Re-apply `hideTranscripts` (debounced: called on every vault change). */
	updateHiddenTranscripts(now = false): void {
		window.clearTimeout(this.hideTimer);
		if (!now) {
			this.hideTimer = window.setTimeout(() => this.updateHiddenTranscripts(true), 500);
			return;
		}
		this.hideStyle ??= document.head.createEl('style', { attr: { id: `${this.manifest.id}-hidden` } });
		const rules = this.hiddenTranscripts().map((f) => `.nav-files-container .tree-item.nav-file:has(> .nav-file-title[data-path="${CSS.escape(f.path)}"])`);
		this.hideStyle.textContent = rules.length ? `${rules.join(',\n')} { display: none; }` : '';
	}

	override async onExternalSettingsChange(): Promise<void> {
		await super.onExternalSettingsChange();
		this.updateHiddenTranscripts(true);
	}

	override onunload(): void {
		super.onunload();
		window.clearTimeout(this.hideTimer);
		this.hideStyle?.remove();
	}

	protected override async onLoaded(): Promise<void> {
		this.app.workspace.onLayoutReady(() => {
			this.updateHiddenTranscripts(true);
			// Transcripts or media added, removed or renamed change what is hidden.
			for (const type of ['create', 'delete', 'rename'] as const) this.registerEvent(this.app.vault.on(type as 'create', () => this.updateHiddenTranscripts()));
		});
		this.addCommand({
			id: 'toggle-hide-transcripts',
			name: 'Toggle hiding transcripts (that open from their media) in the file explorer',
			callback: async () => {
				this.settings.hideTranscripts = !this.settings.hideTranscripts;
				await this.saveSettings();
				this.updateHiddenTranscripts(true);
				new Notice(this.settings.hideTranscripts ? `Hiding ${this.hiddenTranscripts().length} transcripts in the file explorer` : 'Showing transcripts in the file explorer');
			},
		});
		this.addCommand({
			id: 'choose-media',
			name: 'Choose the audio or video of this transcript',
			checkCallback: this.withView((v) => this.chooseMedia(v as TranscriptView)),
		});
		this.addCommand({
			id: 'play-pause',
			name: 'Play / pause',
			checkCallback: this.withView((v) => {
				const p = (v as TranscriptView).player;
				p?.toggle();
			}),
		});
		const skip = (id: string, name: string, delta: number) =>
			this.addCommand({
				id,
				name,
				checkCallback: this.withView((v) => {
					const p = (v as TranscriptView).player;
					p?.skip(delta);
				}),
			});
		skip('back-5', 'Back 5 seconds', -5);
		skip('forward-5', 'Forward 5 seconds', 5);
		skip('back-10', 'Back 10 seconds', -10);
		skip('forward-10', 'Forward 10 seconds', 10);
		// Media renamed: keep chosen pairings.
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => {
				const o = this.settings.mediaOverrides;
				let changed = false;
				for (const [k, v] of Object.entries(o)) {
					if (k === oldPath) {
						delete o[k];
						o[file.path] = v;
						changed = true;
					} else if (v === oldPath) {
						o[k] = file.path;
						changed = true;
					}
				}
				if (changed) void this.saveSettings();
			}),
		);
	}

	/** Pick a media file for the transcript in `view` (remembered per transcript). */
	chooseMedia(view: TranscriptView): void {
		const file = view.file;
		if (!file) return;
		const media = this.app.vault.getFiles().filter((f) => MEDIA_EXTENSIONS.includes(f.extension.toLowerCase()));
		const plugin = this;
		const modal = new (class extends FuzzySuggestModal<TFile> {
			getItems = () => media;
			getItemText = (f: TFile) => f.path;
			onChooseItem(f: TFile) {
				plugin.settings.mediaOverrides[file.path] = f.path;
				void plugin.saveSettings();
				plugin.updateHiddenTranscripts();
				for (const v of plugin.transcriptViews()) if (v.file?.path === file.path) v.loadPlayer();
				new Notice(`${file.basename} plays ${f.name}`);
			}
		})(this.app);
		modal.setPlaceholder(`Audio or video for ${file.basename}`);
		modal.open();
	}

	override displaySettings(el: HTMLElement, refresh: () => void): void {
		const s = this.settings;
		const save = () => this.saveSettings();
		new Setting(el)
			.setName('Find media by')
			.setDesc('One pattern per line, tried in order. {{folder}}: the transcript\'s folder, {{name}}: its name (also tried without a language suffix like ".en"). A pattern with "/" is a path (extension optional); a bare name matches that file name anywhere, preferring the same folder. "Choose the audio or video of this transcript" overrides it per transcript.')
			.addTextArea((t) => {
				t.inputEl.rows = 3;
				t.setValue(s.mediaPatterns.join('\n')).onChange(async (v) => {
					s.mediaPatterns = v.split('\n').map((x) => x.trim()).filter(Boolean);
					await save();
					this.updateHiddenTranscripts();
					for (const view of this.transcriptViews()) view.loadPlayer();
				});
			});
		const chosen = Object.keys(s.mediaOverrides).length;
		if (chosen)
			new Setting(el)
				.setName('Media chosen by hand')
				.setDesc(`${chosen} transcript${chosen === 1 ? '' : 's'}.`)
				.addButton((b) =>
					b.setButtonText('Forget all').onClick(async () => {
						s.mediaOverrides = {};
						await save();
						this.updateHiddenTranscripts();
						for (const view of this.transcriptViews()) view.loadPlayer();
						refresh();
					}),
				);
		new Setting(el)
			.setName('Open media in its transcript')
			.setDesc('Opening a file of these types that has a transcript (found as above) opens the transcript instead, playing that file. Separated by commas; empty: never. "Open … by itself" in the tab\'s menu shows the file alone.')
			.addText((t) =>
				t
					.setPlaceholder('mp3, mp4, webm')
					.setValue(s.openMediaInTranscript.join(', '))
					.onChange(async (v) => {
						s.openMediaInTranscript = v
							.split(/[\s,]+/)
							.map((x) => x.trim().replace(/^\./, '').toLowerCase())
							.filter(Boolean);
						await save();
						this.updateHiddenTranscripts();
					}),
			);
		new Setting(el)
			.setName('Hide transcripts in the file explorer')
			.setDesc('Hides transcripts that open from their audio or video (as above), since you open them by clicking the media file. Other transcripts stay visible; search, links and the quick switcher still find them. Also a command.')
			.addToggle((t) =>
				t.setValue(s.hideTranscripts).onChange(async (v) => {
					s.hideTranscripts = v;
					await save();
					this.updateHiddenTranscripts(true);
				}),
			);
		new Setting(el).setName('Opening a timestamp link').addDropdown((d) =>
			d
				.addOptions({ seek: 'Moves the player there', play: 'Plays from there', clip: 'Plays the passage, then stops' })
				.setValue(s.linkPlayback)
				.onChange(async (v) => {
					s.linkPlayback = v as LinkPlayback;
					await save();
				}),
		);
		new Setting(el)
			.setName('Follow playback')
			.setDesc('Scroll the transcript to the cue being played (paused for a few seconds after you scroll). Also a toolbar button.')
			.addToggle((t) =>
				t.setValue(s.followPlayback).onChange(async (v) => {
					s.followPlayback = v;
					await save();
				}),
			);
		new Setting(el)
			.setName('Contents every')
			.setDesc('Minutes per table-of-contents entry (and annotation-file heading). Applies to transcripts opened from now on.')
			.addSlider((sl) =>
				sl
					.setLimits(1, 30, 1)
					.setValue(s.sectionMinutes)
					.setDynamicTooltip()
					.onChange(async (v) => {
						s.sectionMinutes = v;
						await save();
					}),
			);
	}

	/** The media of a transcript, by the settings (for other code and tests). */
	mediaOf(file: TFile): TFile | null {
		return findMedia(this.app, file, this.settings.mediaPatterns, this.settings.mediaOverrides);
	}

	/** All media of a transcript (alternatives like `talk.mp3` and `talk.mp4`), best first. */
	allMediaOf(file: TFile): TFile[] {
		return findAllMedia(this.app, file, this.settings.mediaPatterns, this.settings.mediaOverrides);
	}
}
