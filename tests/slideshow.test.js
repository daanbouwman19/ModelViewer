/**
 * @jest-environment jsdom
 * @file Unit tests for the slideshow logic.
 */
import {
  shuffleArray,
  selectWeightedRandom,
  generatePlaylistForIndividualModel,
} from '../renderer/slideshow.js';

describe('slideshow.js', () => {
  describe('shuffleArray', () => {
    it('should return a new array with the same elements in a different order', () => {
      const originalArray = [1, 2, 3, 4, 5];
      const shuffledArray = shuffleArray(originalArray);
      expect(shuffledArray).toHaveLength(originalArray.length);
      expect(shuffledArray.sort()).toEqual(originalArray.sort());
    });

    it('should not mutate the original array', () => {
      const originalArray = [1, 2, 3, 4, 5];
      const originalArrayCopy = [...originalArray];
      shuffleArray(originalArray);
      expect(originalArray).toEqual(originalArrayCopy);
    });
  });

  describe('selectWeightedRandom', () => {
    it('should select items with higher weight more often', () => {
      const items = [
        { path: 'a', viewCount: 100 },
        { path: 'b', viewCount: 0 },
      ];
      const selections = { a: 0, b: 0 };
      for (let i = 0; i < 100; i++) {
        const selected = selectWeightedRandom(items);
        selections[selected.path]++;
      }
      expect(selections['b']).toBeGreaterThan(selections['a']);
    });

    it('should handle items with no view count', () => {
      const items = [{ path: 'a' }, { path: 'b' }];
      const selected = selectWeightedRandom(items);
      expect(selected).not.toBeNull();
    });

    it('should return null if items is null or empty', () => {
      expect(selectWeightedRandom(null)).toBeNull();
      expect(selectWeightedRandom([])).toBeNull();
    });
  });

  describe('generatePlaylistForIndividualModel', () => {
    it('should return a shuffled playlist when isRandom is true', () => {
        const mediaPool = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];
        const mockMath = Object.create(global.Math);
        mockMath.random = () => 0.5;
        global.Math = mockMath;
        const playlist = generatePlaylistForIndividualModel(mediaPool, true);
        expect(playlist).toHaveLength(mediaPool.length);
        expect(playlist).not.toEqual(mediaPool);
      });

    it('should return the original playlist when isRandom is false', () => {
      const mediaPool = [{ path: 'a' }, { path: 'b' }, { path: 'c' }];
      const playlist = generatePlaylistForIndividualModel(mediaPool, false);
      expect(playlist).toEqual(mediaPool);
    });
  });
});
