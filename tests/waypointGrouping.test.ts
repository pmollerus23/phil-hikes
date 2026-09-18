import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldGroupWaypoints } from '../src/features/map/waypointGrouping';

test('groups compact trips while keeping spread-out and single waypoints individual', () => {
  assert.equal(shouldGroupWaypoints([]), false);
  assert.equal(shouldGroupWaypoints([{ x: 0, y: 0 }]), false);
  assert.equal(shouldGroupWaypoints([{ x: 0, y: 0 }, { x: 20, y: 20 }]), true);
  assert.equal(shouldGroupWaypoints([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 100 }]), false);
});

test('keeps the current grouping near the transition to avoid flickering', () => {
  const points = [{ x: 0, y: 0 }, { x: 70, y: 0 }];
  assert.equal(shouldGroupWaypoints(points), false);
  assert.equal(shouldGroupWaypoints(points, true), true);
  assert.equal(shouldGroupWaypoints([{ x: 0, y: 0 }, { x: 80, y: 0 }], true), false);
});
