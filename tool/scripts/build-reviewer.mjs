import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../src/generated/', import.meta.url);
await mkdir(output, { recursive: true });
const outfile = fileURLToPath(new URL('../src/generated/reviewer-runtime.js', import.meta.url));
await build({ entryPoints: [fileURLToPath(new URL('../src/reviewer-entry.js', import.meta.url))], outfile, bundle: true, format: 'iife', target: 'es2020', minify: true, legalComments: 'none' });
const hdr = (await readFile(new URL('../public/hdri/brown_photostudio_02_2k.hdr', import.meta.url))).toString('base64');
const sharedCss = await readFile(new URL('../src/shared-ui.css', import.meta.url), 'utf8');
const runtime = await readFile(outfile, 'utf8');
await writeFile(outfile, `globalThis.__AN_SHARED_CSS__=${JSON.stringify(sharedCss)};globalThis.__AN_HDR_SOURCE__="data:application/octet-stream;base64,${hdr}";${runtime}`, 'utf8');
