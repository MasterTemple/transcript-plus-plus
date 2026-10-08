import { DocumentReader, PREFIX, textFragmentScheme, type LocatorScheme, type ParsedLocator, type ReaderOptions, type TocItem } from 'file-plus-plus/core';
import { cueScheme, formatClock, formatTimeLocator, parseCueLocator, parseTimeLocator, timeScheme } from './time';
import { appendCueText, type Cue, type Transcript } from './transcript';

export const TRANSCRIPT_SCHEMES: LocatorScheme[] = [timeScheme, cueScheme, textFragmentScheme];

export interface TranscriptReaderOptions extends ReaderOptions {
	/** Length of a section (and table-of-contents entry) in minutes; transcripts up to twice that have one. */
	sectionMinutes?: number;
}

/** A paragraph starts after a pause this long (seconds), or when the speaker changes. */
const PARAGRAPH_GAP = 2;
/** …or after a sentence once the paragraph is this long (characters). */
const PARAGRAPH_LENGTH = 400;

/**
 * Renders a transcript as flowing paragraphs of cues (each cue a `span[data-cue]`), with the start
 * time (and speaker) above each paragraph. Locators are times: a passage is the cues it covers.
 */
export class TranscriptReader extends DocumentReader {
	readonly schemes = TRANSCRIPT_SCHEMES;
	private cueEls: HTMLElement[] = [];
	private _toc: TocItem[] = [];
	private readonly sectionSeconds: number;
	private playing: HTMLElement | null = null;

	constructor(
		host: HTMLElement,
		readonly transcript: Transcript,
		opts: TranscriptReaderOptions = {},
	) {
		super(host, opts);
		this.sectionSeconds = (opts.sectionMinutes ?? 5) * 60;
	}

	get toc(): TocItem[] {
		return this._toc;
	}

	protected override extraCss(): string {
		return /* css */ `
@layer ${PREFIX}-base {
	.tpp-para { margin: 0 0 1.1em; }
	.tpp-para::before {
		content: attr(data-label);
		display: block;
		font-size: 0.72em;
		font-family: var(--font-interface, system-ui, sans-serif);
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
		opacity: 0.6;
		margin-bottom: 0.15em;
		cursor: pointer;
		-webkit-user-select: none;
		user-select: none;
	}
	.tpp-cue.tpp-playing {
		background-color: color-mix(in srgb, var(--interactive-accent, #7c5cff) 22%, transparent);
		border-radius: 3px;
		box-decoration-break: clone;
		-webkit-box-decoration-break: clone;
	}
	.${PREFIX}-section + .${PREFIX}-section { margin-top: 1.5em; }
}
`;
	}

	// ---------------------------------------------------------------------------------------------
	// Rendering
	// ---------------------------------------------------------------------------------------------

