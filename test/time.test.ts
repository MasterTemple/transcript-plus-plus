import { describe, expect, test } from 'bun:test';
import { parseLocator } from 'file-plus-plus/core';
import { cueScheme, formatClock, formatTimeLocator, parseCueLocator, parseTime, parseTimeLocator, timeScheme } from '../src/time';
import { TRANSCRIPT_SCHEMES } from '../src/reader';

describe('times', () => {
	test('parse seconds and clock times', () => {
		expect(parseTime('109')).toBe(109);
		expect(parseTime('109.5s')).toBe(109.5);
		expect(parseTime('1:49')).toBe(109);
		expect(parseTime('01:01:49.5')).toBe(3709.5);
		expect(parseTime('00:01:49,312')).toBeCloseTo(109.312);
		expect(parseTime('npt:1:49')).toBe(109);
		expect(parseTime('soon')).toBeNull();
	});

	test('format for links (seconds) and people (clock)', () => {
		expect(formatTimeLocator({ start: 109, end: 300.7 })).toBe('t=109s-300.7s');
		expect(formatTimeLocator({ start: 1.23456, end: null })).toBe('t=1.235s');
		expect(formatClock(109)).toBe('1:49');
		expect(formatClock(3709.5)).toBe('1:01:49');
	});

	test('time locators: ours, Media Fragments, clock; positions vs passages', () => {
		expect(parseTimeLocator('t=109s-300.7s')).toEqual({ start: 109, end: 300.7 });
		expect(parseTimeLocator('t=109,300.7')).toEqual({ start: 109, end: 300.7 });
		expect(parseTimeLocator('t=,20')).toEqual({ start: 0, end: 20 });
		expect(parseTimeLocator('t=1%3A49-2%3A00')).toEqual({ start: 109, end: 120 });
		expect(parseTimeLocator('t=109s')).toEqual({ start: 109, end: null });
		expect(parseTimeLocator('t=20-10')).toBeNull();
		expect(timeScheme.isRange!('t=1s-2s')).toBe(true);
		expect(timeScheme.isRange!('t=1s')).toBe(false);
	});

	test('subpaths normalize to seconds; params and other schemes', () => {
		expect(parseLocator('#t=1:49,2:00&color=red', TRANSCRIPT_SCHEMES)).toEqual({ scheme: 'time', locator: 't=109s-120s', params: { color: 'red' } });
		expect(parseLocator('cue=3-5&color=red', TRANSCRIPT_SCHEMES)).toEqual({ scheme: 'cue', locator: 'cue=3-5', params: { color: 'red' } });
		expect(parseLocator(':~:text=call%20me', TRANSCRIPT_SCHEMES).scheme).toBe('text');
		expect(parseCueLocator('cue=3-5')).toEqual({ from: '3', to: '5' });
		expect(parseCueLocator('cue=intro')).toEqual({ from: 'intro', to: 'intro' });
		expect(cueScheme.isRange!('cue=1')).toBe(true);
	});
});
