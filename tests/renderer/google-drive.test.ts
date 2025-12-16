import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import SourcesModal from '@/components/SourcesModal.vue';
import { useAppState } from '@/composables/useAppState';
import { api } from '@/api';
import { ref } from 'vue';

// Mock dependencies
vi.mock('@/composables/useAppState');
vi.mock('@/api', () => ({
  api: {
    addMediaDirectory: vi.fn(),
    removeMediaDirectory: vi.fn(),
    setDirectoryActiveState: vi.fn(),
    getMediaDirectories: vi.fn(),
    reindexMediaLibrary: vi.fn(),
    startGoogleDriveAuth: vi.fn(),
    submitGoogleDriveAuthCode: vi.fn(),
    addGoogleDriveSource: vi.fn(),
  },
}));

describe('Google Drive Integration in SourcesModal', () => {
  let mockRefs: any;

  beforeEach(() => {
    mockRefs = {
      isSourcesModalVisible: ref(true),
      mediaDirectories: ref([]),
      state: {
        isScanning: false,
        allAlbums: [],
        albumsSelectedForSlideshow: {},
      },
    };
    (useAppState as any).mockReturnValue(mockRefs);
    vi.clearAllMocks();
  });

  it('should start auth flow when "Add Google Drive" is clicked', async () => {
    (api.startGoogleDriveAuth as any).mockResolvedValue('http://auth-url');
    const wrapper = mount(SourcesModal);

    // Find "Add Google Drive" button (it's the 2nd action button)
    const buttons = wrapper.findAll('.modal-actions .action-button');
    const driveButton = buttons[1];
    expect(driveButton.text()).toBe('Add Google Drive');

    await driveButton.trigger('click');

    // It sets showDriveAuth = true. We need to check if the modal content changed or new modal appeared.
    // The drive auth modal is inside the same template with v-if="showDriveAuth"
    // We should look for "Add Google Drive Source" header or "Start Authorization" button.

    const authHeader = wrapper.find('h3');
    expect(authHeader.text()).toBe('Add Google Drive Source');

    const startAuthBtn = wrapper.findAll('button.action-button').filter(b => b.text() === 'Start Authorization')[0];
    expect(startAuthBtn.exists()).toBe(true);

    await startAuthBtn.trigger('click');
    await flushPromises();

    expect(api.startGoogleDriveAuth).toHaveBeenCalled();
    // After start, it should show instructions to paste code
    expect(wrapper.text()).toContain('Paste the code below');
  });

  it('should submit auth code', async () => {
    // Setup state as if auth url was generated
    (api.startGoogleDriveAuth as any).mockResolvedValue('http://url');
    (api.submitGoogleDriveAuthCode as any).mockResolvedValue(true);

    const wrapper = mount(SourcesModal);
    // Trigger showDriveAuth = true
    await wrapper.findAll('.modal-actions .action-button')[1].trigger('click');
    // Trigger start auth
    await wrapper.findAll('button.action-button').filter(b => b.text() === 'Start Authorization')[0].trigger('click');
    await flushPromises();

    // Input code
    const input = wrapper.find('input[type="text"]');
    await input.setValue('test-code');

    const submitBtn = wrapper.findAll('button.action-button').filter(b => b.text() === 'Submit Code')[0];
    await submitBtn.trigger('click');
    await flushPromises();

    expect(api.submitGoogleDriveAuthCode).toHaveBeenCalledWith('test-code');
    expect(wrapper.text()).toContain('Authentication successful!');
  });

  it('should add drive source after auth', async () => {
    // Setup state: Auth success
    (api.startGoogleDriveAuth as any).mockResolvedValue('http://url');
    (api.submitGoogleDriveAuthCode as any).mockResolvedValue(true);
    (api.addGoogleDriveSource as any).mockResolvedValue({ success: true });
    (api.getMediaDirectories as any).mockResolvedValue([{ path: 'gdrive://123', type: 'google_drive' }]);

    const wrapper = mount(SourcesModal);
    // Navigate to add source state
    await wrapper.findAll('.modal-actions .action-button')[1].trigger('click');
    await wrapper.findAll('button.action-button').filter(b => b.text() === 'Start Authorization')[0].trigger('click');
    await flushPromises();
    await wrapper.find('input[type="text"]').setValue('code');
    await wrapper.findAll('button.action-button').filter(b => b.text() === 'Submit Code')[0].trigger('click');
    await flushPromises();

    // Now we can add folder. Input defaults to empty/root or user types it.
    const folderInput = wrapper.findAll('input[type="text"]').at(0); // The visible input
    await folderInput?.setValue('folder-id');

    const addBtn = wrapper.findAll('button.action-button').filter(b => b.text() === 'Add Folder')[0];
    await addBtn.trigger('click');
    await flushPromises();

    expect(api.addGoogleDriveSource).toHaveBeenCalledWith('folder-id');
    expect(api.getMediaDirectories).toHaveBeenCalled();
    // Modal should close (showDriveAuth becomes false), so we see the list again
    expect(wrapper.text()).toContain('Manage Media Sources');
  });
});
