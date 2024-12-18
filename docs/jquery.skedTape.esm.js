/**
 * jQuery.skedTape ESM v2.7.0
 * License: MIT
 * Author: Alexander Korostin <lexkrstn@gmail.com>
 */

"use strict";

function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
var CURRENT_TZ_OFFSET = new Date().getTimezoneOffset();
var _SkedTape = function SkedTape(opts) {
  $.extend(this, opts);
  this.$el = opts && opts.el ? $(opts.el) : $('<div/>');
  this.el = opts.el instanceof $ ? opts.el[0] : opts.el;
  this.locations = [];
  this.events = [];
  this.lastEventId = 0;
  this.format = $.extend({}, _SkedTape.defaultFormatters, opts && opts.formatters || {});
  this.$el.on('click', '.sked-tape__event', $.proxy(this.handleEventClick, this));
  this.$el.on('contextmenu', '.sked-tape__event', $.proxy(this.handleEventContextMenu, this));
  this.$el.on('click', '.sked-tape__timeline-wrap', $.proxy(this.handleTimelineClick, this));
  this.$el.on('contextmenu', '.sked-tape__timeline-wrap', $.proxy(this.handleTimelineContextMenu, this));
  this.$el.on('mousemove', '.sked-tape__timeline-wrap', $.proxy(this.handleMouseMove, this));
  this.$el.on('keydown', '.sked-tape__time-frame', $.proxy(this.handleKeyDown, this));
  this.$el.on('wheel', '.sked-tape__time-frame', $.proxy(this.handleWheel, this));
  this.$el.on('click', '.sked-tape__intersection', $.proxy(this.handleIntersectionClick, this));
  this.$el.on('contextmenu', '.sked-tape__intersection', $.proxy(this.handleIntersectionContextMenu, this));
};
_SkedTape.defaultFormatters = {
  /**
   * Formats the date.
   * 
   * Note, since the component itself invokes the function with a single
   * argument, when overriding the function you should provide only the first
   * one. The sole purpose of the rest of them is to be used from the derived
   * function for convenience. 
   * 
   * @param {Date} date The date to format.
   * @param {'m'|'l'} endian Date format endianess ('m' - US, 'l' - EU).
   *                         Default value is 'm'.
   * @param {String} delim Date component delimiter.
   *                       Default - '/' or '.' depending on `endian`'s value.
   */
  date: function date(_date, endian, delim) {
    endian = endian || 'm';
    delim = delim || (endian === 'm' ? '/' : '.');
    var nums = [_date.getDate(), _date.getMonth() + 1, _date.getFullYear()];
    if (endian === 'm') {
      nums = [nums[1], nums[0], nums[2]];
    }
    return nums.join(delim);
  },
  roundDuration: function roundDuration(ms) {
    return ms;
  },
  duration: function duration(ms, opts) {
    var h = Math.floor(ms / MS_PER_HOUR);
    var m = Math.floor(ms % MS_PER_HOUR / MS_PER_MINUTE);
    var hrs = opts && opts.hrs || 'hrs';
    var min = opts && opts.min || 'min';
    var format = h ? h + hrs : '';
    format += h && m ? ' ' : '';
    format += m ? m + min : '';
    return format;
  },
  hours: function hours(_hours) {
    return (_hours < 10 ? '0' : '') + _hours + ':00';
  },
  time: function time(date) {
    var h = date.getHours();
    var m = date.getMinutes();
    return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
  }
};
_SkedTape.prototype = {
  constructor: _SkedTape,
  setTimespan: function setTimespan(start, end, opts) {
    if (!isValidTimeRange(start, end)) {
      throw new Error('Invalid time range: ' + JSON.stringify([start, end]));
    }
    this.start = floorHours(start);
    this.end = ceilHours(end);
    return this.updateUnlessOption(opts);
  },
  /**
   * A shorthand for `setTimespan()` that sets timespan between some
   * specified hours (optional) of a particular date.
   */
  setDate: function setDate(date, minHours, maxHours) {
    var midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    var start = new Date(midnight);
    start.setHours(minHours || 0);
    if (maxHours && maxHours != 24) {
      var end = new Date(midnight.getTime());
      end.setHours(maxHours);
    } else {
      var end = new Date(midnight.getTime() + MS_PER_DAY);
    }
    return this.setTimespan(start, end);
  },
  getZoom: function getZoom() {
    return this.zoom;
  },
  setZoom: function setZoom(zoom) {
    zoom = zoom || 1;
    if (zoom < 1) {
      this.zoom = 1;
      return this;
    }
    if (zoom > this.maxZoom) {
      this.zoom = this.maxZoom;
      return this;
    }
    this.zoom = zoom;
    if (this.$canvas) {
      var minWidth = this.$canvas.data('orig-min-width') * zoom;
      this.$canvas.css('min-width', Math.round(minWidth) + 'px');
    }
    return this;
  },
  resetZoom: function resetZoom() {
    return this.setZoom();
  },
  zoomIn: function zoomIn(inc) {
    return this.setZoom(this.zoom + (inc || this.zoomStep));
  },
  zoomOut: function zoomOut(dec) {
    return this.setZoom(this.zoom - (dec || this.zoomStep));
  },
  locationExists: function locationExists(id) {
    var exists = false;
    $.each(this.locations, function (i, location) {
      if (location.id == id) {
        exists = true;
        return false;
      }
    });
    return exists;
  },
  setLocations: function setLocations(locations, opts) {
    this.events = [];
    this.locations = locations && locations.map(function (location) {
      return {
        id: location.id,
        name: location.name,
        order: location.order || 0,
        tzOffset: location.tzOffset,
        userData: location.userData ? $.extend({}, location.userData) : {}
      };
    });
    return this.updateUnlessOption(opts);
  },
  addLocations: function addLocations(locations, opts) {
    this.locations = this.locations.concat(locations);
    return this.updateUnlessOption(opts);
  },
  addLocation: function addLocation(location, opts) {
    this.locations.push(location);
    return this.updateUnlessOption(opts);
  },
  removeLocation: function removeLocation(id, opts) {
    // Remove corresponding events
    for (var i = this.events.length - 1; i >= 0; --i) {
      if (this.events[i].location == id) {
        this.events.splice(i, 1);
      }
    }
    // Remove the location
    for (var i = 0; i < this.locations.length; ++i) {
      if (this.locations[i].id == id) {
        this.locations.splice(i, 1);
        break;
      }
    }
    return this.updateUnlessOption(opts);
  },
  getLocation: function getLocation(id) {
    for (var i = 0; i < this.locations.length; ++i) {
      if (this.locations[i].id == id) {
        return this.locations[i];
      }
    }
    return null;
  },
  getLocations: function getLocations() {
    var locations = this.locations;
    if (this.sorting && this.orderBy === 'name') {
      locations = locations.sort(function (a, b) {
        a = a.name.toLocaleLowerCase();
        b = b.name.toLocaleLowerCase();
        return a.localeCompare(b);
      });
    } else if (this.sorting && this.orderBy === 'order') {
      locations = locations.sort(function (a, b) {
        return (a.order || 0) - (b.order || 0);
      });
    }
    return locations;
  },
  collide: function collide(event) {
    for (var i = 0; i < this.events.length; ++i) {
      if (event.location == this.events[i].location && gapBetween(event, this.events[i]) < this.minGapTimeBetween) {
        return this.events[i];
      }
    }
    return null;
  },
  addEvent: function addEvent(entry, opts) {
    if (!this.locationExists(entry.location)) {
      throw new Error('Unknown location #' + entry.location);
    }
    var start = entry.start instanceof Date ? entry.start : new Date(entry.start);
    var end = entry.end instanceof Date ? entry.end : new Date(entry.end);
    if (!isValidTimeRange(start, end)) {
      throw new Error('Invalid time range: ' + JSON.stringify([entry.start, entry.end]));
    }
    var newEvent = {
      id: ++this.lastEventId,
      name: entry.name,
      location: entry.location + '',
      start: start,
      end: end,
      data: entry.data ? $.extend({}, entry.data) : null,
      url: entry.url || false,
      className: entry.className || null,
      style: entry.style || {},
      disabled: entry.disabled || false,
      active: entry.active || false,
      userData: $.extend({}, entry.userData || {})
    };
    if (opts && opts.preserveId && entry.id) {
      if (this.getEvent(entry.id)) {
        throw new Error('Cannot preserve id: already exists');
      }
      newEvent.id = entry.id;
    } else {
      newEvent.id = ++this.lastEventId;
    }
    if (!opts || !opts.allowCollisions) {
      var collided = this.collide(newEvent);
      if (collided) {
        throw new _SkedTape.CollisionError(collided.id);
      }
    }
    this.events.push(newEvent);
    this.updateUnlessOption(opts);
    return newEvent;
  },
  addEvents: function addEvents(events, opts) {
    events.forEach(function (event) {
      this.addEvent(event, $.extend({}, {
        update: false
      }, opts));
    }, this);
    return this.updateUnlessOption(opts);
  },
  setEvents: function setEvents(entries, opts) {
    return this.removeAllEvents(opts).addEvents(entries, opts);
  },
  removeEvent: function removeEvent(eventId, opts) {
    $.each(this.events, $.proxy(function (i, event) {
      if (event.id == eventId) {
        this.events.splice(i, 1);
        return false;
      }
    }, this));
    return this.updateUnlessOption(opts);
  },
  removeAllEvents: function removeAllEvents(opts) {
    this.$el.find('.sked-tape__event, .sked-tape__gap').remove();
    this.events = [];
    return this.updateUnlessOption(opts);
  },
  getEvents: function getEvents() {
    return this.events;
  },
  getEvent: function getEvent(id) {
    var found = null;
    $.each(this.events, $.proxy(function (i, event) {
      if (event.id == id) {
        found = event;
        return false;
      }
    }, this));
    return found;
  },
  isEditMode: function isEditMode() {
    return this.editMode;
  },
  enterEditMode: function enterEditMode() {
    this.editMode = true;
    return this;
  },
  leaveEditMode: function leaveEditMode() {
    this.isAdding() && this.cancelAdding();
    this.editMode = false;
    return this;
  },
  startAdding: function startAdding(dummyEvent) {
    this.dummyEvent = dummyEvent;
    // Place on the last mouse position on the timeline
    if (this.lastPicked) {
      this.moveDummyEvent(this.lastPicked);
      this.updateDummyEvent();
    }
    return this.rerenderLocations();
  },
  cancelAdding: function cancelAdding() {
    if (this.dummyEvent) {
      // Add the dragged event back on the timeline
      var draggedEvent = this.dummyEvent.draggedEvent;
      if (draggedEvent) {
        this.addEvent(draggedEvent, {
          preserveId: true,
          update: true,
          allowCollisions: true
        });
        var jqEvent = $.Event('event:dragCanceled.skedtape', {
          detail: {
            event: draggedEvent
          }
        });
        this.$el.trigger(jqEvent, draggedEvent);
      }
      // Delete the dummy
      delete this.dummyEvent;
    }
    if (this.$dummyEvent) {
      this.$dummyEvent.remove();
      delete this.$dummyEvent;
      this.$el.trigger('event:addingCanceled.skedtape');
    }
    return this.rerenderLocations();
  },
  isAdding: function isAdding() {
    return !!this.dummyEvent;
  },
  rerenderLocation: function rerenderLocation(id) {
    var $location = this.$locations.filter(function () {
      return $(this).data('id') == id;
    });
    var location = this.getLocation(id);
    if ($location.length && location) {
      $location.replaceWith(this.renderLocation(location));
    }
  },
  rerenderLocations: function rerenderLocations() {
    this.$locations.empty().append(this.renderLocations());
    return this;
  },
  renderLocation: function renderLocation(location) {
    var $text = $('<div class="sked-tape__location-text"/>').text(location.name);
    var $location = $('<li class="sked-tape__location"/>').attr({
      'title': location.name,
      'data-id': location.id
    }).append($text);
    var canAdd = this.isAdding() ? this.canAddIntoLocation(location, this.dummyEvent) : undefined;
    this.postRenderLocation($text, location, canAdd);
    return $location;
  },
  renderLocations: function renderLocations() {
    var $frag = $(document.createDocumentFragment());
    $.each(this.getLocations(), $.proxy(function (i, location) {
      this.renderLocation(location).appendTo($frag);
    }, this));
    return $frag;
  },
  postRenderLocation: function postRenderLocation($el, location, canAdd) {
    if (canAdd !== undefined) {
      $el.parent().toggleClass('sked-tape__location--permitted', canAdd).toggleClass('sked-tape__location--forbidden', !canAdd);
    }
  },
  renderAside: function renderAside() {
    var $aside = $('<div class="sked-tape__aside"/>');
    $('<div class="sked-tape__caption"/>').text(this.caption).appendTo($aside);
    this.$locations = $('<ul class="sked-tape__locations"/>').append(this.renderLocations()).appendTo($aside);
    this.$el.append($aside);
  },
  renderTimeWrap: function renderTimeWrap(oldScroll) {
    var $hours = this.renderHours();
    var $wrap = $('<div class="sked-tape__time-wrap"/>').appendTo(this.$el);
    this.$frame = $('<div class="sked-tape__time-frame" tabindex="0"/>').appendTo($wrap);
    this.$canvas = $('<div class="sked-tape__time-canvas"/>').append($hours).appendTo(this.$frame);
    oldScroll && this.$frame.scrollLeft(oldScroll);
    var $timelineWrap = $('<div class="sked-tape__timeline-wrap"/>').append(this.renderTimeRows()).append(this.renderGrid());
    var minWidth = this.$canvas[0].scrollWidth;
    this.$canvas.css('min-width', Math.round(minWidth * this.zoom) + 'px').data('orig-min-width', minWidth).append($timelineWrap).append($hours.clone());
    if (this.showDates) {
      this.$canvas.prepend(this.renderDates());
    }
  },
  renderDates: function renderDates() {
    var $ul = $('<ul class="sked-tape__dates"/>');
    var firstMidnight = getMidnightAfter(this.start);
    var lastMidnight = getMidnightBefore(this.end);
    var queue = [];
    if (firstMidnight > lastMidnight) {
      // The range is within the same day
      queue.push({
        weight: 1,
        text: this.format.date(this.start)
      });
    } else {
      queue.push({
        weight: getMsToMidnight(this.start) / MS_PER_DAY,
        text: this.format.date(this.start)
      });
      for (var day = new Date(firstMidnight); day < lastMidnight;) {
        day.setTime(day.getTime() + 1000);
        queue.push({
          weight: 1,
          text: this.format.date(day)
        });
        day.setTime(day.getTime() + MS_PER_DAY - 1000);
      }
      queue.push({
        weight: getMsFromMidnight(this.end) / MS_PER_DAY,
        text: this.format.date(this.end)
      });
    }
    var totalWeight = queue.reduce(function (total, item) {
      return total + item.weight;
    }, 0);
    var duration = this.end.getTime() - this.start.getTime();
    queue.forEach(function (item) {
      var proportion = item.weight / totalWeight;
      $('<li/>').css('width', (proportion * 100).toFixed(10) + '%').attr('title', item.text).addClass('sked-tape__date').toggleClass('sked-tape__date--short', proportion * duration <= SHORT_DURATION).appendTo($ul);
    });
    return $ul;
  },
  renderHours: function renderHours() {
    var $ul = $('<ul/>');
    var tick = new Date(this.start);
    while (tick.getTime() <= this.end.getTime()) {
      var hour = tick.getHours();
      var $time = $('<time/>').attr('datetime', tick.toISOString()).text(this.format.hours(hour === 24 ? 0 : hour));
      $('<li/>').append($time).appendTo($ul);
      tick.setTime(tick.getTime() + 60 * 60 * 1000);
    }
    var $li = $ul.children();
    $li.not(':last-child').width(100 / ($li.length - 1) + '%');
    return $('<div class="sked-tape__hours"/>').append($ul);
  },
  renderGrid: function renderGrid() {
    var $ul = $('<ul class="sked-tape__grid"/>');
    var tick = new Date(this.start);
    while (tick.getTime() < this.end.getTime()) {
      $('<li/>').appendTo($ul);
      tick.setTime(tick.getTime() + 60 * 60 * 1000);
    }
    var $li = $ul.children();
    $li.width(100 / $li.length + '%');
    return $ul;
  },
  renderTimeRows: function renderTimeRows() {
    this.$timeline = $('<ul class="sked-tape__timeline"/>');
    // Sort the events by time ascending so that the gap between each two of
    // them may be determined in a cycle.
    var events = this.events.sort($.proxy(function (a, b) {
      return a.start.getTime() - b.start.getTime();
    }, this));
    this.timeIndicators = {};
    $.each(this.getLocations(), $.proxy(function (i, location) {
      var $li = $('<li class="sked-tape__event-row"/>').data('locationId', location.id).appendTo(this.$timeline);
      // Render time indicator
      var $timeIndicator = $('<div class="sked-tape__indicator"/>').hide();
      if (this.timeIndicatorSerifs) $timeIndicator.addClass('sked-tape__indicator--serifs');
      this.timeIndicators[location.id] = $timeIndicator;
      $li.append($timeIndicator);
      // Render events
      var intersections = this.getIntersections(location.id);
      var lastEndTime = 0,
        lastEnd;
      events.forEach(function (event) {
        var belongs = event.location == location.id;
        var visible = event.end > this.start && event.start < this.end;
        if (belongs && visible) {
          var intersects = false;
          $.each(intersections, $.proxy(function (i, intersection) {
            $.each(intersection.events, function (j, jEvent) {
              if (jEvent.id == event.id) {
                intersects = true;
                return false;
              }
            });
            if (intersects) return false;
          }, this));
          var gap = event.start.getTime() - lastEndTime;
          if (gap >= this.minTimeGapShown && gap <= this.maxTimeGapShown && !intersects) {
            $li.append(this.renderGap(gap, lastEnd, event.start));
          }
          lastEnd = event.end;
          lastEndTime = lastEnd.getTime();
          var $event = this.renderEvent(event).appendTo($li);
          if (this.maxTimeGapHi !== false && gap <= this.maxTimeGapHi) {
            $li.children('.sked-tape__event').filter(':eq(-1), :eq(-2)').addClass('sked-tape__event--low-gap');
          } else if (intersects) {
            $event.addClass('sked-tape__event--low-gap');
          }
        }
      }, this);
    }, this));
    this.renderIntersections();
    return this.$timeline;
  },
  renderIntersections: function renderIntersections() {
    // Remove the stale ones
    this.$timeline.find('.sked-tape__intersection').remove();
    // Render the new ones
    this.$timeline.find('.sked-tape__event-row').each($.proxy(function (i, row) {
      var $row = $(row);
      var locationId = $row.data('locationId');
      var intersections = this.getIntersections(locationId);
      $.each(intersections, $.proxy(function (i, intersection) {
        if (intersection.end > this.start && intersection.start < this.end) {
          $('<div class="sked-tape__intersection"/>').css({
            width: this.computeEventWidth(intersection),
            left: this.computeEventOffset(intersection)
          }).data('events', intersection.events).appendTo($row);
        }
      }, this));
    }, this));
  },
  renderGap: function renderGap(gap, start, end) {
    var block = {
      start: start,
      end: end
    };
    var $text = $('<span class="sked-tape__gap-text"/>').text(Math.round(gap / MS_PER_MINUTE));
    return $('<div class="sked-tape__gap"/>').css({
      width: this.computeEventWidth(block),
      left: this.computeEventOffset(block)
    }).append($text);
  },
  findEventJustBefore: function findEventJustBefore(event) {
    var found = null;
    $.each(this.events, function (index, iEvent) {
      if (iEvent.location == event.location && iEvent.end < event.start && (!found || found.end < iEvent.end)) {
        found = iEvent;
      }
    });
    return found;
  },
  findEventJustAfter: function findEventJustAfter(event) {
    var found = null;
    $.each(this.events, function (index, iEvent) {
      if (iEvent.location == event.location && iEvent.start > event.end && (!found || found.start > iEvent.start)) {
        found = iEvent;
      }
    });
    return found;
  },
  updateDummyEvent: function updateDummyEvent() {
    if (!this.isAdding()) {
      // Remove its node from the timline
      if (this.$dummyEvent) {
        this.$dummyEvent.remove();
        delete this.$dummyEvent;
      }
      return;
    }
    // Create the event if it doesn't exist
    var event = this.dummyEvent;
    if (!this.$dummyEvent) {
      var timeClass = 'sked-tape__dummy-event-time';
      var timeClassLeft = timeClass + ' ' + timeClass + '--left';
      var timeClassRight = timeClass + ' ' + timeClass + '--right';
      this.$dummyEvent = $('<div/>').append('<div class="' + timeClassLeft + '"/>').append('<div class="' + timeClassRight + '"/>');
    }
    var $dummyChildren = this.$dummyEvent.children();
    var $dummyLeft = $dummyChildren.filter(':first');
    var $dummyRight = $dummyChildren.filter(':last');
    // Apply the className, attributes and styles
    this.$dummyEvent[0].className = 'sked-tape__dummy-event ' + (event.className || '');
    this.$dummyEvent.css({
      width: this.computeEventWidth(event),
      left: this.computeEventOffset(event)
    });
    var leftText = this.format.time(event.start);
    var rightText = this.format.time(event.end);
    if (this.showIntermission) {
      var prevEvent = this.findEventJustBefore(event);
      var interval;
      if (prevEvent) {
        interval = Math.round((event.start - prevEvent.end) / MS_PER_MINUTE);
        if (interval >= this.intermissionRange[0] && interval <= this.intermissionRange[1]) {
          leftText += '<br>+' + this.format.duration(interval * MS_PER_MINUTE);
        }
      }
      var nextEvent = this.findEventJustAfter(event);
      if (nextEvent) {
        interval = Math.round((nextEvent.start - event.end) / MS_PER_MINUTE);
        if (interval >= this.intermissionRange[0] && interval <= this.intermissionRange[1]) {
          rightText += '<br>+' + this.format.duration(interval * MS_PER_MINUTE);
        }
      }
    }
    $dummyLeft.html(leftText);
    $dummyRight.html(rightText);
    // Append to an appropriate location dom node
    var $eventRow = this.$dummyEvent.closest('.sked-tape__event-row');
    if (!$eventRow.length || $eventRow.data('locationId') != event.location) {
      this.$dummyEvent.remove();
      $eventRow = this.$el.find('.sked-tape__event-row').filter(function () {
        return $(this).data('locationId') == event.location;
      });
      if ($eventRow.length) {
        this.$dummyEvent.appendTo($eventRow);
      }
    }
  },
  updateEvent: function updateEvent(eventId) {
    var event = this.getEvent(eventId);
    var $oldEvent = this.$timeline.find('.sked-tape__event').filter(function () {
      return $(this).data('eventId') == eventId;
    });
    if (event && $oldEvent.length) {
      var $newEvent = this.renderEvent(event);
      $oldEvent.replaceWith($newEvent);
    } else {
      // Adding an event (or removal one of them) entails rendering some
      // other entities like time markers between events. We don't
      // bother with that here and just rerender the entire component.
      this.update();
    }
  },
  renderEvent: function renderEvent(event) {
    // Create event node
    if (event.url && !event.disabled) {
      var $event = $('<a/>').attr('href', event.url);
    } else {
      var $event = $('<div/>');
    }
    $event.addClass('sked-tape__event');
    if (event.className) {
      $event.addClass(event.className);
    }

    // Apply the style
    var css = $.extend({}, event.style, {
      width: this.computeEventWidth(event),
      left: this.computeEventOffset(event)
    });
    $event.toggleClass('sked-tape__event--disabled', !!event.disabled).toggleClass('sked-tape__event--active', !!event.active).attr('title', event.name).css(css);
    // Append the center aligner node with text context
    var $center = $('<div class="sked-tape__center"/>').text(event.name).appendTo($event);
    if (this.showEventTime || this.showEventDuration) {
      var html = $center.html();
      var duration = this.format.roundDuration(event.end - event.start);
      if (this.showEventTime) {
        html += '<br>' + this.format.time(event.start) + ' - ' + this.format.time(new Date(event.start.getTime() + duration));
      }
      if (this.showEventDuration) {
        html += '<br>' + this.format.duration(duration);
      }
      $center.html(html);
    }
    // Bind data-*
    $event.data($.extend({}, {
      eventId: event.id
    }, event.data));
    // Measure minimum content width to detect whether to attach popover further
    var $loose = $event.clone().css({
      width: '',
      left: '-10000px',
      top: '-10000px'
    }).appendTo(document.body);
    $event.data('min-width', $loose.outerWidth());
    $loose.remove();
    // Execute the hook
    this.postRenderEvent($event, event);
    return $event;
  },
  computeEventWidth: function computeEventWidth(event) {
    // Clamp to timeline edge
    var eventEnd = this.end < event.end ? this.end : event.end;
    var durationHours = getDurationHours(event.start, eventEnd);
    return durationHours / getDurationHours(this.start, this.end) * 100 + '%';
  },
  computeEventOffset: function computeEventOffset(event) {
    var hoursBeforeEvent = getDurationHours(this.start, event.start);
    return hoursBeforeEvent / getDurationHours(this.start, this.end) * 100 + '%';
  },
  updateTimeIndicatorsPos: function updateTimeIndicatorsPos() {
    var start = this.start.getTime();
    var end = this.end.getTime();
    var utcNow = new Date().getTime();
    Object.keys(this.timeIndicators).forEach(function (locationId) {
      var location = this.getLocation(locationId);
      var tzOffset = location.tzOffset === undefined ? this.tzOffset : location.tzOffset;
      var tzDiff = tzOffset - CURRENT_TZ_OFFSET;
      var now = utcNow - tzDiff * MS_PER_MINUTE;
      var $timeIndicator = this.timeIndicators[locationId];
      if (now >= start && now <= end) {
        var offset = 100 * (now - start) / (end - start) + '%';
        $timeIndicator.show().css('left', offset);
      } else {
        $timeIndicator.hide();
      }
    }, this);
  },
  /**
   * A helper might be required by the client to find out whether the tape
   * has intersecting events.
   */
  hasIntersections: function hasIntersections() {
    var eventA, eventB, j;
    for (var i = 0; i < this.events.length; i++) {
      eventA = this.events[i];
      for (j = i + 1; j < this.events.length; j++) {
        eventB = this.events[j];
        if (eventA.location === eventB.location && findIntersection(eventA, eventB)) {
          return true;
        }
      }
    }
    return false;
  },
  /**
   * Returns event intersection list for a specified location.
   */
  getIntersections: function getIntersections(location) {
    var intersections = [];
    var occupied = function occupied(intersection) {
      for (var i = 0; i < intersections.length; ++i) {
        if (intersection.start.getTime() == intersections[i].start.getTime() && intersection.end.getTime() == intersections[i].end.getTime()) {
          return true;
        }
      }
      return false;
    };
    $.each(this.events, $.proxy(function (i, iEvent) {
      if (iEvent.location != location) {
        return; // Skip all the events of the other locations
      }
      for (var j = i + 1; j < this.events.length; ++j) {
        var jEvent = this.events[j];
        if (jEvent.location != location) {
          continue; // Skip all the events of the other locations
        }
        var intersection = findIntersection(iEvent, jEvent);
        if (intersection && !occupied(intersection)) {
          // Intersection found and the exact time
          // is unique (for rendering optimization purposes)
          intersection.events = [iEvent, jEvent];
          intersections.push(intersection);
        }
      }
    }, this));
    return intersections;
  },
  destroy: function destroy() {
    this.cleanup();
    this.$el.off().empty().removeClass('sked-tape sked-tape--has-dates');
  },
  cleanup: function cleanup() {
    if ($.fn.popover) {
      this.$el.find('.sked-tape__event').popover(TWBS_MAJOR >= 4 ? 'dispose' : 'destroy');
    }
    if (this.indicatorTimeout) {
      clearInterval(this.indicatorTimeout);
      delete this.indicatorTimeout;
    }
  },
  render: function render(opts) {
    var oldScrollLeft = opts && opts.preserveScroll && this.$frame && this.$frame.scrollLeft();
    this.cleanup();
    this.$el.empty().addClass('sked-tape');
    if (this.showDates) {
      this.$el.addClass('sked-tape--has-dates');
    }
    this.renderAside();
    this.renderTimeWrap(oldScrollLeft);
    this.updateTimeIndicatorsPos();
    this.indicatorTimeout = setInterval($.proxy(function () {
      this.updateTimeIndicatorsPos();
    }, this), 1000);
    setTimeout($.proxy(function () {
      var bodyClass = TWBS_MAJOR >= 4 ? 'body' : 'content';
      var template = '<div class="popover" role="tooltip">' + '<div class="arrow"></div>' + '<div class="popover-' + bodyClass + '"></div>' + '</div>';
      this.$el.find('.sked-tape__event').each($.proxy(function (i, el) {
        var $entry = $(el);
        var tooSmall = $entry.width() < $entry.data('min-width');
        var left = parseFloat($entry[0].style.left);
        var right = left + parseFloat($entry[0].style.width);
        var TOLERANCE = 0.01;
        var overflows = left < -TOLERANCE || right > 100 + TOLERANCE;
        if ($.fn.popover && this.showPopovers !== 'never' && (tooSmall || overflows || this.showPopovers === 'always')) {
          $entry.popover({
            trigger: 'hover',
            content: $entry.find('.sked-tape__center').html(),
            html: true,
            template: template,
            placement: left < 50 ? 'right' : 'left'
          });
        }
      }, this));
    }, this), 0);
    return this;
  },
  update: function update() {
    return this.render({
      preserveScroll: true
    });
  },
  updateUnlessOption: function updateUnlessOption(opts) {
    var requested = !opts || opts.update === undefined || opts.update;
    return this.$timeline && requested ? this.update() : this;
  },
  setSnapToMins: function setSnapToMins(mins) {
    this.snapToMins = mins;
  },
  findEventsAtTime: function findEventsAtTime(date, locationId) {
    var time = date.getTime();
    var events = [];
    $.each(this.getEvents(), function (i, event) {
      if (event.location == locationId && event.start.getTime() <= time && event.end.getTime() >= time) {
        events.push(event);
      }
    });
    return events;
  },
  pick: function pick(e) {
    var scalar = (e.pageX - this.$timeline.offset().left) / this.$timeline.width();
    var time = this.start.getTime() + scalar * (this.end.getTime() - this.start.getTime());
    var locationId;
    this.$el.find('.sked-tape__event-row').each(function () {
      var top = $(this).offset().top;
      var bottom = top + $(this).height();
      if (e.pageY >= top && e.pageY <= bottom) {
        locationId = $(this).data('locationId');
        return false;
      }
    });
    return {
      locationId: locationId,
      date: new Date(Math.round(time))
    };
  },
  makeMouseEvent: function makeMouseEvent(type, e, props) {
    return $.Event(type, $.extend({}, props, {
      relatedTarget: e.currentTarget,
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX: e.offsetX,
      offsetY: e.offsetY,
      pageX: e.pageX,
      pageY: e.pageY,
      screenX: e.screenX,
      screenY: e.screenY,
      detail: $.extend(this.pick(e), props.detail)
    }));
  },
  dragEvent: function dragEvent(eventId, e) {
    e = e || {};
    // Skip if some event is being dragged right now
    if (this.isAdding()) return;
    var event = this.getEvent(eventId);
    // Make sure the event is allowed to be draggable
    var jqEvent = this.makeMouseEvent('event:dragStart.skedtape', e, {
      detail: {
        component: this,
        event: event
      }
    });
    this.$el.trigger(jqEvent, [this]);
    if (!jqEvent.isDefaultPrevented()) {
      // Emit an event delete event
      var jqEvent = this.makeMouseEvent('event:dragStarted.skedtape', e, {
        detail: {
          component: this,
          event: event
        }
      });
      this.$el.trigger(jqEvent, [this]);
      // Remove it from the timeline and begin positioning
      this.removeEvent(eventId);
      this.startAdding({
        id: event.id,
        name: event.name,
        duration: event.end.getTime() - event.start.getTime(),
        userData: $.extend({}, event.userData || {}),
        draggedEvent: event
      });
    }
  },
  handleEventClick: function handleEventClick(e) {
    var eventId = $(e.currentTarget).data('eventId');
    var event = this.getEvent(eventId);
    if (this.isEditMode()) {
      this.dragEvent(eventId, e);
    } else {
      // Emit an event click event
      var jqEvent = this.makeMouseEvent('event:click.skedtape', e, {
        detail: {
          component: this,
          event: event
        }
      });
      this.$el.trigger(jqEvent, [this]);
    }
  },
  handleEventContextMenu: function handleEventContextMenu(e) {
    e.preventDefault();
    if (this.rmbCancelsAdding && this.isAdding()) {
      return this.cancelAdding();
    }
    var eventId = $(e.currentTarget).data('eventId');
    var event = this.getEvent(eventId);
    var jqEvent = this.makeMouseEvent('event:contextmenu.skedtape', e, {
      detail: {
        component: this,
        event: event
      }
    });
    this.$el.trigger(jqEvent, [this]);
  },
  handleIntersectionClick: function handleIntersectionClick(e) {
    var jqEvent = this.makeMouseEvent('intersection:click.skedtape', e, {
      detail: {
        component: this
      }
    });
    var detail = jqEvent.detail;
    detail.events = this.findEventsAtTime(detail.date, detail.locationId);
    this.$el.trigger(jqEvent, [this]);
  },
  handleIntersectionContextMenu: function handleIntersectionContextMenu(e) {
    e.preventDefault();
    if (this.rmbCancelsAdding && this.isAdding()) {
      return this.cancelAdding();
    }
    var jqEvent = this.makeMouseEvent('intersection:contextmenu.skedtape', e, {
      detail: {
        component: this
      }
    });
    var detail = jqEvent.detail;
    detail.events = this.findEventsAtTime(detail.date, detail.locationId);
    this.$el.trigger(jqEvent, [this]);
  },
  completeAdding: function completeAdding(e) {
    var event = this.dummyEvent;
    // Check for collisions
    if (this.collide(event)) {
      var jqEvent = this.makeMouseEvent('event:dragEndRefused.skedtape', e, {
        detail: {
          component: this,
          event: event
        }
      });
      this.$el.trigger(jqEvent, [this]);
      return;
    }
    // Emit the event coming before actual addition
    var jqEvent = this.makeMouseEvent('event:dragEnd.skedtape', e, {
      detail: {
        component: this,
        event: event
      }
    });
    this.$el.trigger(jqEvent, [this]);
    // Add event if the operation hasn't been canceled by any event handler
    if (!jqEvent.isDefaultPrevented()) {
      // At this step there something may have changed by
      // the callback above, so do the collision check again.
      try {
        var newEvent = this.addEvent(event, {
          preserveId: true,
          update: true
        });
        delete event.duration;
        delete this.dummyEvent;
        this.$dummyEvent.remove();
        delete this.$dummyEvent;
        var jqEvent = this.makeMouseEvent('event:dragEnded.skedtape', e, {
          detail: {
            component: this,
            event: newEvent
          }
        });
        this.$el.trigger(jqEvent, [this]);
        this.rerenderLocations();
      } catch (e) {
        if (e.name !== 'SkedTape.CollisionError') {
          throw e;
        }
        var jqEvent = this.makeMouseEvent('event:dragEndRefused.skedtape', e, {
          detail: {
            component: this,
            event: event
          }
        });
        this.$el.trigger(jqEvent, [this]);
      }
    }
  },
  handleTimelineClick: function handleTimelineClick(e) {
    if (eventFromEvent(e)) return;
    if (this.isAdding()) {
      if (this.dummyEvent.location) {
        this.completeAdding(e);
      }
    } else {
      var jqEvent = this.makeMouseEvent('timeline:click.skedtape', e, {
        detail: {
          component: this
        }
      });
      this.$el.trigger(jqEvent, [this]);
    }
  },
  handleTimelineContextMenu: function handleTimelineContextMenu(e) {
    if (eventFromEvent(e)) return;
    e.preventDefault();
    if (this.rmbCancelsAdding && this.isAdding()) {
      return this.cancelAdding();
    }
    var jqEvent = this.makeMouseEvent('timeline:contextmenu.skedtape', e, {
      detail: {
        component: this
      }
    });
    this.$el.trigger(jqEvent, [this]);
  },
  /**
   * Mutates dummyEvent to conform a position info.
   *
   * @param {object} picked The position info returned by the pick() function.
   */
  moveDummyEvent: function moveDummyEvent(picked) {
    var event = this.dummyEvent;
    var start = picked.date;
    if (this.snapToMins) {
      var hr = floorHours(start);
      var left = (start.getTime() - hr.getTime()) / MS_PER_MINUTE;
      var lower = Math.floor(left / this.snapToMins) * this.snapToMins;
      var min = left - lower < this.snapToMins / 2 ? lower : lower + this.snapToMins;
      start = new Date(hr.getTime() + Math.round(min * MS_PER_MINUTE));
    }
    $.extend(event, {
      start: start,
      end: new Date(start.getTime() + event.duration)
    });
    if (picked.locationId) {
      var location = this.getLocation(picked.locationId);
      if (this.canAddIntoLocation(location, event)) {
        this.beforeAddIntoLocation(location, event);
        event.location = picked.locationId;
      }
    }
  },
  handleMouseMove: function handleMouseMove(e) {
    this.lastPicked = this.pick(e);
    if (!this.isAdding()) return;
    this.moveDummyEvent(this.lastPicked);
    this.updateDummyEvent();
  },
  handleKeyDown: function handleKeyDown(e) {
    if (e.key === '+') {
      this.zoomIn();
    } else if (e.key === '-') {
      this.zoomOut();
    }
  },
  handleWheel: function handleWheel(e) {
    if (e.ctrlKey) {
      if (e.originalEvent.deltaY < 0) {
        this.zoomIn();
      } else {
        this.zoomOut();
      }
      return false;
    } else if (!e.shiftKey && this.scrollWithYWheel) {
      var delta = e.originalEvent.deltaY > 0 ? 1 : -1;
      delta *= this.$frame.width() * 0.9;
      if (this.$frame.queue().length) {
        var scrollLeft = this.$frame.scrollLeft();
        delta += this.$frame.finish().scrollLeft() - scrollLeft;
        this.$frame.scrollLeft(scrollLeft);
      }
      this.$frame.animate({
        scrollLeft: '+=' + delta
      }, 200);
      return false;
    }
  }
};
_SkedTape.CollisionError = function (id) {
  this.message = 'Collision with entry #' + id;
  this.eventId = id;
  // Use V8's native method if available, otherwise fallback
  if ("captureStackTrace" in Error) Error.captureStackTrace(this, _SkedTape.CollisionError);else this.stack = new Error().stack;
};
_SkedTape.CollisionError.prototype = Object.create(Error.prototype);
_SkedTape.CollisionError.prototype.name = "SkedTape.CollisionError";
_SkedTape.CollisionError.prototype.constructor = _SkedTape.CollisionError;
var TWBS_MAJOR = $.fn.popover ? parseInt($.fn.popover.Constructor.VERSION.charAt(0), 10) : 0;
var SECS_PER_DAY = 24 * 60 * 60;
var MS_PER_DAY = SECS_PER_DAY * 1000;
var MS_PER_MINUTE = 60 * 1000;
var MS_PER_HOUR = 60 * MS_PER_MINUTE;
var SHORT_DURATION = 2 * MS_PER_HOUR - 1; // < this ? .sked-tape__date--short

