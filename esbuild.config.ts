import { buildPlugin } from 'file-plus-plus/build';

await buildPlugin({ root: import.meta.dir, prefix: 'tpp', production: process.argv[2] === 'production' });
