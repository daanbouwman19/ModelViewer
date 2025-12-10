import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import FileExplorer from '../../../src/renderer/components/FileExplorer.vue';
import { api } from '../../../src/renderer/api';

// Mock the API
vi.mock('../../../src/renderer/api', () => ({
  api: {
    listDirectory: vi.fn(),
    getParentDirectory: vi.fn(),
  },
}));

describe('FileExplorer.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders initial directory listing', async () => {
    // Mock API response
    (api.listDirectory as any).mockResolvedValue([
      { name: 'Folder1', path: '/Folder1', isDirectory: true },
      { name: 'File1.txt', path: '/File1.txt', isDirectory: false },
    ]);
    (api.getParentDirectory as any).mockResolvedValue('/');

    const wrapper = mount(FileExplorer, {
      props: {
        initialPath: '/',
      },
    });

    // Wait for async calls
    await flushPromises();

    expect(wrapper.find('.current-path').text()).toBe('/');
    const items = wrapper.findAll('li.cursor-pointer');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('Folder1');
    expect(items[1].text()).toContain('File1.txt');
  });

  it('navigates into directory on double click', async () => {
    (api.listDirectory as any).mockResolvedValue([
      { name: 'SubFolder', path: '/Folder1/SubFolder', isDirectory: true },
    ]);
    (api.getParentDirectory as any).mockResolvedValue('/Folder1');

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/Folder1' },
    });
    await flushPromises();

    // Find the directory item
    const items = wrapper.findAll('li.cursor-pointer');
    const folderItem = items[0]; // Assuming it's sorted first

    await folderItem.trigger('dblclick');
    await flushPromises();

    // Verify listDirectory was called with new path
    expect(api.listDirectory).toHaveBeenCalledWith('/Folder1/SubFolder');
  });

  it('does not navigate on double click if not a directory', async () => {
    (api.listDirectory as any)
      .mockResolvedValueOnce([
        { name: 'File1.txt', path: '/File1.txt', isDirectory: false },
      ])
      .mockResolvedValue([
        // Subsequent calls shouldn't happen or return same
        { name: 'File1.txt', path: '/File1.txt', isDirectory: false },
      ]);
    (api.getParentDirectory as any).mockResolvedValue('/');

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/' },
    });
    await flushPromises();

    const items = wrapper.findAll('li.cursor-pointer');
    const fileItem = items[0];

    // Reset mock to check for calls
    (api.listDirectory as any).mockClear();

    await fileItem.trigger('dblclick');
    await flushPromises();

    expect(api.listDirectory).not.toHaveBeenCalled();
  });

  it('selects a directory on click', async () => {
    (api.listDirectory as any).mockResolvedValue([
      { name: 'Folder1', path: '/Folder1', isDirectory: true },
    ]);
    (api.getParentDirectory as any).mockResolvedValue('/');

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/' },
    });
    await flushPromises();

    const items = wrapper.findAll('li.cursor-pointer');
    await items[0].trigger('click');

    // Check if Select Directory button is enabled
    const selectBtn = wrapper.find('button.bg-blue-600');
    expect(selectBtn.attributes('disabled')).toBeUndefined();
  });

  it('emits select event when clicking Select Directory', async () => {
    (api.listDirectory as any).mockResolvedValue([
      { name: 'Folder1', path: '/Folder1', isDirectory: true },
    ]);
    (api.getParentDirectory as any).mockResolvedValue('/');

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/' },
    });
    await flushPromises();

    const items = wrapper.findAll('li.cursor-pointer');
    await items[0].trigger('click');

    const selectBtn = wrapper.find('button.bg-blue-600');
    await selectBtn.trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0]).toEqual(['/Folder1']);
  });

  it('clears selection when clicking a file', async () => {
    (api.listDirectory as any).mockResolvedValue([
      { name: 'Folder1', path: '/Folder1', isDirectory: true },
      { name: 'File1.txt', path: '/File1.txt', isDirectory: false },
    ]);
    (api.getParentDirectory as any).mockResolvedValue('/');

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/' },
    });
    await flushPromises();

    const items = wrapper.findAll('li.cursor-pointer');
    // Click folder to select
    await items[0].trigger('click');
    expect((wrapper.vm as any).selectedPath).toBe('/Folder1');

    // Click file to deselect
    await items[1].trigger('click');
    expect((wrapper.vm as any).selectedPath).toBe(null);
  });

  it('emits cancel event', async () => {
    const wrapper = mount(FileExplorer);
    await wrapper.find('button.text-gray-300').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('navigates up when up button is clicked', async () => {
    (api.listDirectory as any).mockResolvedValue([]);
    (api.getParentDirectory as any).mockResolvedValue('/parent');

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/parent/child' },
    });
    await flushPromises();

    const upBtn = wrapper.find('button[title="Go Up"]');
    expect(upBtn.attributes('disabled')).toBeUndefined();

    await upBtn.trigger('click');
    await flushPromises();

    expect(api.listDirectory).toHaveBeenCalledWith('/parent');
  });

  it('refreshes directory on refresh button click', async () => {
    (api.listDirectory as any).mockResolvedValue([]);
    (api.getParentDirectory as any).mockResolvedValue(null);

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/current' },
    });
    await flushPromises();

    (api.listDirectory as any).mockClear();

    const refreshBtn = wrapper.find('button[title="Refresh"]');
    await refreshBtn.trigger('click');

    expect(api.listDirectory).toHaveBeenCalledWith('/current');
  });

  it('displays error message when listing fails', async () => {
    (api.listDirectory as any).mockRejectedValue(new Error('Failed'));
    // Suppress console error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/error' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Failed to load directory.');
    consoleSpy.mockRestore();
  });

  it('handles empty directory', async () => {
    (api.listDirectory as any).mockResolvedValue([]);
    (api.getParentDirectory as any).mockResolvedValue(null);

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/empty' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Empty directory');
  });

  it('sorts directories first', async () => {
    (api.listDirectory as any).mockResolvedValue([
      { name: 'b_file.txt', path: '/b', isDirectory: false },
      { name: 'a_folder', path: '/a', isDirectory: true },
      { name: 'c_folder', path: '/c', isDirectory: true },
    ]);
    (api.getParentDirectory as any).mockResolvedValue(null);

    const wrapper = mount(FileExplorer, { props: { initialPath: '/' } });
    await flushPromises();

    const items = wrapper.findAll('li.cursor-pointer');
    expect(items[0].text()).toContain('a_folder');
    expect(items[1].text()).toContain('c_folder');
    expect(items[2].text()).toContain('b_file.txt');
  });
});