function eventFromEvent(e) {
  return !!$(e.target).closest('.sked-tape__event, .sked-tape__intersection').length;
}
function isValidTimeRange(start, end) {
  var correctTypes = start instanceof Date && end instanceof Date;
  var correctOrder = start <= end;
  return correctTypes && correctOrder;
}
function getDurationHours(start, end) {
  return (end.getTime() - start.getTime()) / 1000 / 60 / 60;
}
function getMsFromMidnight(d) {
  var secs = d.getHours() * 60 * 60 + d.getMinutes() * 60 + d.getSeconds();
  return secs * 1000 + d.getMilliseconds();
}
function getMsToMidnight(d) {
  return MS_PER_DAY - getMsFromMidnight(d);
}
function getMidnightAfter(d) {
  d = new Date(d);
  d.setTime(d.getTime() + getMsToMidnight(d));
  return d;
}
function getMidnightBefore(d) {
  d = new Date(d);
  d.setTime(d.getTime() - getMsFromMidnight(d));
  return d;
}
function gapBetween(a, b) {
  var min = a.start < b.start ? a : b;
  var max = min === a ? b : a;
  return max.start - min.end;
}
function floorHours(date) {
  var floor = new Date(date);
  floor.setHours(date.getHours(), 0, 0, 0);
  return floor;
}
function ceilHours(date) {
  var floor = floorHours(date);
  if (floor < date) {
    // not equal
    floor.setTime(floor.getTime() + MS_PER_HOUR);
  }
  return floor;
}

