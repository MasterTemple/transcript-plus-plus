import type { FppSettings } from 'file-plus-plus/obsidian';
import { MEDIA_EXTENSIONS } from './media';

/** What opening a timestamp link does to the player. */
export type LinkPlayback = 'seek' | 'play' | 'clip';

export interface TppSettings extends FppSettings {
	/** Where a transcript's media is looked for, in order (see `findMedia`). */
	mediaPatterns: string[];
	/** Media chosen by hand: transcript path → media path. */
	mediaOverrides: Record<string, string>;
	/** Media files of these types open in their transcript (when they have one); empty: never. */
	openMediaInTranscript: string[];
	/** Hide, in the file explorer, transcripts that open from their media (see `openMediaInTranscript`). */
	hideTranscripts: boolean;
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
	openMediaInTranscript: [...MEDIA_EXTENSIONS],
	hideTranscripts: false,
	linkPlayback: 'seek' as LinkPlayback,
	followPlayback: true,
	sectionMinutes: 5,
	playbackRate: 1,
	aliasTemplate: '{{title}} {{time}}',
	annotationFileName: '{{title}} - Notes',
};
