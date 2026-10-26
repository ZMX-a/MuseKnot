import { build, context } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile, cp } from 'node:fs/promises';
import { localResolver } from './tools/local-resolver.mjs';
await mkdir('dist', { recursive: true });
await copyFile('styles.css', 'dist/styles.css');
await copyFile('forest.css', 'dist/forest.css');
await copyFile('retreat.css', 'dist/retreat.css');
await copyFile('journal.css', 'dist/journal.css');
await copyFile('threads.css', 'dist/threads.css');
await copyFile('account.css', 'dist/account.css');
for (const file of ['manifest.webmanifest','sw.js','pwa.css']) await copyFile(file,'dist/'+file);
await copyFile('theme.js', 'dist/theme.js');
await cp('assets', 'dist/assets', { recursive: true });
const buildVersion = Date.now().toString(36);
await writeFile('dist/index.html', (await readFile('index.html', 'utf8'))
  .replace('./src/main.js', './app.js?v=' + buildVersion)
  .replace(/href="(\.\/[^"?]+\.css)"/g, (_, path) => `href="${path}?v=${buildVersion}"`));
const options = { absWorkingDir: process.cwd(), tsconfigRaw: {}, entryPoints: ['./src/main.js'], bundle: true, outfile: 'dist/app.js', minify: true, format: 'esm', target: ['es2020'], define: { 'process.env.NODE_ENV': '"production"' } };
if (process.argv.includes('--local-resolver')) options.plugins = [localResolver(process.cwd())];
if (process.argv.includes('--serve')) {
  const ctx = await context(options);
  await ctx.watch();
  const server = await ctx.serve({ servedir: 'dist', host: '127.0.0.1', port: 4173 });
  console.log(`Local: http://${server.hosts[0]}:${server.port}`);
} else await build(options);
