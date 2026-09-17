import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const packageName = '@ch-zacmo/jquery-sked-tape';
const jquerySource = await readFile(require.resolve('jquery'), 'utf8');
const bootstrapSource = await readFile(require.resolve('bootstrap/dist/js/bootstrap.bundle.js'), 'utf8');
function createScheduleOptions(DateConstructor) {
    return {
        start: new DateConstructor('2026-09-17T08:00:00Z'),
        end: new DateConstructor('2026-09-17T18:00:00Z'),
        locations: [{ id: 'room', name: 'Room' }],
        events: [{
            name: '<Meeting>',
            location: 'room',
            start: '2026-09-17T09:00:00Z',
            end: '2026-09-17T10:00:00Z'
        }]
    };
}

function createDocument() {
    return new JSDOM('<!doctype html><div id="schedule"></div>', {
        runScripts: 'outside-only',
        pretendToBeVisual: true
    });
}

function verifyEventEditing($schedule, api) {
    const addedEvent = api.addEvent({
        name: 'Second',
        location: 'room',
        start: '2026-09-17T11:00:00Z',
        end: '2026-09-17T12:00:00Z',
        style: { letterSpacing: '2px' }
    });

    assert.equal($schedule.find('.sked-tape__event').length, 2);
    assert.equal($schedule.find('.sked-tape__event').last()[0].style.letterSpacing, '2px');

    const overlappingEvent = {
        name: 'Collision',
        location: 'room',
        start: '2026-09-17T11:30:00Z',
        end: '2026-09-17T12:30:00Z'
    };

    assert.throws(() => api.addEvent(overlappingEvent), /Collision/);

    $schedule.skedTape('removeEvent', addedEvent.id);
    assert.equal($schedule.find('.sked-tape__event').length, 1);
}

function verifyZoom($schedule, api) {
    $schedule.skedTape('zoomIn');
    assert.ok(api.zoom > 1, 'Zoom in should increase the zoom level');

    $schedule.skedTape('resetZoom');
    assert.equal(api.zoom, 1);
}

function verifyDragCancellation($, $schedule, api) {
    const originalEvent = api.getEvents()[0];
    const click = $.Event('click', { pageX: 10, pageY: 10 });

    api.dragEvent(originalEvent.id, click);
    assert.ok(api.isAdding(), 'Dragging should start event placement');

    $schedule.skedTape('cancelAdding');
    assert.equal(api.getEvents().length, 1);
    assert.equal(api.getEvents()[0].id, originalEvent.id);
}

function verifyComponentBehavior($, DateConstructor) {
    assert.equal($.fn.jquery, '4.0.0');

    // The component must work without the deprecated proxy helper.
    $.proxy = undefined;

    const options = createScheduleOptions(DateConstructor);
    const $schedule = $('#schedule');
    let clickCount = 0;

    $schedule.on('event:click.skedtape', event => {
        assert.equal(event.detail.event.name, '<Meeting>');
        clickCount++;
    });

    try {
        $schedule.skedTape(options);
        const api = $schedule.data('sked-tape');

        // Render event names as text, and forward click details.
        assert.equal($schedule.find('.sked-tape__event').length, 1);
        assert.equal($schedule.find('.sked-tape__center').text(), '<Meeting>');
        assert.equal($schedule.find('.sked-tape__center meeting').length, 0);

        $schedule.find('.sked-tape__event').trigger('click');
        assert.equal(clickCount, 1);

        verifyEventEditing($schedule, api);
        verifyZoom($schedule, api);
        verifyDragCancellation($, $schedule, api);

        // Reinitializing must preserve application handlers without duplicating them.
        $schedule.skedTape(options);
        $schedule.find('.sked-tape__event').trigger('click');
        assert.equal(clickCount, 2);

        const currentInstance = $schedule.data('sked-tape');
        $schedule.skedTape('destroy');

        assert.equal($schedule.data('sked-tape'), undefined);
        assert.equal(currentInstance.indicatorTimeout, undefined);
        assert.equal(currentInstance.popoverTimeout, undefined);
        assert.equal($schedule.children().length, 0);
    } finally {
        // Node timers must also be released if a CommonJS/ESM assertion fails.
        if ($schedule.data('sked-tape')) {
            $schedule.skedTape('destroy');
        }
    }
}

