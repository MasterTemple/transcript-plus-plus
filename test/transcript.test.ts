import { describe, expect, test } from 'bun:test';
import { appendCueText, parseSubtitles, parseTimestamp } from '../src/transcript';
import { MEDIA_EXTENSIONS, renderPattern, withoutLanguage } from '../src/media';

const srt = `﻿1\r\n00:00:01,000 --> 00:00:02,500\r\nCall me <i>Ishmael</i>.\r\n\r\n2\r\n00:00:03,000 --> 00:00:05,000\r\nSome years ago,\r\nnever mind how long\r\n\r\n\r\n3\r\n00:00:05,000 --> 00:00:06,000\r\nprecisely &amp; so on\r\n`;

const vtt = `WEBVTT - talk

NOTE a comment
spanning lines

STYLE
::cue { color: red }

intro
00:01.000 --> 00:02.000 align:start
<v.loud Ada Lovelace>Hello <00:01.500>there</v>

00:02.500 --> 00:04.000
<v Bert>Hi.
`;

describe('subtitles', () => {
	test('timestamps', () => {
		expect(parseTimestamp('00:01:49,312')).toBeCloseTo(109.312);
		expect(parseTimestamp('01:49.3')).toBeCloseTo(109.3);
		expect(parseTimestamp('1:02:03')).toBe(3723);
	});

	test('SRT', () => {
		const t = parseSubtitles(srt);
		expect(t.cues.map((c) => [c.id, c.start, c.end])).toEqual([
			['1', 1, 2.5],
			['2', 3, 5],
			['3', 5, 6],
		]);
		expect(t.cues[1].text).toBe('Some years ago,\nnever mind how long');
		expect(t.duration).toBe(6);
	});

	test('WebVTT: header, notes, styles, ids, settings, voices, inline timestamps', () => {
		const t = parseSubtitles(vtt);
		expect(t.cues.map((c) => [c.id, c.start, c.end, c.speaker])).toEqual([
			['intro', 1, 2, 'Ada Lovelace'],
			['2', 2.5, 4, 'Bert'],
		]);
		expect(t.cues[0].text).toBe('<v.loud Ada Lovelace>Hello there</v>');
	});

	test('cue text becomes safe DOM', () => {
		const el = document.createElement('span');
		appendCueText(el, 'Call <i>me <b>Ish</b></i>mael <script>x</script>&amp; <img src=x onerror=alert(1)>a\nb');
		expect(el.innerHTML).toBe('Call <em>me <strong>Ish</strong></em>mael x&amp; a b');
	});
});

describe('media lookup', () => {
	test('language suffixes and patterns', () => {
		expect(withoutLanguage('talk.en')).toBe('talk');
		expect(withoutLanguage('talk.pt-BR')).toBe('talk');
		expect(withoutLanguage('2026-02-05 18.49.11')).toBeNull();
		expect(renderPattern('{{folder}}/{{name}}', { folder: 'Voice Memos', name: 'a' })).toBe('Voice Memos/a');
		expect(renderPattern('{{folder}}/{{name}}', { folder: '', name: 'a' })).toBe('a');
		expect(MEDIA_EXTENSIONS).toContain('webm');
	});
});
