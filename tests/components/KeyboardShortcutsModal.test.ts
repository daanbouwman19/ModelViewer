import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import KeyboardShortcutsModal from '../../src/renderer/components/KeyboardShortcutsModal.vue';

describe('KeyboardShortcutsModal', () => {
  it('does not render when isOpen is false', () => {
    const wrapper = mount(KeyboardShortcutsModal, {
      props: {
        isOpen: false,
      },
      global: {
        stubs: {
          CloseIcon: true,
        },
      },
    });

    expect(wrapper.find('div[role="dialog"]').exists()).toBe(false);
  });

  it('renders when isOpen is true', () => {
    const wrapper = mount(KeyboardShortcutsModal, {
      props: {
        isOpen: true,
      },
      global: {
        stubs: {
          CloseIcon: true,
        },
      },
    });

    expect(wrapper.find('div[role="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Keyboard Shortcuts');
  });

  it('emits close event when close button is clicked', async () => {
    const wrapper = mount(KeyboardShortcutsModal, {
      props: {
        isOpen: true,
      },
      global: {
        stubs: {
          CloseIcon: true,
        },
      },
    });

    await wrapper.find('button[aria-label="Close"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('emits close event when "Got it" button is clicked', async () => {
    const wrapper = mount(KeyboardShortcutsModal, {
      props: {
        isOpen: true,
      },
      global: {
        stubs: {
          CloseIcon: true,
        },
      },
    });

    // Find button with text 'Got it'
    const buttons = wrapper.findAll('button');
    const gotItButton = buttons.find((b) => b.text() === 'Got it');

    expect(gotItButton).toBeDefined();
    if (gotItButton) {
      await gotItButton.trigger('click');
      expect(wrapper.emitted('close')).toBeTruthy();
    }
  });
});
