import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startDemoServer, useLocalDemoDependencies } from './support/demo-server.mjs';

describe('Demo with jQuery 4', { timeout: 60000 }, () => {
    let server;
    let browser;
    let page;
    let pageErrors;

    before(async () => {
        server = await startDemoServer();
        browser = await chromium.launch({
            channel: process.env.BROWSER_CHANNEL || undefined,
            headless: true
        });
    });

    after(async () => {
        try {
            await browser?.close();
        } finally {
            await server?.close();
        }
    });

    beforeEach(async () => {
        page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await useLocalDemoDependencies(page);
    });

    afterEach(async () => {
        await page?.close();
        assert.deepEqual(pageErrors, [], 'The page should not raise JavaScript errors');
    });

    async function openDemo() {
        await page.goto(server.url);
        await page.locator('#sked1 .sked-tape__event').first().waitFor();
    }

    test('renders the main and deferred schedules', async () => {
        await openDemo();

        const jqueryVersion = await page.evaluate(() => jQuery.fn.jquery);
        const deferredEvents = await page.locator('#sked2 .sked-tape__event').count();

        assert.equal(jqueryVersion, '4.0.0');
        assert.ok(deferredEvents > 0, 'The deferred schedule should contain events');
    });

    test('renders schedules when opening a modal and a tab', async () => {
        await openDemo();

        await page.getByRole('button', { name: 'Show in modal' }).click();
        await page.locator('#sked3 .sked-tape__event').first().waitFor();

        await page.getByRole('button', { name: 'Close', exact: true }).click();
        await page.locator('#modal1').waitFor({ state: 'hidden' });

        await page.getByRole('tab', { name: 'Schedule', exact: true }).click();
        await page.locator('#sked4 .sked-tape__event').first().waitFor();
    });

    test('zooms in with the plus key', async () => {
        await openDemo();

        const frame = page.locator('#sked1 .sked-tape__time-frame');
        await frame.click({ position: { x: 20, y: 20 } });
        const initialZoom = await page.evaluate(() => jQuery('#sked1').data('sked-tape').zoom);

        await page.keyboard.press('+');

        const currentZoom = await page.evaluate(() => jQuery('#sked1').data('sked-tape').zoom);
        assert.ok(currentZoom > initialZoom, 'The plus key should increase the zoom level');
    });

    test('shows Bootstrap popovers and removes them on destruction', async () => {
        await openDemo();

        await page.evaluate(() => {
            const schedule = jQuery('#sked2 .sked-tape').data('sked-tape');
            schedule.showPopovers = 'always';
            schedule.update();
        });

        await page.locator('#sked2 .sked-tape__event').first().hover();
        await page.locator('.popover-body').first().waitFor();

        await page.evaluate(() => jQuery('#sked2 .sked-tape').skedTape('destroy'));
        assert.equal(await page.locator('.popover').count(), 0);
    });

    test('renders the ES module without a global dollar alias', async () => {
        await page.goto(`${server.url}/esm`);
        await page.getByText('ESM event', { exact: true }).waitFor();

        const globalDollarType = await page.evaluate(() => typeof window.$);
        const bounds = await page.locator('.sked-tape__event').boundingBox();

        assert.equal(globalDollarType, 'undefined');
        assert.ok(bounds.width > 0 && bounds.height > 0, 'The event should have visible dimensions');
    });
});
