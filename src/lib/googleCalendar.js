const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

function buildEvent(job, customer) {
  const startTime = new Date(job.scheduled_date)
  const durationHours = job.estimated_duration ? parseFloat(job.estimated_duration) : 2
  const endTime = new Date(startTime.getTime() + durationHours * 60 * 60 * 1000)
  const customerName = customer?.name || job.customer_name || ''

  return {
    summary: `${job.job_type ? job.job_type.replace(/_/g, ' ').toUpperCase() : 'SERVICE'} — ${customerName}`,
    description: [
      `GenFlow Job ID: ${job.id}`,
      `Customer: ${customerName}`,
      `Phone: ${customer?.phone || ''}`,
      `Generator: ${customer?.generator_model || ''}`,
      `Notes: ${job.notes || ''}`,
      '',
      'GENFLOW_JOB_ID:' + job.id,
    ].join('\n'),
    location: customer?.address || '',
    start: { dateTime: startTime.toISOString(), timeZone: 'America/New_York' },
    end: { dateTime: endTime.toISOString(), timeZone: 'America/New_York' },
    colorId: getEventColor(job.job_type),
    reminders: {
      useDefault: false,
      overrides: [{ method: 'popup', minutes: 60 }],
    },
  }
}

function checkStatus(res) {
  if (res.status === 401) throw new Error('401: Google token expired')
  if (!res.ok) throw new Error(`Calendar API error: ${res.status}`)
}

export async function createCalendarEvent(job, customer, accessToken) {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildEvent(job, customer)),
  })
  checkStatus(res)
  const data = await res.json()
  return data.id
}

export async function updateCalendarEvent(calendarEventId, job, customer, accessToken) {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${calendarEventId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildEvent(job, customer)),
  })
  if (res.status === 404) return createCalendarEvent(job, customer, accessToken)
  checkStatus(res)
  const data = await res.json()
  return data.id
}

export async function deleteCalendarEvent(calendarEventId, accessToken) {
  const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${calendarEventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 404) return // already deleted
  checkStatus(res)
}

export async function getRecentCalendarChanges(accessToken, sinceTimestamp) {
  const updatedMin = sinceTimestamp
    ? new Date(sinceTimestamp).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const params = new URLSearchParams({
    updatedMin,
    singleEvents: 'true',
    orderBy: 'updated',
    maxResults: '250',
  })

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  checkStatus(res)
  const data = await res.json()

  return (data.items || []).reduce((acc, event) => {
    const match = (event.description || '').match(/GENFLOW_JOB_ID:([^\s\n]+)/)
    if (match) {
      acc.push({
        jobId: match[1],
        newStartTime: event.start?.dateTime || event.start?.date,
        newEndTime: event.end?.dateTime || event.end?.date,
        calendarEventId: event.id,
      })
    }
    return acc
  }, [])
}

function getEventColor(jobType) {
  const colors = {
    emergency: '11',
    diagnostic_repair: '6',
    maintenance: '2',
    battery_replacement: '5',
    warranty: '7',
    inspection: '8',
  }
  return colors[jobType] || '1'
}
