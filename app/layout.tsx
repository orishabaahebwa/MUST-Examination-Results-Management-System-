import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'MUST Examination Results',
  description: 'Secure examination results management for Mbarara University of Science and Technology.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
