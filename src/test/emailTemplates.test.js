import { describe, it, expect } from 'vitest'
import {
  quoteEmailHTML,
  confirmationEmailHTML,
  completionEmailHTML,
} from '@/lib/emailTemplates'

const mockCustomer = {
  name: 'Don Grennon',
  email: 'don@example.com',
  address: '58 Druid Hill Rd, Summit NJ',
  generator_model: 'Generac 17kW',
  generator_serial: '6737426',
}

const mockJob = {
  id: 'test-job-uuid-1234',
  title: 'Annual Maintenance',
  job_type: 'maintenance',
  scheduled_date: new Date('2026-06-10T09:00:00').toISOString(),
  completed_date: new Date('2026-06-10T11:30:00').toISOString(),
  notes: 'Annual service',
}

// quoteEmailHTML expects { description, qty, amount }
const mockLineItems = [
  { description: 'Oil Filter', qty: '×1', amount: 18.50 },
  { description: 'Spark Plugs', qty: '×1', amount: 24.00 },
]

const mockParts = [
  { name: 'Oil Filter', quantity: 1, total_price: 18.50 },
  { name: 'Spark Plugs', quantity: 1, total_price: 24.00 },
]

const mockLabor = [
  { description: 'Annual maintenance labor', total_price: 245.05 },
]

const mockDocuments = [
  { status: 'completed', template_name: 'Annual Maintenance Checklist' },
  { status: 'completed', template_name: 'Oil & Filter Inspection' },
  { status: 'pending', template_name: 'Battery Load Test' },
]

// ─── quoteEmailHTML ──────────────────────────────────────────────────────────

describe('quoteEmailHTML', () => {
  const baseArgs = {
    customer: mockCustomer,
    job: mockJob,
    lineItems: mockLineItems,
    subtotal: 287.55,
    discount: 0,
    total: 287.55,
    approveUrl: `https://genshieldservice.com/approve?job=${mockJob.id}`,
  }

  it('returns an HTML string', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(typeof html).toBe('string')
    expect(html).toMatch(/<!DOCTYPE html>/i)
  })

  it('contains the customer name', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain('Don Grennon')
  })

  it('contains the approve URL with job ID', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain(`https://genshieldservice.com/approve?job=${mockJob.id}`)
  })

  it('contains the total amount formatted as currency', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain('$287.55')
  })

  it('contains GenShield branding', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain('genshieldservice.com')
  })

  it('contains the referral link', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain('genshieldservice.com/rewards')
  })

  it('contains expiry language about 7 days', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain('7 days')
  })

  it('renders each line item description', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain('Oil Filter')
    expect(html).toContain('Spark Plugs')
  })

  it('shows Member Discount row when discount > 0', () => {
    const html = quoteEmailHTML({ ...baseArgs, discount: 28.76, total: 258.79 })
    expect(html).toContain('Member Discount')
    expect(html).toContain('-$28.76')
  })

  it('does NOT show Member Discount row when discount = 0', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).not.toContain('Member Discount')
  })

  it('contains the generator model and serial', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain('Generac 17kW')
    expect(html).toContain('6737426')
  })

  it('contains the service address', () => {
    const html = quoteEmailHTML(baseArgs)
    expect(html).toContain('58 Druid Hill Rd, Summit NJ')
  })

  it('contains quote number derived from job ID', () => {
    const html = quoteEmailHTML(baseArgs)
    // first 8 chars of job ID uppercased
    expect(html).toContain('TEST-JOB')
  })
})

// ─── confirmationEmailHTML ────────────────────────────────────────────────────

