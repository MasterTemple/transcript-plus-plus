import { safeDecode, splitTextDirective, withTextDirective, type LocatorScheme } from 'file-plus-plus/core';

/**
 * Times in links are seconds: `t=109s-300.7s` (a passage: the cues from 109 s through 300.7 s) or
 * `t=109s` (a position). Never the subtitle style `00:01:49,312`, which is noisy in links.
 *
 * A passage that isn't whole cues adds a text fragment for the exact words, the way a URL adds one to
 * its fragment: `t=109s-120.5s:~:text=the%20whale`. The time is for playing and ordering; the words,
 * searched within those cues, for the highlight.
 *
 * Also understood when parsing: Media Fragments (`t=109,300.7`, `t=npt:1:49`), clock times
 * (`1:49`, `1:01:49.5`), and cue ids: `cue=12`, `cue=12-14`.
 */
export interface TimeLocator {
	start: number;
	/** null: a position, not a passage. */
	end: number | null;
	/** The exact words: a text-fragment directive (`:~:text=…`) searched within the cues. */
	text?: string;
}

/** Seconds from `109`, `109s`, `109.5s`, `1:49`, `01:49.5`, `1:01:49`, `00:01:49,312`, `npt:…`. */
export function parseTime(input: string): number | null {
	const s = input.trim().replace(/^npt:/i, '').replace(',', '.');
	if (!s) return null;
	let m = /^(\d+(?:\.\d+)?)s?$/.exec(s);
	if (m) return Number(m[1]);
	m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/.exec(s);
	if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
	return null;
}

/** `109s`, `300.7s` (milliseconds at most). */
export function formatSeconds(t: number): string {
	return `${Math.round(Math.max(0, t) * 1000) / 1000}s`;
}

/** For people: `1:49`, `1:01:49`. */
export function formatClock(t: number): string {
	const total = Math.max(0, Math.floor(t));
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const sec = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function formatTimeLocator(loc: TimeLocator): string {
	return withTextDirective(`t=${formatSeconds(loc.start)}${loc.end === null ? '' : `-${formatSeconds(loc.end)}`}`, loc.text);
}

/** `t=…` (as written in a link, maybe percent-encoded) → start, end and words, or null. */
export function parseTimeLocator(locator: string): TimeLocator | null {
	const m = /^t=([^&]*)$/.exec(locator);
	if (!m) return null;
	// The text directive stays encoded (it is a text fragment); the time may have been encoded (`%3A`).
	const split = splitTextDirective(m[1]);
	const text = split.text ?? undefined;
	const value = safeDecode(split.base);
	// Media Fragments use a comma; ours a dash (which clock times never contain).
	const [a, b] = value.includes(',') ? value.split(',', 2) : value.split('-', 2);
	const start = a === '' ? 0 : parseTime(a);
	const end = b === undefined || b === '' ? null : parseTime(b);
	if (start === null || (b !== undefined && b !== '' && end === null)) return null;
	if (end !== null && end < start) return null;
	if (text !== undefined && !/^:~:text=./.test(text)) return null;
	return text ? { start, end, text } : { start, end };
}

export const timeScheme: LocatorScheme = {
	id: 'time',
	match(s) {
		const m = /^t=[^&]*/.exec(s);
		if (!m) return null;
		const loc = parseTimeLocator(m[0]);
		return loc ? { locator: formatTimeLocator(loc), rest: s.slice(m[0].length) } : null;
	},
	isRange: (locator) => {
		const t = parseTimeLocator(locator);
		return !!t && (t.end !== null || !!t.text);
	},
};

/** `cue=12` or `cue=12-14`: cues by their id in the file (SRT numbers, WebVTT identifiers). */
export const cueScheme: LocatorScheme = {
	id: 'cue',
	match(s) {
		const m = /^cue=[^&]+/.exec(s);
		return m ? { locator: safeDecode(m[0]), rest: s.slice(m[0].length) } : null;
	},
	isRange: () => true,
};

/** The first and last cue id of a `cue=` locator. */
export function parseCueLocator(locator: string): { from: string; to: string } | null {
	const m = /^cue=(.+)$/.exec(locator);
	if (!m) return null;
	const range = /^(\d+)-(\d+)$/.exec(m[1]);
	return range ? { from: range[1], to: range[2] } : { from: m[1], to: m[1] };
}
