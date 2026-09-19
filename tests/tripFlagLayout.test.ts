import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutTripFlags, MAX_TRIP_FLAG_REACH, TRIP_FLAG_HEIGHT, type TripFlagLayoutItem } from '../src/features/map/tripFlagLayout';

function rect(item: TripFlagLayoutItem, offset: { x: number; y: number }) {
  const centerX = item.anchor.x + offset.x;
  const centerY = item.anchor.y + offset.y;
  return { left: centerX - item.width / 2, right: centerX + item.width / 2, top: centerY - TRIP_FLAG_HEIGHT / 2, bottom: centerY + TRIP_FLAG_HEIGHT / 2 };
}

function overlaps(a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('arranges trip flags around a shared route area without label overlap', () => {
  const items = ['a', 'b', 'c', 'd'].map(id => ({ id, anchor: { x: 350, y: 250 }, width: 120 }));
  const layout = layoutTripFlags(items, { width: 700, height: 500 });
  assert.ok(items.every(item => !layout[item.id].hidden));
  const boxes = items.map(item => rect(item, layout[item.id]));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false);
  }
  assert.ok(new Set(Object.values(layout).map(offset => `${offset.x},${offset.y}`)).size > 1);
});

test('declutters labels when a cluster is too dense for short leaders', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: `trip-${index}`, anchor: { x: 350, y: 250 }, width: 150 }));
  const layout = layoutTripFlags(items, { width: 700, height: 500 });
  const visible = items.filter(item => !layout[item.id].hidden);
  assert.ok(visible.length >= 4 && visible.length < items.length);
  assert.ok(visible.every(item => Math.hypot(layout[item.id].x, layout[item.id].y) <= MAX_TRIP_FLAG_REACH));
  const boxes = visible.map(item => rect(item, layout[item.id]));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.equal(overlaps(boxes[i], boxes[j]), false);
  }
});

test('keeps labels inside the viewport and away from interface obstacles', () => {
  const item = { id: 'edge', anchor: { x: 45, y: 40 }, width: 110 };
  const obstacle = { left: 0, top: 0, right: 180, bottom: 65 };
  const layout = layoutTripFlags([item], { width: 400, height: 300 }, [obstacle]);
  const box = rect(item, layout[item.id]);
  assert.ok(box.left >= 8 && box.right <= 392 && box.top >= 8 && box.bottom <= 292);
  assert.equal(overlaps(box, obstacle), false);
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
  const previous = { trip: { x: 88, y: 18 } };
  assert.deepEqual(layoutTripFlags([item], { width: 500, height: 400 }, [], previous), previous);
});
