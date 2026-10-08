# Transcript++

Read subtitles and transcripts (**SRT**, **WebVTT**) in Obsidian next to their audio or video, PDF++ style: **links from your notes into a transcript are its highlights**, and a link plays the moment it points at.

```markdown
> [!quote|yellow] [[Talk.srt#t=109s-120.5s&color=yellow|Talk 1:49]]
> And that's why the whale dives.

[[Talk.srt#t=109s-120.5s:~:text=the%20whale]]   part of the cues: the time to play, the exact words to highlight
[[Talk.srt#t=300s]]                      a position: opens the transcript there and moves the player
[[Talk.srt#cue=12-14]]                   cues by their number (SRT) or id (WebVTT)
[[Talk.srt#:~:text=why%20the%20whale]]   a text fragment: the exact words
![[Talk.srt#t=109s-120.5s]]              an embed: the media cued to the passage, above the transcript
```

Times in links are seconds (`t=109s-120.5s`), never the subtitle style `00:01:49,312`. Selecting whole cues links just the time; selecting part of them adds a text fragment for the words (searched only within those cues), so the highlight is exact while the link still plays from the right moment. When reading links, Media Fragments (`t=109,120.5`) and clock times (`t=1:49-2:00`) work too.

## Features

- **Player.** The transcript's audio or video plays above it, with large controls: play, ±10 s, a draggable progress bar, speed (remembered), full screen for video. On narrow panes and phones the bar gets its own row. Files without a duration in their header (WebM recorded in a browser) still get one. The cue being played is marked, and the transcript follows playback (toolbar button; scrolling pauses it for a few seconds).
- **Finding the media.** A file with the transcript's name (`Talk.srt` → `Talk.mp3`, `Talk.en.vtt` → `Talk.mp4`), preferring the same folder. Change the patterns in the settings (`{{folder}}/{{name}}`, `Recordings/{{name}}`, …), or pick a file per transcript with **Choose the audio or video of this transcript**.
- **Reading.** Cues flow as paragraphs (a new one after a pause or a change of speaker), each with its start time and speaker (WebVTT `<v Name>`). Click a time to play from there; Ctrl/Cmd-click a cue to play it. Long transcripts get a table of contents every 5 minutes (configurable).
- **Highlights and notes.** Everything EPUB++ has, from the shared library [file-plus-plus](../file-plus-plus): colors, comments, copy formats (with `{{time}}`, `{{start}}`, `{{end}}`), annotation files (a heading per contents entry, annotations inserted in time order), search, hover previews, the backlinks pane, mobile gestures.
- **Selection and highlight menus.** Copy items, plus **Play from here** and **Play selection** / **Play highlight** (stops at the end). On mobile, hold a highlight for its menu.
- **Opening a link** moves the player there, plays from there, or plays just the passage (setting).
- **Plain text.** "Read as plain text" and "Edit as plain text" (tab menu, or the *Toggle plain text / transcript view* and *Toggle reading / editing as plain text* commands; Ctrl/Cmd+E switches) show the raw SRT / VTT file in monospace with line numbers. Editing has undo and Ctrl/Cmd+F search and saves as you type; an open transcript tab re-renders with the changes and its player keeps playing. The header buttons switch modes and back to the transcript.
- **Commands.** Play / pause, back / forward 5 or 10 seconds, choose media, plain text, plus the shared ones (search, annotation file, appearance, copy formats).

## Development

```sh
(cd ../file-plus-plus && bun install && bun link)
bun install
bun test                 # times and locators, SRT/WebVTT parsing, the reader (render, locators, search)
bun run typecheck
bun run build            # → dist/
bun scripts/fixtures.ts  # speech-synthesized test media for test-vault/Media (espeak-ng, ffmpeg)
bun run install-plugin ~/Obsidian
```

`test-vault/` has the plugin symlinked to `dist/`. The headless Obsidian and CDP tools come from file-plus-plus; see `CLAUDE.md`.
