import { describe, expect, test } from 'bun:test';
import type { App, TFile } from 'obsidian';
import { findAllMedia, findMedia, findTranscript } from '../src/media';

/** A vault of paths (folders are parents shared by path). */
function vault(paths: string[]): { app: App; file: (path: string) => TFile } {
	const folders = new Map<string, { path: string }>();
	const files = paths.map((path) => {
		const slash = path.lastIndexOf('/');
		const folder = slash === -1 ? '/' : path.slice(0, slash);
		if (!folders.has(folder)) folders.set(folder, { path: folder });
		const name = path.slice(slash + 1);
		const dot = name.lastIndexOf('.');
		return { path, name, basename: name.slice(0, dot), extension: name.slice(dot + 1), parent: folders.get(folder) } as unknown as TFile;
	});
	const byPath = (p: string) => files.find((f) => f.path === p) ?? null;
	const app = { vault: { getFiles: () => files, getFileByPath: byPath } } as unknown as App;
	return { app, file: (p) => byPath(p)! };
}

const PATTERNS = ['{{folder}}/{{name}}', '{{name}}'];

describe('media of a transcript', () => {
	const { app, file } = vault(['talks/a.srt', 'talks/a.mp3', 'talks/a.mp4', 'talks/b.en.vtt', 'media/b.webm', 'other/b.webm', 'x/c.srt', 'x/chosen.m4a']);

	test('every file of the recording, best first', () => {
		expect(findAllMedia(app, file('talks/a.srt'), PATTERNS, {}).map((f) => f.path)).toEqual(['talks/a.mp3', 'talks/a.mp4']);
		expect(findMedia(app, file('talks/a.srt'), PATTERNS, {})?.path).toBe('talks/a.mp3');
	});

	test('a bare name anywhere (shortest path), without the language suffix', () => {
		expect(findAllMedia(app, file('talks/b.en.vtt'), PATTERNS, {}).map((f) => f.path)).toEqual(['media/b.webm', 'other/b.webm']);
	});

	test('chosen media first', () => {
		expect(findAllMedia(app, file('talks/a.srt'), PATTERNS, { 'talks/a.srt': 'talks/a.mp4' }).map((f) => f.path)).toEqual(['talks/a.mp4', 'talks/a.mp3']);
		expect(findMedia(app, file('x/c.srt'), PATTERNS, { 'x/c.srt': 'x/chosen.m4a' })?.path).toBe('x/chosen.m4a');
	});
});

describe('transcript of a media file', () => {
	const { app, file } = vault(['talks/a.srt', 'talks/a.mp3', 'talks/a.mp4', 'talks/b.en.vtt', 'talks/b.webm', 'x/c.srt', 'x/chosen.m4a', 'lone.mp4']);
	const find = (path: string, overrides: Record<string, string> = {}) => findTranscript(app, file(path), ['srt', 'vtt'], PATTERNS, overrides)?.path ?? null;

	test('by name, for each file of the recording', () => {
		expect(find('talks/a.mp3')).toBe('talks/a.srt');
		expect(find('talks/a.mp4')).toBe('talks/a.srt');
		expect(find('talks/b.webm')).toBe('talks/b.en.vtt');
	});

	test('chosen by hand', () => {
		expect(find('x/chosen.m4a')).toBeNull();
		expect(find('x/chosen.m4a', { 'x/c.srt': 'x/chosen.m4a' })).toBe('x/c.srt');
	});

	test('none', () => {
		expect(find('lone.mp4')).toBeNull();
	});
});
