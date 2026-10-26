// Opt-in build adapter for hosts where esbuild cannot traverse parent directories.
// Node resolves the installed packages; esbuild receives exact file contents.
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
export function localResolver(root) {
  return { name:'local-file-resolution', setup(build) {
    build.onResolve({filter:/.*/}, args => {
      const base=args.resolveDir || root;
      const require=createRequire(path.join(base,'package.json'));
      let resolved=require.resolve(args.path.startsWith('.') ? path.resolve(base,args.path) : args.path);
      if(args.path==='three') resolved=path.join(path.dirname(resolved),'three.module.js');
      return {path:resolved,namespace:'local-source'};
    });
    build.onLoad({filter:/.*/,namespace:'local-source'},async args=>({
      contents:await readFile(args.path,'utf8'),resolveDir:path.dirname(args.path),
      loader:args.path.endsWith('.json')?'json':'js',
    }));
  }};
}
