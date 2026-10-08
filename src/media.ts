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
 * The audio or video file of a transcript:
 * 1. one the user chose for it (`overrides`, path → media path);
 * 2. the first pattern that matches. A pattern with a `/` is a path (without extension, or with one);
 *    a bare name matches files with that name anywhere, preferring the transcript's folder, then the
 *    shortest path. Each pattern is tried with the transcript's name, then without a language suffix.
 */
export function findMedia(app: App, transcript: TFile, patterns: string[], overrides: Record<string, string>): TFile | null {
	const chosen = overrides[transcript.path];
	if (chosen) {
		const f = app.vault.getFileByPath(chosen);
		if (f) return f;
	}
	const folder = transcript.parent?.path === '/' ? '' : (transcript.parent?.path ?? '');
	const names = [transcript.basename, withoutLanguage(transcript.basename)].filter((n): n is string => !!n);
	let all: TFile[] | null = null;
	for (const pattern of patterns) {
		for (const name of names) {
			const target = renderPattern(pattern.trim(), { folder, name });
			if (!target) continue;
			if (target.includes('/')) {
				const path = target.replace(/\/{2,}/g, '/').replace(/\/$/, '');
				const ext = path.split('.').pop()!.toLowerCase();
				const exact = MEDIA_EXTENSIONS.includes(ext) ? app.vault.getFileByPath(path) : null;
				if (exact) return exact;
				for (const e of MEDIA_EXTENSIONS) {
					const f = app.vault.getFileByPath(`${path}.${e}`);
					if (f) return f;
				}
			} else {
				all ??= app.vault.getFiles().filter((f) => MEDIA_EXTENSIONS.includes(f.extension.toLowerCase()));
				const hits = all.filter((f) => f.basename === target);
				if (hits.length) return hits.sort((a, b) => Number(b.parent?.path === transcript.parent?.path) - Number(a.parent?.path === transcript.parent?.path) || a.path.length - b.path.length)[0];
			}
		}
	}
	return null;
}
