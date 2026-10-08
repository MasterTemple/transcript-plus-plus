import { serializeTextFragment } from 'file-plus-plus/core';
import type { FileFormat } from 'file-plus-plus/obsidian';
import { TRANSCRIPT_SCHEMES, TranscriptReader } from './reader';
import { formatClock, formatTimeLocator, parseTimeLocator } from './time';
import { cuePlainText, parseSubtitles, type Transcript } from './transcript';

/** Subtitle / transcript files for file-plus-plus. More formats only need a parser to `Transcript`. */
export const createTranscriptFormat = (settings: () => { sectionMinutes: number }): FileFormat<Transcript, TranscriptReader> => ({
	name: 'Transcript',
	noun: 'transcript',
	extensions: ['srt', 'vtt'],
	plainText: true,
	icon: 'captions',
	frontmatterKey: 'transcript',
	schemes: TRANSCRIPT_SCHEMES,
	linkTypeName: 'Timestamp',
	linkTypeDescription: 'Timestamp links (t=109s-300.7s) cover whole cues and keep working when the text is corrected. Text fragment links point at the exact words.',
	position: {
		key: (locator: string) => parseTimeLocator(locator)?.start ?? null,
		compare: (a: number, b: number) => a - b,
	},
	load: async (app, file) => parseSubtitles(await app.vault.cachedRead(file)),
	// One section: the cues' text, joined by spaces as the reader shows them. A range is its cues (by
	// time) plus the exact words, which resolve within them.
	extractText: async (app, file) => {
		const { cues } = parseSubtitles(await app.vault.cachedRead(file));
		const starts: number[] = [];
		let text = '';
		for (const cue of cues) {
			if (text) text += ' ';
			starts.push(text.length);
			text += cuePlainText(cue.text);
		}
		const cueAt = (offset: number) => Math.max(0, starts.findLastIndex((s) => s <= offset));
		return {
			sections: [{ index: 0, title: null, text }],
			locator: (_section, start, end) => {
				if (!cues.length || end <= start) return null;
				const a = cues[cueAt(start)];
				const b = cues[cueAt(end - 1)];
				return formatTimeLocator({ start: a.start, end: Math.max(a.end, b.end), text: serializeTextFragment({ start: text.slice(start, end) }) });
			},
		};
	},
	unload: () => {},
	info: (_doc, file) => ({ title: file.basename, author: '' }),
	createReader: (host, doc, opts) => new TranscriptReader(host, doc, { ...opts, sectionMinutes: settings().sectionMinutes }),
	templateVars: (info) => {
		const t = parseTimeLocator(info.locator);
		return { time: t ? formatClock(t.start) : '', start: t ? String(t.start) : '', end: t?.end != null ? String(t.end) : '' };
	},
	extraTemplateVars: '{{time}} (start, as 1:49), {{start}}, {{end}} (seconds)',
	appearance: { hidden: ['dimImages'], publisherName: null },
});
