import type { App, TFile } from 'obsidian';

export const MEDIA_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'oga', 'opus', 'flac', 'webm', 'mp4', 'm4v', 'mov', 'mkv', 'ogv'];

/** `talk.en` → `talk`; `2026-02-05 18.49.11` stays (a language suffix is letters). */
export function withoutLanguage(basename: string): string | null {
	const m = /^(.+)\.([a-z]{2,3}(?:[-_][A-Za-z]{2,4})?)$/.exec(basename);
	return m ? m[1] : null;
}

/** Fill a media pattern: `{{folder}}` (the transcript's folder), `{{name}}` (its name without extension or language). */
export function renderPattern(pattern: string, vars: { folder: string; name: string }): string {
	return pattern.replace(/\{\{(folder|name)\}\}/g, (_, k: 'folder' | 'name') => vars[k]).replace(/^\/+/, '');
}

/**
 * The audio or video files of a transcript, best first:
 * 1. one the user chose for it (`overrides`, path → media path);
 * 2. the files of the first pattern that matches. A pattern with a `/` is a path (without extension:
 *    every media extension that exists; or with one); a bare name matches files with that name in the
 *    transcript's folder, else anywhere (shortest path first). Each pattern is tried with the
 *    transcript's name, then without a language suffix.
 * Several files are alternatives, e.g. `talk.mp3` and `talk.mp4`.
 */
export function findAllMedia(app: App, transcript: TFile, patterns: string[], overrides: Record<string, string>, first = false): TFile[] {
	const found: TFile[] = [];
	const chosen = overrides[transcript.path];
	const chosenFile = chosen ? app.vault.getFileByPath(chosen) : null;
	if (chosenFile) {
		found.push(chosenFile);
		if (first) return found;
	}
	const add = (files: TFile[]) => {
		for (const f of files) if (!found.includes(f)) found.push(f);
		return found;
	};
	const folder = transcript.parent?.path === '/' ? '' : (transcript.parent?.path ?? '');
	const names = [transcript.basename, withoutLanguage(transcript.basename)].filter((n): n is string => !!n);
	let all: TFile[] | null = null;
	for (const pattern of patterns) {
		for (const name of names) {
			const target = renderPattern(pattern.trim(), { folder, name });
			if (!target) continue;
			let hits: TFile[];
			if (target.includes('/')) {
				const path = target.replace(/\/{2,}/g, '/').replace(/\/$/, '');
				const ext = path.split('.').pop()!.toLowerCase();
				const exact = MEDIA_EXTENSIONS.includes(ext) ? app.vault.getFileByPath(path) : null;
				hits = exact ? [exact] : MEDIA_EXTENSIONS.map((e) => app.vault.getFileByPath(`${path}.${e}`)).filter((f): f is TFile => !!f);
			} else {
				all ??= app.vault.getFiles().filter((f) => MEDIA_EXTENSIONS.includes(f.extension.toLowerCase()));
				hits = all.filter((f) => f.basename === target);
				const near = hits.filter((f) => f.parent?.path === transcript.parent?.path);
				hits = (near.length ? near : hits).sort((a, b) => a.path.length - b.path.length);
			}
			if (hits.length) return add(first ? hits.slice(0, 1) : hits);
		}
	}
	return found;
}

/** The audio or video file of a transcript (the first of `findAllMedia`), or null. */
export function findMedia(app: App, transcript: TFile, patterns: string[], overrides: Record<string, string>): TFile | null {
	return findAllMedia(app, transcript, patterns, overrides, true)[0] ?? null;
}

/**
 * The transcript of a media file: one whose media (`findAllMedia`) includes it. Candidates are the
 * transcripts named like it (`talk.srt`, `talk.en.vtt`) and those it was chosen for; the one in its
 * folder first, then by shortest path.
 */
export function findTranscript(app: App, media: TFile, extensions: string[], patterns: string[], overrides: Record<string, string>): TFile | null {
	const chosen = new Set(Object.entries(overrides).filter(([, m]) => m === media.path).map(([t]) => t));
	const candidates = app.vault
		.getFiles()
		.filter((f) => extensions.includes(f.extension.toLowerCase()) && (chosen.has(f.path) || f.basename === media.basename || withoutLanguage(f.basename) === media.basename))
		.sort((a, b) => Number(b.parent === media.parent) - Number(a.parent === media.parent) || a.path.length - b.path.length);
	return candidates.find((t) => findAllMedia(app, t, patterns, overrides).includes(media)) ?? null;
}
