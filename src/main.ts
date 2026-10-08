import { FilePlusPlusPlugin, type DocumentEmbed, type DocumentView, type EmbedContext } from 'file-plus-plus/obsidian';
import { FuzzySuggestModal, Notice, Setting, TFile, type WorkspaceLeaf } from 'obsidian';
import { TranscriptEmbed } from './embed';
import { createTranscriptFormat } from './format';
import { MEDIA_EXTENSIONS, findMedia } from './media';
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

	transcriptViews(): TranscriptView[] {
		return this.views().filter((v): v is TranscriptView => v instanceof TranscriptView);
	}

	protected override async onLoaded(): Promise<void> {
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
						for (const view of this.transcriptViews()) view.loadPlayer();
						refresh();
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
}
