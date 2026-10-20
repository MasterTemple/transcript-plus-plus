import { describe, expect, test } from 'bun:test';
import { TranscriptReader } from '../src/reader';
import { parseSubtitles } from '../src/transcript';

const srt = [
	[0.3, 1.7, 'Call me Ishmael.'],
	[2.3, 8.3, 'Some years ago, never mind how long precisely,'],
	[8.9, 11.9, 'having little or no money in my purse.'],
	[20, 22, 'After a pause, a new paragraph.'],
	[400, 402, 'Much later: another section.'],
	[700, 703, 'The end.'],
]
	.map(([a, b, t], i) => `${i + 1}\n00:${String(Math.floor((a as number) / 60)).padStart(2, '0')}:${((a as number) % 60).toFixed(3).padStart(6, '0').replace('.', ',')} --> 00:${String(Math.floor((b as number) / 60)).padStart(2, '0')}:${((b as number) % 60).toFixed(3).padStart(6, '0').replace('.', ',')}\n${t}\n`)
	.join('\n');

async function reader(sectionMinutes = 5) {
	document.body.innerHTML = '<div id="host"></div>';
	const r = new TranscriptReader(document.getElementById('host')!, parseSubtitles(srt), { sectionMinutes });
	await r.render();
	return r;
}

describe('transcript reader', () => {
	test('paragraphs on pauses, sections and contents by time', async () => {
		const r = await reader();
		const paras = [...r.content.querySelectorAll('.tpp-para')] as HTMLElement[];
		expect(paras.map((p) => p.dataset.label)).toEqual(['0:00', '0:20', '6:40', '11:40']);
		expect(paras[0].textContent).toBe('Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse.');
		expect(r.toc.map((t) => [t.label, t.href])).toEqual([
			['0:00', 't=0s'],
			['5:00', 't=300s'],
			['10:00', 't=600s'],
		]);
		expect(r.tocItemAt(r.resolve('t=401s')!)?.label).toBe('5:00');
	});

	test('passages resolve to whole cues and round-trip', async () => {
		const r = await reader();
		const range = r.resolve('t=2.3s-11.9s')!;
		expect(range.toString()).toBe('Some years ago, never mind how long precisely, having little or no money in my purse.');
		expect(r.locatorFromRange(range)).toBe('t=2.3s-11.9s');
		// A time inside a cue covers that cue; a selection inside one cue covers it all.
		expect(r.resolve('t=3s-4s')!.toString()).toBe('Some years ago, never mind how long precisely,');
		const words = r.resolve(':~:text=never%20mind')!;
		expect(words.toString()).toBe('never mind');
		// Part of a cue: the time (for playing) plus the words (for the highlight).
		const partial = r.locatorFromRange(words)!;
		expect(partial).toBe('t=2.3s-8.3s:~:text=never%20mind');
		expect(r.resolve(partial)!.toString()).toBe('never mind');
		expect(r.isRangeLocator(partial)).toBe(true);
		expect(r.resolve('cue=1-2')!.toString()).toBe('Call me Ishmael. Some years ago, never mind how long precisely,');
	});

	test('partial selections across cues; words are found within the cues', async () => {
		const r = await reader();
		const range = r.resolve('t=0.3s-8.3s')!;
		const text = r.textIndex.text;
		const s = text.indexOf('me Ishmael');
		const e = text.indexOf('how long') + 'how long'.length;
		const sel = r.textIndex.toRange(s, e);
		const loc = r.locatorFromRange(sel)!;
		expect(loc.startsWith('t=0.3s-8.3s:~:text=')).toBe(true);
		expect(r.resolve(loc)!.toString()).toBe('me Ishmael. Some years ago, never mind how long');
		expect(range.toString()).toBe('Call me Ishmael. Some years ago, never mind how long precisely,');
		// Words that aren't in those cues: the cues are highlighted.
		expect(r.resolve('t=20s-22s:~:text=Ishmael')!.toString()).toBe('After a pause, a new paragraph.');
	});

	test('positions are collapsed; the cue at a time', async () => {
		const r = await reader();
		const p = r.resolve('t=21s')!;
		expect(p.collapsed).toBe(true);
		expect(r.isRangeLocator('t=21s')).toBe(false);
		expect(r.locatorFromRange(p)).toBe('t=20s');
		expect(r.cueAt(9)?.id).toBe('3');
		expect(r.cueAt(0.1)).toBeNull();
	});

	test('search and selection info', async () => {
		const r = await reader();
		expect(r.search('pause').map((m) => m.sectionIndex)).toEqual([0]);
		const info = r.describeRange(r.resolve('t=400s-402s')!)!;
		expect(info.locator).toBe('t=400s-402s');
		expect(info.text).toBe('Much later: another section.');
		expect(info.tocItem?.label).toBe('5:00');
	});
});

describe('extracted text', () => {
	test('offsets in the cues become time locators with the exact words, which resolve', async () => {
		const { createTranscriptFormat } = await import('../src/format');
		const format = createTranscriptFormat(() => ({ sectionMinutes: 5 }));
		const app = { vault: { cachedRead: async () => srt } } as any;
		const extracted = await format.extractText!(app, {} as any);
		const text = extracted.sections[0].text;
		expect(text.startsWith('Call me Ishmael. Some years ago,')).toBe(true);
		const s = text.indexOf('never mind');
		const loc = extracted.locator(0, s, s + 'never mind'.length)!;
		expect(loc).toBe('t=2.3s-8.3s:~:text=never%20mind');
		const r = await reader();
		expect(r.resolve(loc)!.toString()).toBe('never mind');
		// Across cues
		const across = extracted.locator(0, text.indexOf('Ishmael'), text.indexOf('Some') + 4)!;
		expect(r.resolve(across)!.toString()).toBe('Ishmael. Some');
	});
});

describe('cue plain text', () => {
	test('decodes entities as the reader shows them', async () => {
		const { cuePlainText } = await import('../src/transcript');
		expect(cuePlainText('<i>John&nbsp;3:16</i>\nand&#32;Romans 8:28&amp;29 &bogus; &#x110000;')).toBe('John\u00a03:16 and Romans 8:28&29 &bogus; &#x110000;');
	});
});
