// Stub for @capacitor-community/contacts — used in web/Vercel builds.
// The real plugin is only available in native Capacitor iOS/Android apps.
export const Contacts = {
  requestPermissions: async () => ({ contacts: 'denied' as const }),
  getContacts: async () => ({ contacts: [] }),
}
