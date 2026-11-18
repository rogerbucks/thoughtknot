// The rules for keeping a picture beside a note (editor spec ES§45, board_images_kept).
// What a picture is by its first bytes. The name it is kept under. The folder and size that bound it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  PICTURE_BODY_LIMIT,
  PICTURE_FOLDER,
  PICTURE_MOST_BYTES,
  isKeptName,
  pictureKind,
  pictureName,
  pictureStem,
} from '../src/index.ts';

const bytes = (...b) => new Uint8Array(b);
const text = (s) => new TextEncoder().encode(s);

describe('a picture is known by its first bytes alone', () => {
  // proves: board_images_kept
  test('a PNG, a JPEG, a GIF of either year and a WebP are each known, and nothing else is', () => {
    assert.deepEqual(pictureKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1)), {
      ending: 'png',
      type: 'image/png',
    });
    assert.equal(pictureKind(bytes(0xff, 0xd8, 0xff, 0xe0))?.type, 'image/jpeg');
    assert.equal(pictureKind(text('GIF87a....'))?.ending, 'gif');
    assert.equal(pictureKind(text('GIF89a....'))?.ending, 'gif');
    assert.equal(pictureKind(text('RIFF\0\0\0\0WEBPVP8 '))?.type, 'image/webp');
    for (const not of [
      text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      text('<!doctype html><script>alert(1)</script>'),
      text('GIF88a'),
      text('RIFF\0\0\0\0WAVEfmt '),
      bytes(0x89, 0x50, 0x4e, 0x47),
      bytes(),
    ])
      assert.equal(pictureKind(not), null);
  });
});

describe('the name a picture is kept under', () => {
  // proves: board_images_kept
  test('is a plain stem of safe marks with one of four endings, never a path or a hidden name', () => {
    assert.equal(pictureStem('My holiday photo (1).PNG'), 'My-holiday-photo-1');
    assert.equal(pictureStem('../../etc/passwd'), 'passwd');
    assert.equal(pictureStem('C:\\Users\\me\\plan.jpeg'), 'plan');
    assert.equal(pictureStem('.hidden'), 'hidden');
    assert.equal(pictureStem('???'), 'picture');
    assert.equal(pictureStem(''), 'picture');
    assert.ok(pictureStem('a'.repeat(500)).length <= 80);
    // Windows reads these as devices whatever their ending, so each is given a word before it
    for (const device of ['CON', 'nul', 'Aux', 'PRN', 'COM1', 'lpt9'])
      assert.equal(pictureStem(`${device}.png`), `picture-${device}`);
    assert.equal(pictureStem('CONSOLE.png'), 'CONSOLE');
    assert.equal(pictureStem('COM10.png'), 'COM10');
    assert.equal(pictureName('plan', 'png', 1), 'plan.png');
    assert.equal(pictureName('plan', 'png', 2), 'plan-2.png');
    assert.equal(isKeptName('plan-2.png'), true);
    for (const bad of ['plan.svg', '.png', 'a/b.png', '..png', 'a b.png', 'plan.png.exe', 'plan', 'a.PNG', ''])
      assert.equal(isKeptName(bad), false, bad);
  });

  // proves: board_images_kept
  test('is kept in a folder named attachments, at most eight million bytes, sent in a request a third larger', () => {
    assert.equal(PICTURE_FOLDER, 'attachments');
    assert.equal(PICTURE_MOST_BYTES, 8_000_000);
    assert.ok(PICTURE_BODY_LIMIT > (PICTURE_MOST_BYTES * 4) / 3);
    assert.ok(PICTURE_BODY_LIMIT < PICTURE_MOST_BYTES * 2);
  });
});
