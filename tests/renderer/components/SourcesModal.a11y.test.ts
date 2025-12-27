import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import SourcesModal from '@/components/SourcesModal.vue';
import { useAppState } from '@/composables/useAppState';

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

describe('SourcesModal A11y', () => {
  let mockRefs: any;

  beforeEach(() => {
    mockRefs = {
      isSourcesModalVisible: ref(true),
      mediaDirectories: ref([]),
      state: {},
      allAlbums: ref([]),
      albumsSelectedForSlideshow: ref({}),
      mediaFilter: ref('All'),
      currentMediaItem: ref(null),
      displayedMediaFiles: ref([]),
      currentMediaIndex: ref(-1),
      isSlideshowActive: ref(false),
      isTimerRunning: ref(false),
      timerDuration: ref(30),
      supportedExtensions: ref({ images: [], videos: [] }),
      globalMediaPoolForSelection: ref([]),
      totalMediaInPool: ref(0),
      slideshowTimerId: ref(null),
    };
    (useAppState as Mock).mockReturnValue(mockRefs);
  });

  it('Google Drive Auth inputs should have accessible labels', async () => {
    const wrapper = mount(SourcesModal);

    // Trigger Google Drive Auth view
    (wrapper.vm as any).showDriveAuth = true;
    (wrapper.vm as any).driveAuthUrl = 'http://auth-url';
    await flushPromises();

    // Check Auth Code Input
    const authCodeInput = wrapper.find('input[placeholder="Paste authorization code here"]');
    expect(authCodeInput.exists()).toBe(true);

    // Check if it has an id
    const authCodeId = authCodeInput.attributes('id');
    expect(authCodeId).toBeDefined();

    // Check if there is a label for it
    const authLabel = wrapper.find(`label[for="${authCodeId}"]`);
    expect(authLabel.exists()).toBe(true);

    // Simulate Auth Success to check Folder ID input
    (wrapper.vm as any).authSuccess = true;
    await flushPromises();

    const folderIdInput = wrapper.find('input[placeholder*="Folder ID"]');
    expect(folderIdInput.exists()).toBe(true);

    const folderId = folderIdInput.attributes('id');
    expect(folderId).toBeDefined();

    const folderLabel = wrapper.find(`label[for="${folderId}"]`);
    expect(folderLabel.exists()).toBe(true);
  });
});
