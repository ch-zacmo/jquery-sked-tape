# Migrating to version 3.0.0

Version 3.0.0 targets the full build of jQuery 4. The Slim build does not include
the functions used for animated scrolling. Older jQuery versions are no longer
guaranteed to work.

## Initialization and commands

Calls to `skedTape`, event data and hooks keep the same shape:

```js
const $schedule = $('#schedule').skedTape(options);
$schedule.skedTape('addEvent', event);
$schedule.skedTape('destroy');
```

## ES modules

The module imports jQuery directly. It no longer relies on `window.$` or
`window.jQuery`.

```js
import $ from 'jquery';
import '@ch-zacmo/jquery-sked-tape';

$('#schedule').skedTape(options);
```

The default export is the same jQuery instance, with the plugin registered:

```js
import $ from '@ch-zacmo/jquery-sked-tape';

$('#schedule').skedTape(options);
```

The ESM file is now `dist/jquery.skedTape.esm.mjs`. If your application references
the old `.esm.js` file directly by URL, use `.esm.mjs` and an import map to resolve
`jquery`, or use your bundler. The package import path
`@ch-zacmo/jquery-sked-tape/dist/jquery.skedTape.esm.js` remains an alias for the
new module.

`jquery.skedTape.js` and `jquery.skedTape.min.js` still work with `<script>` tags,
loaded after jQuery. CSS paths are unchanged.

## CommonJS

The registration function keeps its `window` and `jQuery` arguments:

```js
const registerSkedTape = require('@ch-zacmo/jquery-sked-tape');
registerSkedTape(window, $);

$('#schedule').skedTape(options);
```

If you omit jQuery, the function creates an instance bound to the window and
returns it:

```js
const $ = require('@ch-zacmo/jquery-sked-tape')(window);
```

A window with a document is still required to render the component.

## Popovers

Popovers use Bootstrap 5. Bootstrap 3 and 4 integrations are no longer supported.
Without Bootstrap, the schedule works without popovers.

When Bootstrap is loaded through a `<script>` tag, its global
`bootstrap.Popover` constructor is detected automatically.

In a module-based application, pass the constructor explicitly:

```js
import $ from '@ch-zacmo/jquery-sked-tape';
import { Popover } from 'bootstrap';

$('#schedule').skedTape({
    ...options,
    popoverConstructor: Popover,
    showPopovers: 'always'
});
```

`showPopovers` still accepts `default`, `always` and `never`.

## Custom styles

jQuery 4 no longer adds `px` automatically to some CSS properties. Include the
unit in event styles and in your hooks:

```js
// Before
style: { letterSpacing: 2 }

// After
style: { letterSpacing: '2px' }
```

Unitless properties such as `opacity` and `zIndex` can remain numeric.

## Destruction and reinitialization

`skedTape('destroy')` removes only the component's internal event handlers.
Your handlers are preserved, including during reinitialization. To remove them
explicitly, give them your own namespace:

```js
$schedule.on('event:click.skedtape.mySchedule', handleClick);
$schedule.skedTape('destroy');
$schedule.off('.mySchedule');
```
