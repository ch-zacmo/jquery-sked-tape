import http from 'node:http';
import path from 'node:path';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { build, root } from './build.mjs';

const docs = await realpath(path.join(root, 'docs'));
const port = Number(process.env.PORT || 8080);
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
let revision = randomUUID();
const client = revision => `setInterval(async () => {
    try {
        const response = await fetch('/__dev/revision', { cache: 'no-store' });
        if (response.ok && await response.text() !== ${JSON.stringify(revision)}) location.reload();
    } catch {}
}, 1000);`;

async function fingerprint(entries) {
    const hash = createHash('sha256');
    async function visit(relative) {
        const absolute = path.join(root, relative);
        try {
            const children = await readdir(absolute, { withFileTypes: true });
            for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
                if (child.isDirectory() || child.isFile()) await visit(path.join(relative, child.name));
            }
        } catch (error) {
            if (error.code === 'ENOTDIR') hash.update(relative).update(await readFile(absolute));
            else if (error.code === 'ENOENT') hash.update(`missing:${relative}`);
            else throw error;
        }
    }
    for (const entry of entries) await visit(entry);
    return hash.digest('hex');
}

const inputs = ['src', 'umd.template.txt', 'package.json'];
let sourceHash = await fingerprint(inputs);
await build();
let docsHash = await fingerprint(['docs']);

const server = http.createServer(async (request, response) => {

    // Disable cache !
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');

    if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
    }

    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (pathname === '/__dev/revision') {
            response.writeHead(200, { 'Content-Type': 'text/plain' }).end(revision);
            return;
        }
        const candidate = path.resolve(docs, '.' + (pathname === '/' ? '/index.html' : pathname));

        const inside = target => {
            const relative = path.relative(docs, target);
            return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
        };

        if (!inside(candidate) || !inside(await realpath(candidate))) {
            response.writeHead(403).end();
            return;
        }

        let content = await readFile(candidate);
        const extension = path.extname(candidate);

        if (extension === '.html') {
            content = Buffer.from(content.toString().replace(/<\/body>/i, `<script>${client(revision)}</script></body>`));
        }
        
        response.writeHead(200, { 'Content-Type': (mime[extension] || 'application/octet-stream') + (['.html', '.js', '.css', '.json', '.map', '.svg'].includes(extension) ? '; charset=utf-8' : '') });
        response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
        response.writeHead(error instanceof URIError ? 400 : ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) ? 404 : 500).end();
    }
});

server.listen(port, '127.0.0.1', () => console.log(`Development server: http://127.0.0.1:${server.address().port}`));
server.on('error', error => { console.error(error); process.exit(1); });

// Recursive polling
let timer;
let stopped = false;
async function poll() {
    try {
        const next = await fingerprint(inputs);
        if (next !== sourceHash) {
            sourceHash = next;
            await build();
        }
        const nextDocs = await fingerprint(['docs']);
        if (nextDocs !== docsHash) {
            docsHash = nextDocs;
            revision = randomUUID();
            console.log('Changes ready; reloading browsers.');
        }
    } catch (error) { console.error(error); }
    if (!stopped) timer = setTimeout(poll, 1000);
}
timer = setTimeout(poll, 1000);


// Shutdown
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
    stopped = true;
    clearTimeout(timer);
    server.close();
    server.closeAllConnections();
});
