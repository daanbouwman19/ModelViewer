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
  it('correctly identifies drive roots with different cases', async () => {
    (api.listDirectory as any).mockResolvedValue([
      { name: 'C:', path: 'C:\\', isDirectory: true },
      { name: 'd:', path: 'd:\\', isDirectory: true },
    ]);
    (api.getParentDirectory as any).mockResolvedValue(null);

    const wrapper = mount(FileExplorer, {
      props: { initialPath: 'ROOT' },
    });
    await flushPromises();

    // Check if icons are displayed correctly (Floppy disk 💾 for drives)
    const items = wrapper.findAll('li.cursor-pointer');

    // First item: C:\
    expect(items[0].find('.icon').text()).toBe('💾');
    expect(items[0].find('.text-xs').text()).toBe('DRIVE');

    expect(items[1].find('.icon').text()).toBe('💾');
    expect(items[1].find('.text-xs').text()).toBe('DRIVE');
  });

  it('correctly identifies unix root / as drive', async () => {
    (api.listDirectory as any).mockResolvedValue([
      { name: 'Root', path: '/', isDirectory: true },
    ]);
    (api.getParentDirectory as any).mockResolvedValue(null);

    const wrapper = mount(FileExplorer, {
      props: { initialPath: 'ROOT' },
    });
    await flushPromises();

    const items = wrapper.findAll('li.cursor-pointer');
    // First item: /
    expect(items[0].find('.icon').text()).toBe('💾');
    expect(items[0].find('.text-xs').text()).toBe('DRIVE');
  });

  it('toggles view mode between list and grid', async () => {
    (api.listDirectory as any).mockResolvedValue([]);
    const wrapper = mount(FileExplorer, { props: { initialPath: '/' } });
    await flushPromises();

    const toggleBtn = wrapper.find('button[title="Switch to Grid View"]');

    // Default is list, so button title is "Switch to Grid View" which means icon is grid?
    // Actually in code: viewMode === 'list' ? 'Switch to Grid View' : 'Switch to List View'
    // And icon: viewMode === 'list' ? '📅' : 'list' (Wait, '📅' is calendar?? Maybe supposed to be grid?)

    expect(toggleBtn.exists()).toBe(true);

    await toggleBtn.trigger('click');
    expect(wrapper.find('div.grid').exists()).toBe(true);
    expect(wrapper.find('ul.space-y-1').exists()).toBe(false); // List view hidden

    await toggleBtn.trigger('click');
    expect(wrapper.find('ul.space-y-1').exists()).toBe(true);
    expect(wrapper.find('div.grid').exists()).toBe(false);
  });

  it('handles Google Drive mode initial load', async () => {
    (api.listGoogleDriveDirectory as any) = vi
      .fn()
      .mockResolvedValue([
        { name: 'Drive Folder', path: 'folder-id', isDirectory: true },
      ]);
    (api.getGoogleDriveParent as any) = vi.fn().mockResolvedValue('root');

    const wrapper = mount(FileExplorer, {
      props: {
        initialPath: 'root',
        mode: 'google-drive',
      },
    });
    await flushPromises();

    expect(wrapper.find('.current-path').text()).toContain('Google Drive'); // "Google Drive" for root
    expect(api.listGoogleDriveDirectory).toHaveBeenCalledWith('root');

    // Default view for drive is grid
    expect(wrapper.find('div.grid').exists()).toBe(true);
  });

  it('handles Google Drive navigation', async () => {
    (api.listGoogleDriveDirectory as any).mockResolvedValue([]);
    (api.getGoogleDriveParent as any).mockResolvedValue('root');

    const wrapper = mount(FileExplorer, {
      props: { mode: 'google-drive' },
    });
    await flushPromises();

    // Mock navigating to a folder
    (api.listGoogleDriveDirectory as any).mockResolvedValue([
      { name: 'SubItem', path: 'sub-id', isDirectory: false },
    ]);

    // Simulate double click on an entry (we have to mock entry existing first)
    // Or just call loadDirectory directly?
    // Let's use the method exposed or simulate correct flow.

    // We need entries to click.
    (api.listGoogleDriveDirectory as any).mockResolvedValue([
      { name: 'Folder', path: 'folder-id', isDirectory: true },
    ]);
    // Re-mount or re-load
    await (wrapper.vm as any).loadDirectory('root');
    await flushPromises();

    // Find grid item
    const item = wrapper.find('.grid > div');
    await item.trigger('dblclick');
    await flushPromises();

    expect(api.listGoogleDriveDirectory).toHaveBeenCalledWith('folder-id');
  });

  it('navigateUp works correctly in local mode', async () => {
    // Mock returning to root
    (api.getParentDirectory as any).mockResolvedValue('ROOT');
    (api.listDirectory as any).mockResolvedValue([]);

    const wrapper = mount(FileExplorer, {
      props: { initialPath: '/some/path' },
    });
    await flushPromises();

    // We are at /some/path, parent is ROOT.
    await wrapper.find('button[title="Go Up"]').trigger('click');
    await flushPromises();

    expect(api.listDirectory).toHaveBeenCalledWith('ROOT'); // loadDirectory('') calls listDirectory('ROOT')
  });

  it('allows selection of directories in Google Drive grid view', async () => {
    const driveEntries = [
      {
        name: 'My Folder',
        path: 'folder-123',
        isDirectory: true,
        mimeType: 'application/vnd.google-apps.folder',
      },
      {
        name: 'My File',
        path: 'file-456',
        isDirectory: false,
        mimeType: 'image/jpeg',
      },
    ];
    (api.listGoogleDriveDirectory as any).mockResolvedValue(driveEntries);
    (api.getGoogleDriveParent as any).mockResolvedValue('root');

    const wrapper = mount(FileExplorer, {
      props: { mode: 'google-drive', initialPath: 'root' },
    });
    await flushPromises();

    // Verify grid view is active
    expect(wrapper.find('div.grid').exists()).toBe(true);

    // Find the folder item
    const folderItem = wrapper
      .findAll('.grid > div')
      .filter((w) => w.text().includes('My Folder'))
      .at(0);
    expect(folderItem?.exists()).toBe(true);

    // Click the folder
    await folderItem?.trigger('click');
    await flushPromises();

    // Check selection state
    expect((wrapper.vm as any).selectedPath).toBe('folder-123');
    expect(folderItem?.classes()).toContain('bg-blue-900/50');

    // Find select button
    const selectBtn = wrapper.find('button.bg-blue-600');
    expect(selectBtn.attributes('disabled')).toBeUndefined();

    // Click select button
    await selectBtn.trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['folder-123']);
  });

  it('does not select files in Google Drive grid view', async () => {
    const driveEntries = [
      { name: 'My File', path: 'file-456', isDirectory: false },
    ];
    (api.listGoogleDriveDirectory as any).mockResolvedValue(driveEntries);
    const wrapper = mount(FileExplorer, {
      props: { mode: 'google-drive', initialPath: 'root' },
    });
    await flushPromises();

    const fileItem = wrapper
      .findAll('.grid > div')
      .filter((w) => w.text().includes('My File'))
      .at(0);

    // Click the file
    await fileItem?.trigger('click');
    await flushPromises();

    expect((wrapper.vm as any).selectedPath).toBeNull();
    const selectBtn = wrapper.find('button.bg-blue-600');
    expect(selectBtn.attributes()).toHaveProperty('disabled');
  });
});
