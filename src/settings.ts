import type { FppSettings } from 'file-plus-plus/obsidian';

/** What opening a timestamp link does to the player. */
export type LinkPlayback = 'seek' | 'play' | 'clip';

export interface TppSettings extends FppSettings {
	/** Where a transcript's media is looked for, in order (see `findMedia`). */
	mediaPatterns: string[];
	/** Media chosen by hand: transcript path → media path. */
	mediaOverrides: Record<string, string>;
	linkPlayback: LinkPlayback;
	/** Scroll the transcript along with playback. */
	followPlayback: boolean;
	/** Length of a table-of-contents section, in minutes. */
	sectionMinutes: number;
	/** Playback speed (the player's speed button). */
	playbackRate: number;
}

export const TPP_DEFAULTS = {
	mediaPatterns: ['{{folder}}/{{name}}', '{{name}}'],
	mediaOverrides: {} as Record<string, string>,
	linkPlayback: 'seek' as LinkPlayback,
	followPlayback: true,
	sectionMinutes: 5,
	playbackRate: 1,
	aliasTemplate: '{{title}} {{time}}',
	annotationFileName: '{{title}} - Notes',
};
