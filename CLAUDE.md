# Transcript++ — notes for Claude

PDF++-style transcript reader for Obsidian (SRT, WebVTT), built on **file-plus-plus** (`../file-plus-plus`, linked with bun). Read its CLAUDE.md first: the reader, the Obsidian layer, the `fpp` → `tpp` prefix and most gotchas live there. User-facing overview: `README.md`.

## Workflow the user expects

- **Tooling:** use `bun`, not npm or pnpm, and `fd` / `rg`, not find / grep.
- **After each change:** `bun test`, `bun run typecheck` (and in `../file-plus-plus` if it changed; commit there too), commit (git identity is repo-local, a GitHub no-reply address; don't change it), then `bun run install-plugin ~/Obsidian` (copies main.js, manifest.json, styles.css into the user's vault, which syncs to their phone).
- **Mobile matters as much as desktop.** **Don't touch the user's running Obsidian**: test only in the isolated headless instance.

## Layout

```
src/
  main.ts        TranscriptPlusPlus extends FilePlusPlusPlugin: commands, media chooser, settings section
  format.ts      the transcript FileFormat (positions = start seconds, {{time}} {{start}} {{end}})
  transcript.ts  Cue/Transcript, SRT + WebVTT parsing, safe cue markup → DOM
  time.ts        t=… (seconds; Media Fragments and clock times accepted) and cue=… locator schemes
  reader.ts      TranscriptReader extends DocumentReader: paragraphs of cue spans, sections/TOC by time
  media.ts       findMedia (patterns, overrides), MediaPlayer
  view.ts        TranscriptView: player above the transcript, sync, follow, label clicks, play menu items
  embed.ts       TranscriptEmbed: media + transcript, plays the passage
  settings.ts    TppSettings (extends the shared settings)
scripts/         fixtures.ts (test media), helpers.js (page-script helpers)
test-vault/      dev vault; .obsidian/plugins/transcript-plus-plus → ../../../dist (symlink)
```

## Testing in real Obsidian (headless, isolated)

```sh
node_modules/file-plus-plus/scripts/obsidian-headless.sh mobile   # or desktop | stop; CDP on :9333 (FPP_CDP_PORT)
bun run build && bun node_modules/file-plus-plus/scripts/cdp.ts --eval "…"   # reload with reloadPlugin() from scripts/helpers.js
bun node_modules/file-plus-plus/scripts/cdp-input.ts --click x,y | --tap x,y | --dbltap x,y | --rightclick x,y | --key …
```

Page scripts: one async IIFE with `scripts/helpers.js` prepended (`getView(path)`, `reloadPlugin()`, `sleep`). Look at screenshots after UI changes. A fresh headless profile shows the "trust this vault" dialog first.

## Gotchas

- **Times in links are seconds** (`t=109s-300.7s`), by the user's choice; never `00:01:49,312`. Parsing accepts more (Media Fragments, clock times). A `t=` without an end is a position (not a highlight).
- **Passages are whole cues:** a range resolves from the last cue starting at or before its start through the first cue ending at or after its end, so links round-trip. Text fragments are the precise alternative.
- **Labels are `::before` content** (`data-label`), so times and speakers stay out of the text index, search, selections and copied Markdown. Clicking a label targets the paragraph itself; `labelTimeAt` checks the click is above the first cue.
- **Subclass fields:** the view's extra UI is built in `buildExtraUi` (called after construction), never in a constructor hook — class fields would reset it.
- **WebM can be audio-only:** the player decides audio vs video from `videoWidth` after metadata loads.