describe('confirmationEmailHTML', () => {
  const baseArgs = {
    customer: mockCustomer,
    job: mockJob,
    techFirstName: 'Jeremy',
  }

  it('returns an HTML string', () => {
    const html = confirmationEmailHTML(baseArgs)
    expect(typeof html).toBe('string')
    expect(html).toMatch(/<!DOCTYPE html>/i)
  })

  it('contains the customer name', () => {
    const html = confirmationEmailHTML(baseArgs)
    expect(html).toContain('Don Grennon')
  })

  it('contains the technician first name', () => {
    const html = confirmationEmailHTML(baseArgs)
    expect(html).toContain('Jeremy')
  })

  it('contains the scheduled date formatted', () => {
    const html = confirmationEmailHTML(baseArgs)
    // June 10, 2026 should appear in some form
    expect(html).toContain('June')
    expect(html).toContain('2026')
  })

  it('contains the service address', () => {
    const html = confirmationEmailHTML(baseArgs)
    expect(html).toContain('58 Druid Hill Rd, Summit NJ')
  })

  it('contains appointment confirmed text', () => {
    const html = confirmationEmailHTML(baseArgs)
    expect(html).toMatch(/appointment.*confirmed|confirmed.*appointment/i)
  })

  it('contains the referral link', () => {
    const html = confirmationEmailHTML(baseArgs)
    expect(html).toContain('genshieldservice.com/rewards')
  })

  it('contains GenShield branding', () => {
    const html = confirmationEmailHTML(baseArgs)
    expect(html).toContain('genshieldservice.com')
  })

  it('contains generator info', () => {
    const html = confirmationEmailHTML(baseArgs)
    expect(html).toContain('Generac 17kW')
  })

  it('uses fallback tech name when techFirstName is empty', () => {
    const html = confirmationEmailHTML({ ...baseArgs, techFirstName: '' })
    expect(html).toContain('our technician')
  })

  describe('customer_description ("About Your Service")', () => {
    const withDesc = (customer_description) =>
      confirmationEmailHTML({ ...baseArgs, job: { ...mockJob, customer_description } })

    it('renders the section when a description is present', () => {
      const html = withDesc('Annual maintenance and battery load test')
      expect(html).toContain('About Your Service')
      expect(html).toContain('Annual maintenance and battery load test')
    })

    it('uses a table-based layout (no flexbox/grid) for the section', () => {
      const html = withDesc('Annual maintenance')
      const start = html.indexOf('<!-- About Your Service -->')
      const end = html.indexOf('<!-- What to Expect -->')
      const section = html.slice(start, end)
      expect(start).toBeGreaterThan(-1)
      expect(section).toMatch(/<table[\s>]/)
      expect(section).not.toMatch(/display:\s*(flex|grid)/)
    })

    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty string', ''],
      ['whitespace only', '   \n\t  \n '],
    ])('omits the section entirely when description is %s', (_label, value) => {
      const html = withDesc(value)
      expect(html).not.toContain('About Your Service')
      expect(html).not.toContain('<!-- About Your Service -->')
    })

    it('omits the section when the job has no customer_description key', () => {
      const html = confirmationEmailHTML(baseArgs)
      expect(html).not.toContain('About Your Service')
    })

    it('HTML-escapes the description', () => {
      const html = withDesc(`<script>alert("x")</script> & 'quotes'`)
      expect(html).not.toContain('<script>alert')
      expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;')
    })

    it('converts newlines to <br> and trims surrounding whitespace', () => {
      const html = withDesc('  Line one\nLine two\r\nLine three  ')
      expect(html).toContain('Line one<br>Line two<br>Line three')
      expect(html).not.toContain('  Line one')
    })
  })
})

// ─── completionEmailHTML ──────────────────────────────────────────────────────

describe('completionEmailHTML', () => {
  const baseArgs = {
    customer: mockCustomer,
    job: mockJob,
    parts: mockParts,
    labor: mockLabor,
    documents: mockDocuments,
    includeChecklist: true,
  }

  it('returns an HTML string', () => {
    const html = completionEmailHTML(baseArgs)
    expect(typeof html).toBe('string')
    expect(html).toMatch(/<!DOCTYPE html>/i)
  })

  it('contains the customer name', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toContain('Don Grennon')
  })

  it('contains Service Complete text', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toMatch(/service complete/i)
  })

  it('contains the referral link', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toContain('genshieldservice.com/rewards')
  })

  it('contains GenShield branding', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toContain('genshieldservice.com')
  })

  it('contains labor description', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toContain('Annual maintenance labor')
  })

  it('contains parts names', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toContain('Oil Filter')
    expect(html).toContain('Spark Plugs')
  })

  it('includes total amount when parts and labor present', () => {
    const html = completionEmailHTML(baseArgs)
    // total = 18.50 + 24.00 + 245.05 = 287.55
    expect(html).toContain('$287.55')
  })

  it('when includeChecklist=true shows completed document names', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toContain('Annual Maintenance Checklist')
    expect(html).toContain('Oil & Filter Inspection')
  })

  it('when includeChecklist=true does NOT show pending documents', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).not.toContain('Battery Load Test')
  })

  it('when includeChecklist=false does NOT show checklist section', () => {
    const html = completionEmailHTML({ ...baseArgs, includeChecklist: false })
    expect(html).not.toContain('Annual Maintenance Checklist')
    expect(html).not.toContain('Service Checklist Completed')
  })

  it('when no parts or labor, does not render work table', () => {
    const html = completionEmailHTML({ ...baseArgs, parts: [], labor: [] })
    expect(html).not.toContain('Work Performed')
  })

  it('when total is zero, does not render total table', () => {
    const html = completionEmailHTML({ ...baseArgs, parts: [], labor: [] })
    expect(html).not.toContain('$0.00')
  })

  it('contains the completed date', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toContain('June')
  })

  it('contains generator info', () => {
    const html = completionEmailHTML(baseArgs)
    expect(html).toContain('Generac 17kW')
    expect(html).toContain('6737426')
  })
})
