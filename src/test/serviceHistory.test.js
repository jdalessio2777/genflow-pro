import { describe, it, expect } from 'vitest'
import { serviceHistoryNotesHtml, serviceHistoryTitleHtml } from '../lib/serviceHistory.js'

describe('service history printout (customer-facing)', () => {
  const internal = { notes: 'INTERNAL gate code 1234', generator_notes: 'INTERNAL rusty bolts', quote_notes: 'INTERNAL margin' }

  it('never prints internal notes', () => {
    expect(serviceHistoryNotesHtml(internal)).toBe('—')
    const html = serviceHistoryNotesHtml({ ...internal, invoice_notes: 'Changed oil' })
    expect(html).toBe('Changed oil')
    expect(html).not.toContain('INTERNAL')
  })

  it('prefers invoice_notes, falls back to customer_description', () => {
    expect(serviceHistoryNotesHtml({ invoice_notes: 'A', customer_description: 'B' })).toBe('A')
    expect(serviceHistoryNotesHtml({ invoice_notes: '  ', customer_description: 'B' })).toBe('B')
  })

  it('escapes HTML and keeps line breaks', () => {
    expect(serviceHistoryNotesHtml({ invoice_notes: '<b>x</b>\ny' })).toBe('&lt;b&gt;x&lt;/b&gt;<br>y')
    expect(serviceHistoryTitleHtml({ title: 'A & <B>' })).toBe('A &amp; &lt;B&gt;')
  })
})