// ---------------------------- jQuery plugin ----------------------------------

$.fn.skedTape = function (opts) {
  var cmd = opts && (typeof opts === 'string' || opts instanceof String) ? opts : '';
  opts = opts && !cmd && _typeof(opts) === 'object' ? $.extend({}, opts) : {};
  var args = cmd ? Array.prototype.slice.call(arguments, 1) : [];
  return this.each(function () {
    var obj = $(this).data($.fn.skedTape.dataKey);
    if (!obj || !cmd) {
      if (cmd) {
        throw new Error('SkedTape plugin hadn\'t been initialized but used');
      }
      if (obj) {
        obj.destroy();
      }
      var objOpts = $.extend({}, $.fn.skedTape.defaults, opts, {
        el: this
      });
      delete objOpts.locations;
      delete objOpts.events;
      delete objOpts.start;
      delete objOpts.end;
      delete objOpts.deferRender;
      obj = new _SkedTape(objOpts);
      opts.start && opts.end && obj.setTimespan(opts.start, opts.end, {
        update: false
      });
      opts.locations && obj.setLocations(opts.locations, {
        update: false
      });
      opts.events && obj.setEvents(opts.events, {
        update: false,
        allowCollisions: true
      });
      $(this).data($.fn.skedTape.dataKey, obj);
      opts.deferRender || obj.render();
    } else {
      switch (cmd) {
        case 'destroy':
          obj.destroy();
          $(this).removeData($.fn.skedTape.dataKey);
          break;
        default:
          var methods = ['addEvent', 'addEvents', 'removeEvent', 'setEvents', 'removeAllEvents', 'enterEditMode', 'leaveEditMode', 'startAdding', 'cancelAdding', 'setLocations', 'addLocation', 'addLocations', 'removeLocation', 'setTimespan', 'setDate', 'zoomIn', 'zoomOut', 'setZoom', 'resetZoom', 'render', 'setSnapToMins', 'dragEvent', 'updateEvent'];
          if (methods.indexOf(cmd) >= 0) {
            obj[cmd].apply(obj, args);
          } else {
            throw new Error('SkedTape plugin cannot recognize command');
          }
      }
    }
  });
};
function findIntersection(a, b) {
  var min = a.start < b.start ? a : b;
  var max = min == a ? b : a;

  //min ends before max starts -> no intersection
  if (min.end < max.start) {
    return null;
  }
  return {
    start: max.start,
    end: min.end < max.end ? min.end : max.end
  };
}
$.fn.skedTape.dataKey = 'sked-tape';
$.fn.skedTape.format = _SkedTape.defaultFormatters;
$.fn.skedTape.defaults = {
  caption: '',
  maxZoom: 10,
  /**
   * Default zooming up and down increment/decrement value.
   */
  zoomStep: 0.5,
  /**
   * Initial zoom level. Minimum possible value is 1.
   */
  zoom: 1,
  /**
   * Whether to show from-to dates in events.
   */
  showEventTime: false,
  /**
   * Whether to show duration in events.
   */
  showEventDuration: false,
  /**
   * Whether to show dates bar.
   */
  showDates: true,
  /**
   * Minimum time between events required for the user to be able to add an event.
   */
  minGapTimeBetween: 0,
  /**
   * Minimum gap between events to show minutes.
   */
  minTimeGapShown: 1 * MS_PER_MINUTE,
  /**
   * Maximum gap between events to show minutes.
   */
  maxTimeGapShown: 60 * MS_PER_MINUTE - 1,
  /**
   * Minimum gap to DO NOT highlight adjacent events.
   */
  maxTimeGapHi: false,
  /**
   * Enables horizontal timeline scrolling with vertical mouse wheel.
   */
  scrollWithYWheel: false,
  /**
   * Enables sorting of locations.
   */
  sorting: false,
  /**
   * Specifies sorting columns. The property accepts two possible values:
   * 'order' (sorting by the property 'order' provided in location objects)
   * or 'name' (locale-aware case insensitive comparison by name).
   */
  orderBy: 'order',
  /**
   * The number of minutes the dummy event will be snapped to. To
   * disable snapping set any falsy value.
   */
  snapToMins: 1,
  /**
   * Right Mouse Button cancels adding a new event.
   */
  rmbCancelsAdding: true,
  /**
   * Default timezone for locations, takes effect when you don't specify it
   * in location descriptor. The default value is a browser's current timezone.
   */
  tzOffset: CURRENT_TZ_OFFSET,
  /**
   * Enables or disables showing serifs on time indicator lines.
   */
  timeIndicatorSerifs: false,
  /**
   * Enables or disables showing intervals between events.
   */
  showIntermission: false,
  /**
   * Interval (in minutes) between events to show intermission time when it is
   * enabled.
   */
  intermissionRange: [1, 60],
  /**
   * The default behavior is to show pop-ups for events that are either too
   * small to be visible or partially outside the timeline. The possible
   * options are: "default", "always" or "never".
   */
  showPopovers: 'default',
  /**
   * The hook invoked to determine whether an event may be added to a location.
   * The default implementation always returns *true*.
   * You should avoid mutating the arguments in this hook (that may cause
   * unexpected behaviour).
   * 
   * @see beforeAddIntoLocation()
   */
  canAddIntoLocation: function canAddIntoLocation(location, event) {
    return true;
  },
  /**
   * Invoked after getting a positive result from the `canAddIntoLocation()`
   * hook just before updating the event. Here you can place any logic that
   * mutates the event object given.
   * 
   * @see canAddIntoLocation()
   */
  beforeAddIntoLocation: function beforeAddIntoLocation(location, event) {},
  /**
   * The mixin is applied to every location's DOM element when rendering the sidebar.
   * The callback takes 3 arguments: jQuery text element node representing
   * the location, the corresponding location object and a boolean value
   * specifying the result of executing the `canAddIntoLocation()` function on
   * the location and dummy event.
   * The value of the last argument is undefined if the function is called
   * while no event is being dragged.
   */
  postRenderLocation: function postRenderLocation($el, location, canAdd) {
    _SkedTape.prototype.postRenderLocation.call(this, $el, location, canAdd);
  },
  /**
   * The mixin applied to every event DOM element on the timeline after
   * rendering is complete and before actual inserting to the DOM tree of the
   * document. The default implementation does nothing, you may feel free to
   * replace it with your own code that modifies the default representation of
   * events on a timeline.
   */
  postRenderEvent: function postRenderEvent($event, event) {}
};
$.skedTape = function (opts) {
  return $('<div/>').skedTape($.extend({}, opts || {}, {
    deferRender: true
  }));
};