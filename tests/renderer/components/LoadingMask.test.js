import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LoadingMask from '../../../src/renderer/components/LoadingMask.vue';

describe('LoadingMask.vue', () => {
  it('renders the loading mask with a spinner and text', () => {
    const wrapper = mount(LoadingMask);

    expect(wrapper.find('.spinner').exists()).toBe(true);
    expect(wrapper.text()).toContain('Scanning for media...');
  });
});
