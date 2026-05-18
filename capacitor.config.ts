import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.dabbr.app',
  appName: 'Dabbr',
  webDir: 'out', // fallback for local static build; overridden by server.url below

  server: {
    // Start at /login — redirects to /dashboard if already signed in,
    // or shows login screen for new / signed-out users.
    url: 'https://dabbr.in/login',
    androidScheme: 'https',
  },

  android: {
    buildOptions: {
      releaseType: 'APK',
    },
  },

  plugins: {
    GoogleAuth: {
      // Web client ID — needed so Google returns an idToken Supabase can verify.
      // The Android client ID is registered via SHA-1 in Google Cloud Console.
      clientId: '482381661790-e3fgcl44fph6cdidrsq1lq412sf98tt5.apps.googleusercontent.com',
      scopes: ['profile', 'email'],
      serverClientId: '482381661790-e3fgcl44fph6cdidrsq1lq412sf98tt5.apps.googleusercontent.com',
      forceCodeForRefreshToken: true,
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#FDF8F3',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F4622A',
    },
  },
}

export default config
