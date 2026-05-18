import { createClient } from '@/lib/supabase/server'
import LandingPage from './LandingPage'
import CapacitorLandingGuard from './CapacitorLandingGuard'

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <>
      {/* Redirect native-app users away from the marketing landing page */}
      <CapacitorLandingGuard />
      <LandingPage isLoggedIn={!!user} userEmail={user?.email ?? null} />
    </>
  )
}
