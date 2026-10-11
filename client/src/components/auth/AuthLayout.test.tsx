import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import i18n from '@/i18n';
import { AuthLayout } from './AuthLayout';

describe('AuthLayout language toggle', () => {
  afterEach(async () => {
    await i18n.changeLanguage('id');
  });

  it('switches the sign-in page language', async () => {
    render(
      <AuthLayout onHelp={vi.fn()}>
        <p>form</p>
      </AuthLayout>,
    );
    const group = screen.getByRole('group', { name: 'Bahasa' });
    expect(screen.getByRole('button', { name: 'Bahasa Indonesia' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Bantuan' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(i18n.language).toBe('en');
    expect(await screen.findByRole('button', { name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(group).toHaveAccessibleName('Language');
  });
});
