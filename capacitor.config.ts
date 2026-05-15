import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.dabbr.app',
  appName: 'Dabbr',
  webDir: 'out', // fallback for local static build; overridden by server.url below

  server: {
    // ─── Point this to your deployed URL once you deploy (e.g. Vercel) ───
    // url: 'https://your-app.vercel.app',
    // For local testing on the same WiFi, use your machine's local IP:
    // url: 'http://192.168.x.x:3000',
    cleartext: true, // allow HTTP during development
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
