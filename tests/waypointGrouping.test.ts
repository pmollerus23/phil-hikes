import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlappingTripIds, shouldGroupWaypoints, tripAreasOverlap } from '../src/features/map/waypointGrouping';

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

test('overlapping trip areas stay grouped independently of screen spacing', () => {
  const trips = [
    { id: 'a', bounds: [0, 0, 2, 2] as [number, number, number, number] },
    { id: 'b', bounds: [1, 1, 3, 3] as [number, number, number, number] },
    { id: 'c', bounds: [2.5, 2.5, 4, 4] as [number, number, number, number] },
    { id: 'isolated', bounds: [10, 10, 11, 11] as [number, number, number, number] },
    { id: 'missing', bounds: null },
  ];
  assert.deepEqual([...overlappingTripIds(trips)], ['a', 'b', 'c']);
  assert.deepEqual([...overlappingTripIds([trips[0]])], []);
  assert.equal(tripAreasOverlap(trips[0].bounds, trips[2].bounds), false);
  assert.equal(tripAreasOverlap(trips[0].bounds, null), false);
  assert.equal(tripAreasOverlap([0, 0, 1, 1], [1, 1, 2, 2]), true);
});
