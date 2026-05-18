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
