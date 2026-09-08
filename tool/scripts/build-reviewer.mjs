import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../src/generated/', import.meta.url);
await mkdir(output, { recursive: true });
await build({ entryPoints: [fileURLToPath(new URL('../src/reviewer-entry.js', import.meta.url))], outfile: fileURLToPath(new URL('../src/generated/reviewer-runtime.js', import.meta.url)), bundle: true, format: 'iife', target: 'es2020', minify: true, legalComments: 'none' });
