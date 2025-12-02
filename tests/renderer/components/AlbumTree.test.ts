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
  name: 'root',
  textures: [{ name: 'root.jpg', path: '/root.jpg' }],
  children: [
    {
      name: 'child1',
      textures: [{ name: 'child1.jpg', path: '/child1.jpg' }],
      children: [],
    },
    {
      name: 'child2',
      textures: [{ name: 'child2.jpg', path: '/child2.jpg' }],
      children: [
        {
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

    await wrapper.find('input[type="checkbox"]').trigger('change');

    expect(wrapper.emitted().toggleSelection).toBeTruthy();
    expect(wrapper.emitted().toggleSelection[0][0]).toEqual(testAlbum);
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
    expect(wrapper.emitted().albumClick[0][0]).toEqual(testAlbum);
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
    await gridButton.trigger('click');

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
      expect(wrapper.vm.selectionState).toBe('none');
    });

    it('is "all" when all children are selected', () => {
      const wrapper = mount(AlbumTree, {
        props: {
          album: testAlbum,
          selection: {
            root: true,
            child1: true,
            child2: true,
            grandchild: true,
          },
        },
      });
      expect(wrapper.vm.selectionState).toBe('all');
    });

    it('is "some" when some children are selected', () => {
      const wrapper = mount(AlbumTree, {
        props: {
          album: testAlbum,
          selection: {
            root: true,
            child1: true,
          },
        },
      });
      expect(wrapper.vm.selectionState).toBe('some');
    });

    it('sets checkbox to indeterminate when selectionState is "some"', async () => {
      const wrapper = mount(AlbumTree, {
        props: {
          album: testAlbum,
          selection: {
            child1: true,
          },
        },
      });

      expect(wrapper.find('input[type="checkbox"]').element.indeterminate).toBe(
        true,
      );
    });
  });
});
