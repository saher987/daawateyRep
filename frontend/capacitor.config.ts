import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.daawatey.app',
  appName: 'daawatey',
  webDir: 'dist',
  plugins: {
    FirebaseAuthentication: {
      // Apple Developer account is in hand as of the iOS/Apple Sign-In
      // milestone (see ARCHITECTURE.md) — apple.com added alongside
      // google.com. Harmless on Android (Login.jsx/Register.jsx hide the
      // Apple button there; this just means the native plugin knows the
      // provider exists, nothing more).
      providers: ['google.com', 'apple.com'],
      skipNativeAuth: true,
    },
  },
}

export default config
