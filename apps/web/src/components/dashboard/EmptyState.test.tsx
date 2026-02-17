import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { EmptyState } from './EmptyState'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('EmptyState', () => {
  it('renders the empty cabinet message', () => {
    renderWithRouter(<EmptyState />)

    expect(screen.getByText('Your cabinet is empty')).toBeInTheDocument()
    expect(
      screen.getByText(/Scan your first medicine/)
    ).toBeInTheDocument()
  })

  it('renders a "Scan Your First Medicine" button', () => {
    renderWithRouter(<EmptyState />)

    const button = screen.getByRole('button', {
      name: /Scan Your First Medicine/i,
    })
    expect(button).toBeInTheDocument()
  })

  it('renders the how-it-works section', () => {
    renderWithRouter(<EmptyState />)

    expect(screen.getByText('How it works')).toBeInTheDocument()
    expect(
      screen.getByText(/Scan the barcode or DataMatrix/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/The app finds the medicine info automatically/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Your digital cabinet is always up to date/)
    ).toBeInTheDocument()
  })
})
