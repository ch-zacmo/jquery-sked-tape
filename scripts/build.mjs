import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import * as sass from 'sass';
import postcss from 'postcss';
import autoprefixer from 'autoprefixer';
import { minify } from 'terser';

export const root = fileURLToPath(new URL('../', import.meta.url));


/**
 * Builds the library and demo files in `dist/` and `docs/`.
 * @async
 */
export async function build() {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
    const source = await readFile(path.join(root, 'src/jquery.skedTape.js'), 'utf8');
    const template = await readFile(path.join(root, 'umd.template.txt'), 'utf8');

    const banner = (esm = '') => `/*! jQuery.skedTape${esm} v${pkg.version}\n * License: ${pkg.license}\n * Author: ${pkg.author}\n */\n`;
    
    const wrapped = template.replace('<%= contents %>', () => source);
    
    const files = new Map();
    
    files.set('jquery.skedTape.js', banner() + wrapped);
    
    const js = await minify({ 'jquery.skedTape.js': wrapped }, {
        format: { preamble: banner().trim(), comments: false },
        sourceMap: { filename: 'jquery.skedTape.min.js', url: 'jquery.skedTape.min.js.map', includeSources: true }
    });
    
    files.set('jquery.skedTape.min.js', js.code);
    files.set('jquery.skedTape.min.js.map', js.map);
    
    const esm = `import $ from 'jquery';\n\n${source}\n\nexport default $;\n`;
    files.set('jquery.skedTape.esm.mjs', banner(' ESM') + esm);

    for (const compressed of [false, true]) {
        const name = `jquery.skedTape${compressed ? '.min' : ''}.css`;
        const compiled = await sass.compileAsync(path.join(root, 'src/jquery.skedTape.sass'), {
            style: compressed ? 'compressed' : 'expanded', sourceMap: true, sourceMapIncludeSources: true
        });

        compiled.sourceMap.sources = compiled.sourceMap.sources.map(source =>
            source.startsWith('file:')
                ? path.relative(path.join(root, 'src'), fileURLToPath(source)).split(path.sep).join('/')
                : source);

        const result = await postcss([
            autoprefixer(),
            { postcssPlugin: 'build-comments', Once(css) {
                css.walkComments(comment => comment.remove());
                css.prepend(postcss.comment({ text: banner().slice(2, -3).trim() }));
            } }
        ]).process(compiled.css, {
            from: path.join(root, 'src/jquery.skedTape.sass'),
            to: path.join(root, 'dist', name),
            map: { prev: compiled.sourceMap, inline: false, annotation: `${name}.map`, sourcesContent: true }
        });

        files.set(name, result.css);
        files.set(`${name}.map`, result.map.toString());
    }

    // Compile everything before replacing any published files.
    await mkdir(path.join(root, 'dist'), { recursive: true });
    await mkdir(path.join(root, 'docs'), { recursive: true });

    
    for (const directory of ['dist', 'docs']) {
        await rm(path.join(root, directory, 'jquery.skedTape.esm.js'), { force: true });
    }

    const demoFiles = new Set(['jquery.skedTape.js', 'jquery.skedTape.css']);

    for (const [name, content] of files) {
        await writeFile(path.join(root, 'dist', name), content);
        
        if (demoFiles.has(name)) {

            // Do not ship source map in the demo
            const demoContent = name.endsWith('.css')
                ? content.replace(/\n?\/\*# sourceMappingURL=[^*]*\*\//g, '')
                : content;

            await writeFile(path.join(root, 'docs', name), demoContent);
        } else {
            // Remove only known obsolete build outputs, preserving other docs assets.
            await rm(path.join(root, 'docs', name), { force: true });
        }
    }
    console.log(`Built ${files.size} files in dist/ and ${demoFiles.size} demo assets in docs/.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    build().catch(error => { console.error(error); process.exitCode = 1; });
}
