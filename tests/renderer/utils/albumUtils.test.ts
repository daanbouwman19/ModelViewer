import { describe, it, expect } from 'vitest';
import {
  countTextures,
  collectTexturesRecursive,
  getAlbumAndChildrenIds,
  selectAllAlbums,
  collectSelectedTextures,
  traverseAlbumTree,
} from '../../../src/renderer/utils/albumUtils';
import type { Album } from '../../../src/core/types';

describe('albumUtils', () => {
  const mockAlbum = {
    id: 'root-id',
    name: 'root',
    textures: [
      { name: 'root1.jpg', path: '/root1.jpg' },
      { name: 'root2.jpg', path: '/root2.jpg' },
    ],
    children: [
      {
        id: 'child1-id',
        name: 'child1',
        textures: [{ name: 'child1.jpg', path: '/child1.jpg' }],
        children: [
          {
            id: 'grandchild-id',
            name: 'grandchild',
            textures: [{ name: 'grandchild.jpg', path: '/grandchild.jpg' }],
            children: [],
          },
        ],
      },
      {
        id: 'child2-id',
        name: 'child2',
        textures: [{ name: 'child2.jpg', path: '/child2.jpg' }],
        children: [],
      },
    ],
  } as unknown as Album;

  describe('traverseAlbumTree', () => {
    it('should traverse all nodes in depth-first order', () => {
      const nodes = Array.from(traverseAlbumTree(mockAlbum));
      const ids = nodes.map((n) => n.id);
      expect(ids).toEqual([
        'root-id',
        'child1-id',
        'grandchild-id',
        'child2-id',
      ]);
    });

    it('should handle array input', () => {
      const album2 = { id: 'other-root', children: [] } as unknown as Album;
      const nodes = Array.from(traverseAlbumTree([mockAlbum, album2]));
      const ids = nodes.map((n) => n.id);
      expect(ids).toEqual([
        'root-id',
        'child1-id',
        'grandchild-id',
        'child2-id',
        'other-root',
      ]);
    });
  });

  describe('countTextures', () => {
    it('should recursively count all textures in an album and its children', () => {
      expect(countTextures(mockAlbum)).toBe(5);
    });

    it('should return 0 for an album with no textures and no children', () => {
      const emptyAlbum = {
        id: 'empty',
        name: 'empty',
        textures: [],
        children: [],
      } as unknown as Album;
      expect(countTextures(emptyAlbum)).toBe(0);
    });

    it('should count textures even if a child album has no textures but grandchildren do', () => {
      const album = {
        id: 'root-id',
        name: 'root',
        textures: [],
        children: [
          {
            id: 'child-id',
            name: 'child',
            textures: [],
            children: [
              {
                id: 'gc-id',
                name: 'grandchild',
                textures: [{ name: 'gc.jpg', path: 'gc.jpg' }],
                children: [],
              },
            ],
          },
        ],
      } as unknown as Album;
      expect(countTextures(album)).toBe(1);
    });

    it('should handle albums with undefined children property', () => {
      const album = {
        id: 'leaf-id',
        name: 'leaf',
        textures: [{ name: 'img.jpg' }],
      } as unknown as Album;

      expect(countTextures(album)).toBe(1);
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
      const emptyAlbum = {
        id: 'empty',
        name: 'empty',
        textures: [],
        children: [],
      } as unknown as Album;
      const textures = collectTexturesRecursive(emptyAlbum);
      expect(textures).toHaveLength(0);
    });

    it('should handle albums with undefined children property', () => {
      const album = {
        id: 'leaf-id',
        name: 'leaf',
        textures: [{ name: 'img.jpg' }],
      } as unknown as Album;

      const textures = collectTexturesRecursive(album);
      expect(textures).toHaveLength(1);
      expect(textures[0].name).toBe('img.jpg');
    });
  });

  describe('getAlbumAndChildrenIds', () => {
    it('should return a flat array of the album id and all its childrens ids', () => {
      const ids = getAlbumAndChildrenIds(mockAlbum);
      expect(ids).toEqual([
        'root-id',
        'child1-id',
        'grandchild-id',
        'child2-id',
      ]);
    });

    it('should return just the album id if there are no children', () => {
      const simpleAlbum = {
        id: 'simple-id',
        name: 'simple',
        textures: [],
        children: [],
      } as unknown as Album;
      const ids = getAlbumAndChildrenIds(simpleAlbum);
      expect(ids).toEqual(['simple-id']);
    });

    it('should handle undefined children property', () => {
      const simpleAlbum = {
        id: 'simple-id',
        name: 'simple',
        textures: [],
      } as unknown as Album;

      const ids = getAlbumAndChildrenIds(simpleAlbum);
      expect(ids).toEqual(['simple-id']);
    });
  });

  describe('selectAllAlbums', () => {
    it('should recursively select an album and all its children to true', () => {
      const selection = {};
      selectAllAlbums([mockAlbum], selection, true);
      expect(selection).toEqual({
        'root-id': true,
        'child1-id': true,
        'grandchild-id': true,
        'child2-id': true,
      });
    });

    it('should recursively select an album and all its children to false', () => {
      const selection = {
        'root-id': true,
        'child1-id': true,
        'grandchild-id': true,
        'child2-id': true,
      };
      selectAllAlbums([mockAlbum], selection, false);
      expect(selection).toEqual({
        'root-id': false,
        'child1-id': false,
        'grandchild-id': false,
        'child2-id': false,
      });
    });

    it('should not affect other albums in the selection', () => {
      const selection = { 'other-id': true };
      selectAllAlbums([mockAlbum], selection, true);
      expect(selection).toEqual({
        'other-id': true,
        'root-id': true,
        'child1-id': true,
        'grandchild-id': true,
        'child2-id': true,
      });
    });

    it('should handle undefined children property', () => {
      const album = {
        id: 'leaf-id',
        name: 'leaf',
        textures: [],
      } as unknown as Album;
      const selection = {};

      selectAllAlbums([album], selection, true);
      expect(selection).toEqual({ 'leaf-id': true });
    });
  });

  describe('collectSelectedTextures', () => {
    it('should collect textures only from selected albums', () => {
      const selection = {
        'root-id': true,
        'child1-id': false,
        'grandchild-id': true,
        'child2-id': false,
      };

      const textures = collectSelectedTextures([mockAlbum], selection);

      // Expected: root textures (2) + grandchild textures (1) = 3
      expect(textures).toHaveLength(3);
      const names = textures.map((t) => t.name);
      expect(names).toContain('root1.jpg');
      expect(names).toContain('root2.jpg');
      expect(names).toContain('grandchild.jpg');
      expect(names).not.toContain('child1.jpg');
    });

    it('should return empty array if nothing is selected', () => {
      const selection = {};
      const textures = collectSelectedTextures([mockAlbum], selection);
      expect(textures).toHaveLength(0);
    });
  });
});
