import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.daawatey.app',
  appName: 'daawatey',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      // Providers the native plugin will initialize. Apple isn't listed —
      // added once an Apple Developer account is in hand (see ARCHITECTURE.md).
      providers: ['google.com'],
      skipNativeAuth: true,
    },
  },
}

export default config
