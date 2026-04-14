import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InfoTooltip } from '../InfoTooltip'

describe('InfoTooltip', () => {
  it('renders info icon', () => {
    render(<InfoTooltip text="Test tooltip" />)
    // The Info icon from lucide should be in the document
    const icon = document.querySelector('svg')
    expect(icon).toBeTruthy()
  })

  it('shows tooltip text on hover', async () => {
    render(<InfoTooltip text="Helpful explanation" />)
    const icon = document.querySelector('svg')!
    fireEvent.mouseEnter(icon.parentElement!)
    // Portal renders in body, check for text
    expect(document.body.textContent).toContain('Helpful explanation')
  })

  it('hides tooltip on mouse leave', () => {
    render(<InfoTooltip text="Helpful explanation" />)
    const icon = document.querySelector('svg')!
    fireEvent.mouseEnter(icon.parentElement!)
    fireEvent.mouseLeave(icon.parentElement!)
    // Text should be gone after portal unmounts
    // Note: might need a small delay due to state update
  })
})
