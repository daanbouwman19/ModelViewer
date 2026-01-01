import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import VideoPlayer from '@/components/VideoPlayer.vue';

describe('VideoPlayer Accessibility', () => {
  it('renders progress bar with aria-valuetext', async () => {
    const wrapper = mount(VideoPlayer, {
      props: {
        src: 'test.mp4',
        isTranscodingMode: false,
        isControlsVisible: true,
        transcodedDuration: 0,
        currentTranscodeStartTime: 0,
        isTranscodingLoading: false,
        isBuffering: false,
      },
    });

    const progressBar = wrapper.find('[role="slider"]');
    expect(progressBar.exists()).toBe(true);

    // Initial state (00:00)
    expect(progressBar.attributes('aria-valuenow')).toBe('0');
    expect(progressBar.attributes('aria-valuetext')).toBe('00:00 of 00:00');

    // Simulate time update
    // We need to access the component instance to manually update the internal state
    const component = wrapper.vm as any;

    // Manually set internal state for testing
    component.currentVideoTime = 90; // 1m 30s
    component.currentVideoDuration = 180; // 3m 00s
    await wrapper.vm.$nextTick();

    // Verify aria-valuetext
    expect(progressBar.attributes('aria-valuetext')).toBe('01:30 of 03:00');
  });
});