	protected async renderContent(): Promise<void> {
		const { cues, duration } = this.transcript;
		const single = duration <= this.sectionSeconds * 2;
		const frag = this.doc.createDocumentFragment();
		let section: { index: number; wrapper: HTMLElement; body: HTMLElement } | null = null;
		let para: HTMLElement | null = null;
		let paraLength = 0;
		let prev: Cue | null = null;
		const newSection = (start: number) => {
			const index = single ? 0 : Math.floor(start / this.sectionSeconds);
			const wrapper = this.doc.createElement('div');
			const body = this.doc.createElement('div');
			wrapper.appendChild(body);
			section = { index, wrapper, body };
			this.addSection(section);
			frag.appendChild(wrapper);
			if (!single) {
				const t = index * this.sectionSeconds;
				this._toc.push({ id: `t-${index}`, label: formatClock(t), href: formatTimeLocator({ start: t, end: null }), children: [], depth: 0 });
			}
			para = null;
		};
		for (const cue of cues) {
			const sectionIndex = single ? 0 : Math.floor(cue.start / this.sectionSeconds);
			if (!section || (section as { index: number }).index !== sectionIndex) newSection(cue.start);
			const breakPara =
				!para ||
				!prev ||
				cue.speaker !== prev.speaker ||
				cue.start - prev.end >= PARAGRAPH_GAP ||
				(paraLength > PARAGRAPH_LENGTH && /[.?!…]["'”’)]*$/.test(prev.text.trim()));
			if (breakPara) {
				para = this.doc.createElement('p');
				para.className = 'tpp-para';
				para.dataset.start = String(cue.start);
				para.dataset.label = cue.speaker ? `${cue.speaker} · ${formatClock(cue.start)}` : formatClock(cue.start);
				section!.body.appendChild(para);
				paraLength = 0;
			} else para!.appendChild(this.doc.createTextNode(' '));
			const span = this.doc.createElement('span');
			span.className = 'tpp-cue';
			span.dataset.cue = String(cue.index);
			appendCueText(span, cue.text.replace(/^<v(?:\.[^\s>]*)?\s+[^>]+>/, ''));
			para!.appendChild(span);
			this.cueEls[cue.index] = span;
			paraLength += cue.text.length;
			prev = cue;
		}
		this.content.appendChild(frag);
	}

	// ---------------------------------------------------------------------------------------------
	// Locators
	// ---------------------------------------------------------------------------------------------

	protected resolveLocator(loc: ParsedLocator): Range | null {
		let first: number;
		let last: number;
		if (loc.scheme === 'time') {
			const t = parseTimeLocator(loc.locator!);
			if (!t) return null;
			const span = this.cueSpan(t.start, t.end);
			if (!span) return null;
			[first, last] = span;
		} else if (loc.scheme === 'cue') {
			const c = parseCueLocator(loc.locator!);
			const cues = this.transcript.cues;
			first = cues.findIndex((x) => x.id === c?.from);
			last = cues.findIndex((x) => x.id === c?.to);
			if (first === -1 || last < first) return null;
		} else return null;
		const a = this.cueEls[first];
		const b = this.cueEls[last];
		if (!a || !b) return null;
		const range = this.doc.createRange();
		range.setStart(a, 0);
		if (loc.scheme === 'time' && parseTimeLocator(loc.locator!)?.end === null) range.collapse(true);
		else range.setEnd(b, b.childNodes.length);
		return range;
	}

	/**
	 * The cues a time span covers: from the last cue starting at or before `start` (the first cue when
	 * none does) through the first one ending at or after `end`. A position (`end` null) is one cue.
	 */
	cueSpan(start: number, end: number | null): [number, number] | null {
		const cues = this.transcript.cues;
		if (!cues.length) return null;
		const eps = 0.0005;
		let first = 0;
		for (let i = 0; i < cues.length && cues[i].start <= start + eps; i++) first = i;
		if (end === null) return [first, first];
		let last = first;
		while (last < cues.length - 1 && cues[last].end < end - eps && cues[last + 1].start < end - eps) last++;
		return [first, last];
	}

	/** The cue at a time (the last one starting at or before it), or null before the first. */
	cueAt(time: number): Cue | null {
		const cues = this.transcript.cues;
		let lo = 0;
		let hi = cues.length - 1;
		let found = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (cues[mid].start <= time) {
				found = mid;
				lo = mid + 1;
			} else hi = mid - 1;
		}
		return found === -1 ? null : cues[found];
	}

	locatorFromRange(range: Range): string | null {
		const a = this.cueOfPoint(range.startContainer, range.startOffset, 'after');
		if (!a) return null;
		if (range.collapsed) return formatTimeLocator({ start: a.start, end: null });
		const b = this.cueOfPoint(range.endContainer, range.endOffset, 'before') ?? a;
		return formatTimeLocator({ start: a.start, end: Math.max(a.end, b.end) });
	}

	/** The cues a range touches. */
	cuesOf(range: Range): Cue[] {
		const a = this.cueOfPoint(range.startContainer, range.startOffset, 'after');
		const b = range.collapsed ? a : this.cueOfPoint(range.endContainer, range.endOffset, 'before');
		if (!a || !b || b.index < a.index) return a ? [a] : [];
		return this.transcript.cues.slice(a.index, b.index + 1);
	}

	/** The cue containing a DOM point, else the nearest one after (or before) it. */
	private cueOfPoint(node: Node, offset: number, prefer: 'after' | 'before'): Cue | null {
		const el = (node.nodeType === 1 ? (node as Element) : node.parentElement)?.closest('[data-cue]');
		if (el && this.content.contains(el)) return this.transcript.cues[Number((el as HTMLElement).dataset.cue)] ?? null;
		const point = this.doc.createRange();
		point.setStart(node, offset);
		// First cue element after the point (binary search over cues in document order).
		let lo = 0;
		let hi = this.cueEls.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (point.comparePoint(this.cueEls[mid], 0) > 0) hi = mid;
			else lo = mid + 1;
		}
		const i = prefer === 'after' ? lo : lo - 1;
		const cues = this.transcript.cues;
		return cues[Math.min(Math.max(i, 0), cues.length - 1)] ?? null;
	}

	/** The element of a cue. */
	cueElement(index: number): HTMLElement | null {
		return this.cueEls[index] ?? null;
	}

	// ---------------------------------------------------------------------------------------------
	// Playback
	// ---------------------------------------------------------------------------------------------

	/** Mark the cue being played (null: none). Returns its element when it changed. */
	setPlaying(cue: Cue | null): HTMLElement | null {
		const el = cue ? this.cueEls[cue.index] : null;
		if (el === this.playing) return null;
		this.playing?.classList.remove('tpp-playing');
		el?.classList.add('tpp-playing');
		this.playing = el;
		return el;
	}

	/** The start time of the paragraph whose time label is under a click, or null. */
	labelTimeAt(e: MouseEvent): number | null {
		// The label is the paragraph's ::before, so a click on it targets the paragraph itself.
		const p = e.composedPath()[0] as HTMLElement | undefined;
		if (!p?.classList?.contains('tpp-para') || !this.content.contains(p)) return null;
		const first = p.querySelector('.tpp-cue');
		if (first && e.clientY >= first.getBoundingClientRect().top) return null;
		return Number(p.dataset.start);
	}
}
