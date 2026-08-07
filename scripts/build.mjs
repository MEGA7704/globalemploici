import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
await cp('src/_worker.js', 'dist/_worker.js');
console.log('GLOBAL EMPLOI build complete -> dist/');
