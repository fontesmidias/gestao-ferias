'use client'

import { useTour } from '@/hooks/use-tour'

export function TourProvider() {
  useTour() // This hook internally uses pathname and driver.js
  return null
}