for (const file of ['jquery.skedTape.js', 'jquery.skedTape.min.js']) {
    test(`browser distribution: ${file}`, async () => {
        const page = createDocument();
        try {
            page.window.eval(jquerySource);
            page.window.eval(await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8'));
            verifyComponentBehavior(page.window.jQuery, page.window.Date);
        } finally {
            page.window.close();
        }
    });
}

test('CommonJS factory works without global window/document and supports injected jQuery', () => {
    const page = createDocument();
    try {
        assert.equal(globalThis.document, undefined);
        const install = require(packageName);
        const $ = install(page.window);

        verifyComponentBehavior($, Date);

        assert.equal(install(page.window, $), $);
        assert.throws(() => install(), /DOM window/);
    } finally {
        page.window.close();
    }
});

test('AMD registers against the supplied jQuery instance', async () => {
    const page = createDocument();
    try {
        page.window.eval(jquerySource);
        let result;
        page.window.define = (dependencies, factory) => {
            assert.deepEqual(Array.from(dependencies), ['jquery']);
            result = factory(page.window.jQuery);
        };
        page.window.define.amd = {};
        page.window.eval(await readFile(new URL('../dist/jquery.skedTape.js', import.meta.url), 'utf8'));
        assert.equal(result, page.window.jQuery);
        verifyComponentBehavior(result, page.window.Date);
    } finally {
        page.window.close();
    }
});

test('jQuery 4 Slim fails with an explicit message', () => {
    const page = createDocument();
    try {
        const { jQueryFactory } = require('jquery/factory-slim');
        const registerSkedTape = require(packageName);
        const slimJquery = jQueryFactory(page.window);

        assert.throws(
            () => registerSkedTape(page.window, slimJquery),
            /full build of jQuery 4/
        );
    } finally {
        page.window.close();
    }
});

test('ESM imports jQuery without a global $, and CSS subpaths resolve', async () => {
    const page = createDocument();
    globalThis.window = page.window;
    globalThis.document = page.window.document;
    try {
        assert.equal(globalThis.$, undefined);
        const { default: $ } = await import(packageName);
        const { default: jqueryModule } = await import('jquery');

        assert.equal($, jqueryModule);

        // Dates for this module originate in Node, not the emulated window.
        verifyComponentBehavior($, Date);

        const legacyModule = await import(`${packageName}/dist/jquery.skedTape.esm.js`);
        const stylesheetPath = require.resolve(`${packageName}/dist/jquery.skedTape.css`);

        assert.equal(legacyModule.default, $);
        assert.ok(stylesheetPath.endsWith('.css'));
    } finally {
        delete globalThis.window;
        delete globalThis.document;
        page.window.close();
    }
});

test('Bootstrap 5 popovers work without its jQuery bridge and dispose correctly', async () => {
    const page = createDocument();
    try {
        page.window.eval(jquerySource);
        page.window.eval(bootstrapSource);
        page.window.eval(await readFile(new URL('../dist/jquery.skedTape.js', import.meta.url), 'utf8'));
        const $ = page.window.jQuery;
        const Popover = page.window.bootstrap.Popover;
        delete page.window.bootstrap;
        delete $.fn.popover;
        const $el = $('#schedule').skedTape({
            ...createScheduleOptions(page.window.Date),
            showPopovers: 'always',
            popoverConstructor: Popover
        });

        // Popovers are created after rendering, on the next timer tick.
        await delay(30);

        const entry = $el.find('.sked-tape__event')[0];
        const popover = Popover.getInstance(entry);
        assert.ok(popover);

        popover.show();
        assert.ok(page.window.document.querySelector('.popover-body'));

        $el.skedTape('destroy');
        assert.equal(Popover.getInstance(entry), null);
        assert.equal(page.window.document.querySelector('.popover'), null);
    } finally {
        page.window.close();
    }
});
