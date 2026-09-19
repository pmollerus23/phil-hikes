import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutTripFlags, MAX_TRIP_FLAG_REACH, TRIP_FLAG_FULL_SIZE_ZOOM, TRIP_FLAG_HEIGHT, TRIP_FLAG_MIN_SCALE, tripFlagScale, type TripFlagLayoutItem } from '../src/features/map/tripFlagLayout';

function rect(item: TripFlagLayoutItem, offset: { x: number; y: number }, scale = 1) {
  const centerX = item.anchor.x + offset.x;
  const centerY = item.anchor.y + offset.y;
  return { left: centerX - (item.width * scale) / 2, right: centerX + (item.width * scale) / 2, top: centerY - (TRIP_FLAG_HEIGHT * scale) / 2, bottom: centerY + (TRIP_FLAG_HEIGHT * scale) / 2 };
}

function overlaps(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('stacks trip flags above a shared route area without label overlap', () => {
  const items = ['a', 'b', 'c'].map(id => ({ id, anchor: { x: 350, y: 250 }, width: 120 }));
  const layout = layoutTripFlags(items, { width: 700, height: 500 });
  assert.ok(items.every(item => !layout[item.id].hidden));
  // Every leader rises north from its pin: labels sit above their anchor.
  assert.ok(items.every(item => layout[item.id].y < 0));
  // Stacked labels share the centered pole and separate vertically.
  assert.deepEqual(items.map(item => layout[item.id].x), [0, 0, 0]);
  const heights = items.map(item => layout[item.id].y);
  assert.equal(new Set(heights).size, items.length);
  assert.ok([...heights].sort((a, b) => a - b).every((y, index, sorted) => index === 0 || y - sorted[index - 1] >= TRIP_FLAG_HEIGHT));
  const boxes = items.map(item => rect(item, layout[item.id]));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false);
  }
  assert.ok(items.every(item => Math.hypot(layout[item.id].x, layout[item.id].y) <= MAX_TRIP_FLAG_REACH));
});

test('declutters labels when a cluster is too dense for short leaders', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: `trip-${index}`, anchor: { x: 350, y: 250 }, width: 150 }));
  const layout = layoutTripFlags(items, { width: 700, height: 500 });
  const visible = items.filter(item => !layout[item.id].hidden);
  assert.ok(visible.length >= 3 && visible.length < items.length);
  assert.ok(visible.every(item => layout[item.id].y < 0));
  assert.ok(visible.every(item => Math.hypot(layout[item.id].x, layout[item.id].y) <= MAX_TRIP_FLAG_REACH));
  const boxes = visible.map(item => rect(item, layout[item.id]));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false);
  }
});

test('keeps labels inside the viewport and away from interface obstacles', () => {
  const item = { id: 'edge', anchor: { x: 45, y: 140 }, width: 110 };
  const obstacle = { left: 0, top: 90, right: 180, bottom: 125 };
  const layout = layoutTripFlags([item], { width: 400, height: 300 }, [obstacle]);
  assert.equal(layout.edge.hidden, undefined);
  assert.ok(layout.edge.y < 0);
  const box = rect(item, layout[item.id]);
  assert.ok(box.left >= 8 && box.right <= 392 && box.top >= 8 && box.bottom <= 292);
  assert.equal(overlaps(box, obstacle), false);
  // The default spot sits inside the obstacle, so the packer moves above it.
  assert.notDeepEqual({ x: layout.edge.x, y: layout.edge.y }, { x: 0, y: -34 });
});

test('gives a priority label the preferred position in a collision cluster', () => {
  const items = [
    { id: 'other', anchor: { x: 200, y: 200 }, width: 100 },
    { id: 'selected', anchor: { x: 200, y: 200 }, width: 100, priority: true },
  ];
  const layout = layoutTripFlags(items, { width: 500, height: 400 });
  assert.deepEqual(layout.selected, { x: 0, y: -34 });
  assert.notDeepEqual(layout.other, layout.selected);
});

test('keeps a valid prior position stable as projected anchors move during zoom', () => {
  const viewport = { width: 700, height: 500 };
  const firstItems = [
    { id: 'a', anchor: { x: 330, y: 250 }, width: 120 },
    { id: 'b', anchor: { x: 350, y: 250 }, width: 120 },
    { id: 'c', anchor: { x: 370, y: 250 }, width: 120 },
  ];
  const first = layoutTripFlags(firstItems, viewport);
  const zoomedItems = firstItems.map((item, index) => ({ ...item, anchor: { x: 320 + index * 30, y: 250 } }));
  const zoomed = layoutTripFlags(zoomedItems, viewport, [], first);
  for (const item of firstItems) assert.deepEqual(zoomed[item.id], first[item.id]);
});

test('retains a valid non-default callout offset instead of snapping back', () => {
  const item = { id: 'trip', anchor: { x: 250, y: 200 }, width: 100 };
  const previous = { trip: { x: 68, y: -34 } };
  assert.deepEqual(layoutTripFlags([item], { width: 500, height: 400 }, [], previous), previous);
});

test('rejects a stale below-pin offset and reseeds above the pin', () => {
  const item = { id: 'trip', anchor: { x: 250, y: 200 }, width: 100 };
  const layout = layoutTripFlags([item], { width: 500, height: 400 }, [], { trip: { x: 88, y: 18 } });
  assert.ok(layout.trip.y < 0);
});

test('callout scale stays full at close zooms and shrinks to a floor when zoomed out', () => {
  assert.equal(tripFlagScale(TRIP_FLAG_FULL_SIZE_ZOOM), 1);
  assert.equal(tripFlagScale(TRIP_FLAG_FULL_SIZE_ZOOM + 3), 1);
  const oneOut = tripFlagScale(TRIP_FLAG_FULL_SIZE_ZOOM - 1);
  const twoOut = tripFlagScale(TRIP_FLAG_FULL_SIZE_ZOOM - 2);
  assert.ok(oneOut < 1 && twoOut < oneOut);
  assert.equal(tripFlagScale(-2), TRIP_FLAG_MIN_SCALE);
  assert.equal(tripFlagScale(Number.NaN), 1);
});

test('packs shrunken callouts against their rendered size at low zoom', () => {
  const scale = tripFlagScale(3);
  assert.ok(scale < 1);
  const items = ['a', 'b', 'c'].map(id => ({ id, anchor: { x: 350, y: 250 }, width: 120 }));
  const layout = layoutTripFlags(items, { width: 700, height: 500 }, [], {}, scale);
  assert.ok(items.every(item => !layout[item.id].hidden && layout[item.id].y < 0));
  assert.ok(items.every(item => Math.hypot(layout[item.id].x, layout[item.id].y) <= MAX_TRIP_FLAG_REACH));
  const boxes = items.map(item => rect(item, layout[item.id], scale));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false);
  }
});
