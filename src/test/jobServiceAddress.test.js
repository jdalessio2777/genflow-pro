// Run 14 (A): an added generator at another property; the job is booked at
// that address and keeps it.
import { describe, it, expect } from 'vitest'
import { serviceAddressFor, jobAddress, customerAtJobAddress, generatorsOf, hasGeneratorInfo, generatorPatch, otherServiceAddress } from '@/lib/generatorInfo'
import { confirmationEmailHTML, completionEmailHTML, invoiceSummaryHTML } from '@/lib/emailTemplates'
import { buildEvent } from '@/lib/googleCalendar'

const HOME = '10 Home St, Summit NJ'
const LAKE = '99 Lake Rd, Sparta NJ'
const customer = {
  id: 'c1', name: 'Pat Example', email: 'p@example.com', address: HOME,
  generator_brand: 'Generac', generator_kw: 22,
  extra_generators: [
    { id: 'g2', label: 'Lake house', brand: 'Kohler', kw: 14, address: `  ${LAKE} ` },
    { id: 'g3', label: 'Barn', brand: 'Generac', address: '   ' },
  ],
}
const MOVED = { ...customer, extra_generators: [{ ...customer.extra_generators[0], address: '1 New Pl, Newton NJ' }, customer.extra_generators[1]] }
const job = (extra) => ({ id: 'j1', title: 'Annual maintenance', job_type: 'maintenance', scheduled_date: '2026-11-21T14:00:00.000Z', ...extra })

describe('serviceAddressFor', () => {
  it('is the added generator\'s address, trimmed', () => expect(serviceAddressFor(customer, 'g2')).toBe(LAKE))
  it('is null for the main generator, a blank address or an unknown id', () => {
    expect(serviceAddressFor(customer, null)).toBeNull()
    expect(serviceAddressFor(customer, 'main')).toBeNull()
    expect(serviceAddressFor(customer, 'g3')).toBeNull()
    expect(serviceAddressFor(customer, 'nope')).toBeNull()
    expect(serviceAddressFor(null, 'g2')).toBeNull()
  })
})

describe('jobAddress', () => {
  it('uses the address the job was booked with, even after the generator moves', () => {
    expect(jobAddress(job({ generator_id: 'g2', service_address: LAKE }), MOVED)).toBe(LAKE)
  })
  it('column present but empty = the customer\'s address (main-generator jobs, old jobs)', () => {
    expect(jobAddress(job({ generator_id: null, service_address: null }), customer)).toBe(HOME)
    expect(jobAddress(job({ generator_id: 'g2', service_address: null }), customer)).toBe(HOME)
  })
  it('before the migration (no column on the row): the generator\'s current address', () => {
    expect(jobAddress(job({ generator_id: 'g2' }), customer)).toBe(LAKE)
    expect(jobAddress(job({ generator_id: 'g3' }), customer)).toBe(HOME)
    expect(jobAddress(job({}), customer)).toBe(HOME)
  })
  it('no job or customer: never throws', () => {
    expect(jobAddress(undefined, customer)).toBe(HOME)
    expect(jobAddress(null, null)).toBe('')
  })
  it('customerAtJobAddress swaps only the address', () => {
    const c = customerAtJobAddress(customer, job({ service_address: LAKE }))
    expect(c.address).toBe(LAKE)
    expect(c.name).toBe(customer.name)
    expect(customer.address).toBe(HOME)
    expect(customerAtJobAddress(customer, null)).toBe(customer)
  })
})

describe('generators carry their address', () => {
  it('extra generators read it; the main one is always the customer\'s', () => {
    const [main, g2, g3] = generatorsOf(customer)
    expect(main.address).toBe('')
    expect(g2.address).toBe(LAKE)
    expect(g3.address).toBe('')
  })
  it('a generator with only an address still shows', () => {
    expect(hasGeneratorInfo({ address: LAKE })).toBe(true)
  })
  it('generatorPatch writes the address into that generator only', () => {
    const p = generatorPatch(customer, 'g3', { address: '5 Barn Ln' })
    expect(p.extra_generators[1].address).toBe('5 Barn Ln')
    expect(p.extra_generators[0].address).toBe(customer.extra_generators[0].address)
  })
})

describe('customer copy and calendar use the job\'s address', () => {
  const booked = job({ generator_id: 'g2', service_address: LAKE })
  it('confirmation email', () => {
    const html = confirmationEmailHTML({ customer, job: booked })
    expect(html).toContain(LAKE)
    expect(html).not.toContain(HOME)
  })
  it('completion email: Bill to (home) and Service address (generator)', () => {
    const html = completionEmailHTML({ customer, job: booked })
    expect(html).toContain(LAKE)
    expect(html).toContain(HOME)
    expect(html).toMatch(/Bill to[\s\S]*Service address/)
    const same = completionEmailHTML({ customer, job: job({ service_address: null }) })
    expect(same).not.toContain('Service address')
    expect(same).not.toContain('Bill to')
  })
  const inv = { invoice_number: 'INV-1', line_items: [{ description: 'Tune-up', quantity: 1, unit_price: 315, total: 315 }], subtotal: 315, total: 315, labor_total: 315, parts_total: 0, status: 'sent' }
  it('invoice summary (and the $0 one): Bill to = home, Service address = generator', () => {
    for (const i of [inv, { ...inv, line_items: [], subtotal: 0, total: 0, labor_total: 0 }]) {
      const html = invoiceSummaryHTML({ invoice: i, customer, job: booked })
      expect(html.indexOf(HOME)).toBeGreaterThan(html.indexOf('BILL TO'))
      expect(html.indexOf('SERVICE ADDRESS')).toBeGreaterThan(html.indexOf(HOME))
      expect(html.indexOf(LAKE)).toBeGreaterThan(html.indexOf('SERVICE ADDRESS'))
    }
  })
  it('a job at the customer\'s own address prints exactly as before (no Service address block)', () => {
    const atHome = job({ service_address: null })
    expect(invoiceSummaryHTML({ invoice: inv, customer, job: atHome })).not.toContain('SERVICE ADDRESS')
    // same address typed differently still counts as the same place
    expect(otherServiceAddress(job({ service_address: ' 10 home st,  summit nj ' }), customer)).toBe('')
  })
  it('a standalone invoice (no job) keeps the customer\'s address', () => {
    const inv = { invoice_number: 'INV-2', line_items: [], subtotal: 50, total: 50, labor_total: 50, parts_total: 0, status: 'sent' }
    expect(invoiceSummaryHTML({ invoice: inv, customer, job: null })).toContain(HOME)
  })
  it('Google Calendar event location', () => {
    expect(buildEvent(booked, customer).location).toBe(LAKE)
    expect(buildEvent(job({ service_address: null }), customer).location).toBe(HOME)
  })
})
