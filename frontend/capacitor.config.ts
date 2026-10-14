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
    // Push via @capacitor-firebase/messaging (replaced
    // @capacitor/push-notifications, which on iOS hands back the raw APNs
    // token — the backend sends through FCM and needs an FCM token on both
    // platforms). Show pushes as a banner with sound even while the app is
    // in the foreground.
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
  // Both @capacitor-firebase plugins ask for this to avoid a SwiftPM
  // package identity collision between them (capawesome-team/
  // capacitor-firebase#959) — needed now that there are two.
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/authentication': { symlink: true },
          '@capacitor-firebase/messaging': { symlink: true },
        },
      },
    },
  },
}

export default config
