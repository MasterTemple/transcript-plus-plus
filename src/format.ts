import type { FileFormat } from 'file-plus-plus/obsidian';
import { TRANSCRIPT_SCHEMES, TranscriptReader } from './reader';
import { formatClock, parseTimeLocator } from './time';
import { parseSubtitles, type Transcript } from './transcript';

/** Subtitle / transcript files for file-plus-plus. More formats only need a parser to `Transcript`. */
export const createTranscriptFormat = (settings: () => { sectionMinutes: number }): FileFormat<Transcript, TranscriptReader> => ({
	name: 'Transcript',
	noun: 'transcript',
	extensions: ['srt', 'vtt'],
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
