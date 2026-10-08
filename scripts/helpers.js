// Prepend to page scripts run with `bun node_modules/file-plus-plus/scripts/cdp.ts --file …` (wrap everything in one async IIFE).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const plugin = () => app.plugins.plugins['transcript-plus-plus'];
/** The transcript view for a vault path (opened from Notes/Listening notes.md if needed), loaded and rendered. */
async function getView(path = 'Media/Loomings.srt') {
	app.workspace.getLeavesOfType('transcript-plus-plus').filter((l) => !l.view.openSearch && !l.isDeferred).forEach((l) => l.detach());
	let leaf = app.workspace.getLeavesOfType('transcript-plus-plus').find((l) => (l.view.file?.path ?? l.getViewState().state?.file) === path);
	if (!leaf) {
		await app.workspace.openLinkText(path.split('/').pop(), 'Notes/Listening notes.md');
		leaf = app.workspace.getLeavesOfType('transcript-plus-plus').find((l) => (l.view.file?.path ?? l.getViewState().state?.file) === path);
	}
	await app.workspace.revealLeaf(leaf);
	await leaf.loadIfDeferred?.();
	for (let i = 0; i < 100 && !leaf.view.reader?.isRendered; i++) await sleep(100);
	return leaf.view;
}
/** Reload the plugin after `bun run build` (its tabs are closed first). */
async function reloadPlugin() {
	app.workspace.getLeavesOfType('transcript-plus-plus').forEach((l) => l.detach());
	await app.plugins.disablePlugin('transcript-plus-plus');
	await app.plugins.enablePlugin('transcript-plus-plus');
	await sleep(500);
}
