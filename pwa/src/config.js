export const HOMEWORKOUTS_CONFIG = {
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''
  },
  backend: {
    execUrl: import.meta.env.VITE_BACKEND_EXEC_URL || '',
    token: import.meta.env.VITE_BACKEND_TOKEN || '',
    proxyBase: import.meta.env.VITE_PROXY_BASE || ''
  }
}

// Optional telemetry endpoint (POST or beacon) to receive migration pings
HOMEWORKOUTS_CONFIG.telemetryUrl = import.meta.env.VITE_TELEMETRY_URL || ''
