import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectionDateFor,
  nextReviewStatus,
  validatePublicationSelection,
} from './designer';

test('collectionDateFor groups UTC timestamps by the India working day', () => {
  assert.equal(collectionDateFor(new Date('2026-07-13T20:00:00.000Z')), '2026-07-14');
});

test('nextReviewStatus allows corrections until a post is published', () => {
  assert.equal(nextReviewStatus('PENDING', 'approve', false), 'APPROVED');
  assert.equal(nextReviewStatus('APPROVED', 'reject', false), 'REJECTED');
  assert.throws(
    () => nextReviewStatus('APPROVED', 'reject', true),
    /Published posts cannot be reviewed/,
  );
});

test('publication selection accepts one approved rendered post', () => {
  assert.deepEqual(
    validatePublicationSelection([
      { id: 'one', reviewStatus: 'APPROVED', imageUrl: 'posts/one/final.png', collectionDate: '2026-07-13', locked: false },
    ]),
    { format: 'SINGLE_IMAGE', collectionDate: '2026-07-13' },
  );
});

test('publication selection rejects exactly two posts', () => {
  assert.throws(
    () => validatePublicationSelection([
      { id: 'one', reviewStatus: 'APPROVED', imageUrl: 'one.png', collectionDate: '2026-07-13', locked: false },
      { id: 'two', reviewStatus: 'APPROVED', imageUrl: 'two.png', collectionDate: '2026-07-13', locked: false },
    ]),
    /Select one post or at least three posts/,
  );
});

test('publication selection enforces LinkedIn document page limits', () => {
  assert.throws(
    () => validatePublicationSelection(Array.from({ length: 301 }, (_, index) => ({
      id: String(index), reviewStatus: 'APPROVED', imageUrl: `${index}.png`,
      collectionDate: '2026-07-13', locked: false,
    }))),
    /at most 300 pages/,
  );
});

test('publication selection accepts three approved posts from one collection in supplied order', () => {
  assert.deepEqual(
    validatePublicationSelection([
      { id: 'third', reviewStatus: 'APPROVED', imageUrl: '3.png', collectionDate: '2026-07-13', locked: false },
      { id: 'first', reviewStatus: 'APPROVED', imageUrl: '1.png', collectionDate: '2026-07-13', locked: false },
      { id: 'second', reviewStatus: 'APPROVED', imageUrl: '2.png', collectionDate: '2026-07-13', locked: false },
    ]),
    { format: 'PDF_DOCUMENT', collectionDate: '2026-07-13' },
  );
});

test('publication selection rejects mixed daily collections and unavailable posts', () => {
  assert.throws(
    () => validatePublicationSelection([
      { id: 'one', reviewStatus: 'APPROVED', imageUrl: '1.png', collectionDate: '2026-07-13', locked: false },
      { id: 'two', reviewStatus: 'APPROVED', imageUrl: '2.png', collectionDate: '2026-07-14', locked: false },
      { id: 'three', reviewStatus: 'APPROVED', imageUrl: '3.png', collectionDate: '2026-07-13', locked: false },
    ]),
    /same daily collection/,
  );

  assert.throws(
    () => validatePublicationSelection([
      { id: 'one', reviewStatus: 'REJECTED', imageUrl: '1.png', collectionDate: '2026-07-13', locked: false },
    ]),
    /approved and fully rendered/,
  );
});
