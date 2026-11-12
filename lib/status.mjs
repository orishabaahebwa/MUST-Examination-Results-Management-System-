const presentations = Object.freeze({
  PENDING: { label: 'Pending', tone: 'warning' },
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SUBMITTED: { label: 'Submitted', tone: 'info' },
  UNDER_REVIEW: { label: 'Under Review', tone: 'warning' },
  RETURNED: { label: 'Returned', tone: 'warning' },
  APPROVED: { label: 'Approved', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  UNPUBLISHED: { label: 'Unpublished', tone: 'neutral' },
  COMPLETED: { label: 'Completed', tone: 'success' },
  FAILED: { label: 'Failed', tone: 'danger' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' },
  PLANNED: { label: 'Planned', tone: 'info' },
  OPEN: { label: 'Open', tone: 'info' },
  CLOSED: { label: 'Closed', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', tone: 'warning' },
  RESOLVED: { label: 'Resolved', tone: 'success' },
  REVIEWED: { label: 'Reviewed', tone: 'success' },
  ENROLLED: { label: 'Enrolled', tone: 'success' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
})

/** @param {unknown} value */
export function getStatusAppearance(value) {
  if (typeof value === 'boolean') {
    return value ? presentations.ACTIVE : presentations.INACTIVE
  }

  const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  if (!normalized) return { label: 'Unknown', tone: 'neutral' }

  const known = presentations[normalized]
  if (known) return known

  return {
    label: normalized.split('_').map((word) => word[0] + word.slice(1).toLowerCase()).join(' '),
    tone: 'neutral',
  }
}
