import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AlbumTree from '../../../src/renderer/components/AlbumTree.vue';

// Mock useSlideshow
const mockOpenAlbumInGrid = vi.fn();
vi.mock('../../../src/renderer/composables/useSlideshow', () => ({
  useSlideshow: () => ({
    openAlbumInGrid: mockOpenAlbumInGrid,
  }),
}));

const testAlbum = {
  id: 'root-id',
  name: 'root',
  textures: [{ name: 'root.jpg', path: '/root.jpg' }],
  children: [
    {
      id: 'child1-id',
      name: 'child1',
      textures: [{ name: 'child1.jpg', path: '/child1.jpg' }],
      children: [],
    },
    {
      id: 'child2-id',
      name: 'child2',
      textures: [{ name: 'child2.jpg', path: '/child2.jpg' }],
      children: [
        {
          id: 'grandchild-id',
          name: 'grandchild',
          textures: [{ name: 'grandchild.jpg', path: '/grandchild.jpg' }],
          children: [],
        },
      ],
    },
  ],
};

describe('AlbumTree.vue', () => {
  it('renders album name and texture count', () => {
    const wrapper = mount(AlbumTree, {
      props: {
        album: testAlbum,
        selection: {},
      },
    });

    expect(wrapper.text()).toContain('root (4)');
  });

  it('handles album with empty or missing children safely', () => {
    const emptyAlbum = {
      id: 'empty-id',
      name: 'empty',
      textures: [],
      children: [],
    };
    const wrapper = mount(AlbumTree, {
      props: { album: emptyAlbum, selection: {} },
    });
    expect(wrapper.find('.toggle-button').exists()).toBe(false);
  });

  it('does not render children by default', () => {
    const wrapper = mount(AlbumTree, {
      props: {
        album: testAlbum,
        selection: {},
      },
    });

    expect(wrapper.find('.album-subtree').exists()).toBe(false);
  });

  it('renders children when toggle button is clicked', async () => {
    const wrapper = mount(AlbumTree, {
      props: {
        album: testAlbum,
        selection: {},
      },
    });

    await wrapper.find('.toggle-button').trigger('click');

    expect(wrapper.find('.album-subtree').exists()).toBe(true);
    const subtreeText = wrapper.find('.album-subtree').text();
    expect(subtreeText).toContain('child1 (1)');
    expect(subtreeText).toContain('child2 (2)');
  });

  it('emits toggleSelection event when checkbox is clicked', async () => {
    const wrapper = mount(AlbumTree, {
      props: {
        album: testAlbum,
        selection: {},
      },
    });

    await wrapper.find('input[type="checkbox"]').trigger('click');

    expect(wrapper.emitted().toggleSelection).toBeTruthy();
    expect((wrapper.emitted().toggleSelection as unknown[][])[0][0]).toEqual({
      album: testAlbum,
      recursive: true,
    });
  });

  it('emits albumClick event when album item is clicked', async () => {
    const wrapper = mount(AlbumTree, {
      props: {
        album: testAlbum,
        selection: {},
      },
    });

    await wrapper.find('.album-item').trigger('click');

    expect(wrapper.emitted().albumClick).toBeTruthy();
    expect((wrapper.emitted().albumClick as unknown[][])[0][0]).toEqual(
      testAlbum,
    );
  });

  it('calls openAlbumInGrid when grid button is clicked', async () => {
    const wrapper = mount(AlbumTree, {
      props: {
        album: testAlbum,
        selection: {},
      },
    });

    // Find the grid button. It has text "Grid".
    const buttons = wrapper.findAll('button');
    const gridButton = buttons.find((b) => b.text() === 'Grid');

    expect(gridButton).toBeDefined();
    await gridButton!.trigger('click');

    expect(mockOpenAlbumInGrid).toHaveBeenCalledWith(testAlbum);
  });

  describe('selectionState', () => {
    it('is "none" when no children are selected', () => {
      const wrapper = mount(AlbumTree, {
        props: {
          album: testAlbum,
          selection: {},
        },
      });

      expect((wrapper.vm as any).selectionState).toBe('none');
    });

    it('is "all" when all children are selected', () => {
      const wrapper = mount(AlbumTree, {
        props: {
          album: testAlbum,
          selection: {
            'root-id': true,
            'child1-id': true,
            'child2-id': true,
            'grandchild-id': true,
          },
        },
      });

      expect((wrapper.vm as any).selectionState).toBe('all');
    });

    it('is "some" when some children are selected', () => {
      const wrapper = mount(AlbumTree, {
        props: {
          album: testAlbum,
          selection: {
            'root-id': true,
            'child1-id': true,
          },
        },
      });

      expect((wrapper.vm as any).selectionState).toBe('some');
    });

    it('sets checkbox to indeterminate when selectionState is "some"', async () => {
      const wrapper = mount(AlbumTree, {
        props: {
          album: testAlbum,
          selection: {
            'child1-id': true,
          },
        },
      });

      expect(
        (wrapper.find('input[type="checkbox"]').element as HTMLInputElement)
          .indeterminate,
      ).toBe(true);
    });
  });

  it('re-emits toggleSelection from child component', async () => {
    // Need to expand to see children
    const wrapper = mount(AlbumTree, {
      props: { album: testAlbum, selection: {} },
    });
    await wrapper.find('.toggle-button').trigger('click');

    // Find child AlbumTree
    const childTree = wrapper.findComponent({ name: 'AlbumTree' });
    expect(childTree.exists()).toBe(true);

    // Emit event from child
    childTree.vm.$emit('toggleSelection', {
      album: testAlbum.children[0],
      recursive: true,
    });

    expect(wrapper.emitted().toggleSelection).toBeTruthy();
    expect((wrapper.emitted().toggleSelection as unknown[][])[0][0]).toEqual({
      album: testAlbum.children[0],
      recursive: true,
    });
  });

  it('re-emits albumClick from child component', async () => {
    const wrapper = mount(AlbumTree, {
      props: { album: testAlbum, selection: {} },
    });
    await wrapper.find('.toggle-button').trigger('click');

    const childTree = wrapper.findComponent({ name: 'AlbumTree' });
    childTree.vm.$emit('albumClick', testAlbum.children[0]);

    expect(wrapper.emitted().albumClick).toBeTruthy();
    expect((wrapper.emitted().albumClick as unknown[][])[0][0]).toEqual(
      testAlbum.children[0],
    );
  });

  it('stops propagation when clicking album controls', async () => {
    const wrapper = mount(AlbumTree, {
      props: { album: testAlbum, selection: {} },
    });

    // Clicking .album-controls should NOT trigger album click (which is on .album-item parent)
    const controls = wrapper.find('.album-controls');
    await controls.trigger('click');

    expect(wrapper.emitted().albumClick).toBeFalsy();
  });
});
