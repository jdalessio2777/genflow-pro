import { describe, it, expect } from 'vitest'
import { serviceHistoryNotesHtml, serviceHistoryTitleHtml } from '../lib/serviceHistory.js'

describe('service history printout (customer-facing)', () => {
  const internal = { notes: 'INTERNAL gate code 1234', generator_notes: 'INTERNAL rusty bolts', quote_notes: 'INTERNAL margin' }

  it('never prints internal notes (and no "—" placeholder when there is no summary)', () => {
    expect(serviceHistoryNotesHtml(internal)).toBe('')
    expect(serviceHistoryTitleHtml(internal)).toBe('')
    const html = serviceHistoryNotesHtml({ ...internal, invoice_notes: 'Changed oil' })
    expect(html).toBe('Changed oil')
    expect(html).not.toContain('INTERNAL')
  })

  it('Service Summary column is invoice_notes; the description prints under the job title', () => {
    expect(serviceHistoryNotesHtml({ invoice_notes: 'A', customer_description: 'B' })).toBe('A')
    expect(serviceHistoryNotesHtml({ invoice_notes: '  ', customer_description: 'B' })).toBe('')
    const title = serviceHistoryTitleHtml({ title: 'Annual Maintenance', customer_description: 'Full service' })
    expect(title).toContain('Annual Maintenance')
    expect(title).toContain('DESCRIPTION OF WORK')
    expect(title).toContain('Full service')
    expect(serviceHistoryTitleHtml({ title: 'Annual Maintenance', customer_description: ' ' })).toBe('Annual Maintenance')
  })

  it('escapes HTML and keeps line breaks', () => {
    expect(serviceHistoryNotesHtml({ invoice_notes: '<b>x</b>\ny' })).toBe('&lt;b&gt;x&lt;/b&gt;<br>y')
    expect(serviceHistoryTitleHtml({ title: 'A & <B>' })).toBe('A &amp; &lt;B&gt;')
    expect(serviceHistoryTitleHtml({ title: 'T', customer_description: '<i>d</i>\ne' })).toContain('&lt;i&gt;d&lt;/i&gt;<br>e')
  })
})
