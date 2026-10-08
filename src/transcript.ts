/** A transcript: timed cues, parsed from SRT or WebVTT (more formats can produce the same shape). */
export interface Cue {
	/** Position in the file, from 0. */
	index: number;
	/** The cue's identifier in the file (the SRT number, a WebVTT id), or its position from 1. */
	id: string;
	/** Seconds. */
	start: number;
	end: number;
	/** The speaker (WebVTT `<v Name>`), if any. */
	speaker: string | null;
	/** The cue text with simple markup kept: `<i>`, `<b>`, `<u>` (everything else is dropped when rendering). */
	text: string;
}

export interface Transcript {
	cues: Cue[];
	/** End of the last cue. */
	duration: number;
}

/** Seconds from `00:01:49,312` (SRT), `00:01:49.312` or `01:49.312` (WebVTT). */
export function parseTimestamp(s: string): number | null {
	const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/.exec(s.trim());
	if (!m) return null;
	return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number((m[4] ?? '0').padEnd(3, '0')) / 1000;
}

/** Parse SRT or WebVTT (detected by the `WEBVTT` header). Malformed blocks are skipped. */
export function parseSubtitles(input: string): Transcript {
	const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
	const vtt = /^WEBVTT\b/.test(text);
	const cues: Cue[] = [];
	for (const block of text.split(/\n[ \t]*\n/)) {
		const lines = block.split('\n').filter((l) => l.trim());
		if (!lines.length) continue;
		if (vtt && /^(WEBVTT|NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
		const t = lines.findIndex((l) => l.includes('-->'));
		if (t === -1) continue;
		const timing = /^\s*(\S+)\s+-->\s+(\S+)/.exec(lines[t]);
		const start = timing && parseTimestamp(timing[1]);
		const end = timing && parseTimestamp(timing[2]);
		if (start == null || end == null) continue;
		let body = lines.slice(t + 1).join('\n').trim();
		let speaker: string | null = null;
		const voice = /^<v(?:\.[^\s>]*)?\s+([^>]+)>/.exec(body);
		if (voice) speaker = voice[1].trim();
		// WebVTT inline timestamps and closing voice tags carry nothing to show.
		body = body.replace(/<\d[\d:.]*>/g, '');
		const id = lines.slice(0, t).join(' ').trim() || String(cues.length + 1);
		cues.push({ index: cues.length, id, start, end: Math.max(start, end), speaker, text: body });
	}
	cues.sort((a, b) => a.start - b.start || a.index - b.index).forEach((c, i) => (c.index = i));
	return { cues, duration: cues.reduce((m, c) => Math.max(m, c.end), 0) };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'", lrm: '‎', rlm: '‏' };

/**
 * Append a cue's text to an element: `<i>`, `<b>`, `<u>` become elements, other tags are dropped,
 * entities decoded, line breaks become spaces. Never uses innerHTML.
 */
/** A cue's text as the reader shows it, without markup (for searching it without rendering). */
export function cuePlainText(text: string): string {
	return text.replace(/\n+/g, ' ').replace(/<[^>]*>/g, '');
}

export function appendCueText(parent: HTMLElement, text: string): void {
	const doc = parent.ownerDocument;
	const stack: HTMLElement[] = [parent];
	for (const token of text.replace(/\n+/g, ' ').split(/(<[^>]*>)/)) {
		if (!token) continue;
		const tag = /^<(\/)?([a-z]+)[^>]*>$/i.exec(token);
		if (tag) {
			const name = tag[2].toLowerCase();
			if (!['i', 'b', 'u'].includes(name)) continue;
			if (tag[1]) {
				if (stack.length > 1 && stack[stack.length - 1].localName === { i: 'em', b: 'strong', u: 'u' }[name]) stack.pop();
			} else {
				const el = doc.createElement(name === 'i' ? 'em' : name === 'b' ? 'strong' : 'u');
				stack[stack.length - 1].appendChild(el);
				stack.push(el);
			}
			continue;
		}
		if (token.startsWith('<')) continue;
		const decoded = token.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
			if (e[0] === '#') {
				const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
				return Number.isFinite(n) ? String.fromCodePoint(n) : m;
			}
			return ENTITIES[e.toLowerCase()] ?? m;
		});
		stack[stack.length - 1].appendChild(doc.createTextNode(decoded));
	}
}
