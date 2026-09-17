import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.anthroweb.app',
  appName: 'AnthroWeb',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
