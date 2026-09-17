import http from 'node:http';
import { readFile } from 'node:fs/promises';

const projectRoot = new URL('../../', import.meta.url);
const assets = new Map([
    ['/', 'docs/index.html'],
    ['/esm', 'tests/fixtures/esm.html'],
    ['/jquery.skedTape.js', 'docs/jquery.skedTape.js'],
    ['/jquery.skedTape.css', 'docs/jquery.skedTape.css'],
    ['/dist/jquery.skedTape.esm.mjs', 'dist/jquery.skedTape.esm.mjs'],
    ['/jquery.module.js', 'node_modules/jquery/dist-module/jquery.module.js']
]);

function contentType(file) {
    if (file.endsWith('.css')) return 'text/css';
    if (/\.m?js$/.test(file)) return 'text/javascript';
    return 'text/html';
}

export async function startDemoServer() {
    const server = http.createServer(async (request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const asset = assets.get(pathname);

        if (!asset) {
            response.writeHead(404).end();
            return;
        }

        try {
            const body = await readFile(new URL(asset, projectRoot));
            response.writeHead(200, { 'Content-Type': contentType(asset) });
            response.end(body);
        } catch {
            response.writeHead(500).end();
        }
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

    return {
        url: `http://127.0.0.1:${server.address().port}`,
        async close() {
            server.closeAllConnections();
            await new Promise(resolve => server.close(resolve));
        }
    };
}

export async function useLocalDemoDependencies(page) {
    // Keep the demo's pinned URLs and integrity checks, but avoid CDN requests.
    await page.route('https://cdn.jsdelivr.net/npm/**', async route => {
        const pathname = new URL(route.request().url()).pathname;
        const localPath = pathname
            .replace('/npm/jquery@4.0.0/', 'node_modules/jquery/')
            .replace('/npm/bootstrap@5.3.8/', 'node_modules/bootstrap/');

        if (!localPath.startsWith('node_modules/')) {
            throw new Error(`Unexpected demo dependency: ${pathname}`);
        }

        await route.fulfill({
            body: await readFile(new URL(localPath, projectRoot)),
            contentType: contentType(localPath),
            headers: { 'access-control-allow-origin': '*' }
        });
    });
}
