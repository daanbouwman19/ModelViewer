import { describe, it, expect } from 'vitest';
import {
  countTextures,
  collectTexturesRecursive,
  getAlbumAndChildrenNames,
  selectAllAlbums,
} from '../../../src/renderer/utils/albumUtils';

describe('albumUtils', () => {
  const mockAlbum = {
    name: 'root',
    textures: [
      { name: 'root1.jpg', path: '/root1.jpg' },
      { name: 'root2.jpg', path: '/root2.jpg' },
    ],
    children: [
      {
        name: 'child1',
        textures: [{ name: 'child1.jpg', path: '/child1.jpg' }],
        children: [
          {
            name: 'grandchild',
            textures: [{ name: 'grandchild.jpg', path: '/grandchild.jpg' }],
            children: [],
          },
        ],
      },
      {
        name: 'child2',
        textures: [{ name: 'child2.jpg', path: '/child2.jpg' }],
        children: [],
      },
    ],
  };

  describe('countTextures', () => {
    it('should recursively count all textures in an album and its children', () => {
      expect(countTextures(mockAlbum)).toBe(5);
    });

    it('should return 0 for an album with no textures and no children', () => {
      const emptyAlbum = { name: 'empty', textures: [], children: [] };
      expect(countTextures(emptyAlbum)).toBe(0);
    });

    it('should count textures even if a child album has no textures but grandchildren do', () => {
      const album = {
        name: 'root',
        textures: [],
        children: [
          {
            name: 'child',
            textures: [],
            children: [
              {
                name: 'grandchild',
                textures: [{ name: 'gc.jpg', path: 'gc.jpg' }],
                children: [],
              },
            ],
          },
        ],
      };
      expect(countTextures(album)).toBe(1);
    });

    it('should handle albums with undefined children property', () => {
      const album = { name: 'leaf', textures: [{ name: 'img.jpg' }] };

      expect(countTextures(album as any)).toBe(1);
    });
  });

  describe('collectTexturesRecursive', () => {
    it('should recursively collect all textures from an album and its children', () => {
      const textures = collectTexturesRecursive(mockAlbum);
      expect(textures).toHaveLength(5);
      expect(textures.map((t) => t.name)).toEqual(
        expect.arrayContaining([
          'root1.jpg',
          'root2.jpg',
          'child1.jpg',
          'grandchild.jpg',
          'child2.jpg',
        ]),
      );
    });

    it('should return an empty array for an album with no textures', () => {
      const emptyAlbum = { name: 'empty', textures: [], children: [] };
      const textures = collectTexturesRecursive(emptyAlbum);
      expect(textures).toHaveLength(0);
    });

    it('should handle albums with undefined children property', () => {
      const album = { name: 'leaf', textures: [{ name: 'img.jpg' }] };

      const textures = collectTexturesRecursive(album as any);
      expect(textures).toHaveLength(1);
      expect(textures[0].name).toBe('img.jpg');
    });
  });

  describe('getAlbumAndChildrenNames', () => {
    it('should return a flat array of the album name and all its childrens names', () => {
      const names = getAlbumAndChildrenNames(mockAlbum);
      expect(names).toEqual(['root', 'child1', 'grandchild', 'child2']);
    });

    it('should return just the album name if there are no children', () => {
      const simpleAlbum = { name: 'simple', textures: [], children: [] };
      const names = getAlbumAndChildrenNames(simpleAlbum);
      expect(names).toEqual(['simple']);
    });

    it('should handle undefined children property', () => {
      const simpleAlbum = { name: 'simple', textures: [] };

      const names = getAlbumAndChildrenNames(simpleAlbum as any);
      expect(names).toEqual(['simple']);
    });
  });

  describe('selectAllAlbums', () => {
    it('should recursively select an album and all its children to true', () => {
      const selection = {};
      selectAllAlbums([mockAlbum], selection, true);
      expect(selection).toEqual({
        root: true,
        child1: true,
        grandchild: true,
        child2: true,
      });
    });

    it('should recursively select an album and all its children to false', () => {
      const selection = {
        root: true,
        child1: true,
        grandchild: true,
        child2: true,
      };
      selectAllAlbums([mockAlbum], selection, false);
      expect(selection).toEqual({
        root: false,
        child1: false,
        grandchild: false,
        child2: false,
      });
    });

    it('should not affect other albums in the selection', () => {
      const selection = { other: true };
      selectAllAlbums([mockAlbum], selection, true);
      expect(selection).toEqual({
        other: true,
        root: true,
        child1: true,
        grandchild: true,
        child2: true,
      });
    });

    it('should handle undefined children property', () => {
      const album = { name: 'leaf', textures: [] };
      const selection = {};

      selectAllAlbums([album as any], selection, true);
      expect(selection).toEqual({ leaf: true });
    });
  });
});
