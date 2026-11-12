const APP_ORIGIN = 'https://must.invalid'

export function safeAppPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) {
    return '/dashboard'
  }

  try {
    const destination = new URL(value, APP_ORIGIN)
    if (destination.origin !== APP_ORIGIN || destination.pathname.startsWith('//')) return '/dashboard'
    return destination.pathname + destination.search + destination.hash
  } catch {
    return '/dashboard'
  }
}
