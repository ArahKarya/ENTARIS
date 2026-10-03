import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { cn } from '@/lib/utils'

describe('test harness smoke', () => {
  it('renders a React element in jsdom', () => {
    render(<button type="button">Masuk</button>)
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument()
  })

  it('resolves the @ alias', () => {
    expect(cn('a', undefined, 'c')).toBe('a c')
  })
})
