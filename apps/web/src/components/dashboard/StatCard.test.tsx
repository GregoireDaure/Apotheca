import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './StatCard'

describe('StatCard', () => {
  it('renders value and label', () => {
    render(<StatCard value={12} label="Medicines" />)

    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('Medicines')).toBeInTheDocument()
  })

  it('sets aria-label with value and label', () => {
    render(<StatCard value={3} label="Expiring" />)

    expect(screen.getByLabelText('3 Expiring')).toBeInTheDocument()
  })

  it('renders with clear status styling', () => {
    const { container } = render(
      <StatCard value={5} label="Medicines" status="clear" />
    )

    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('border-l-status-clear')
  })

  it('renders with danger status styling', () => {
    const { container } = render(
      <StatCard value={2} label="Expired" status="danger" />
    )

    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('border-l-status-danger')
  })

  it('renders with warning status styling', () => {
    const { container } = render(
      <StatCard value={1} label="Expiring" status="warning" />
    )

    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('border-l-status-warning')
  })

  it('uses default status when none specified', () => {
    const { container } = render(
      <StatCard value={0} label="Restock" />
    )

    const card = container.firstChild as HTMLElement
    expect(card.className).toContain('border-l-border')
  })
})
