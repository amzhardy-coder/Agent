function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const env = {
  get appUrl() {
    return required("APP_URL").replace(/\/+$/, "");
  },
  get appSecret() {
    return required("APP_SECRET");
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  get supabaseUrl() {
    return required("SUPABASE_URL").replace(/\/+$/, "");
  },
  get supabaseServiceKey() {
    // Also accept the misspelled name used when the key was first added in Vercel.
    return process.env.SUPABASE_SERVICE_ROLE_KEY || required("SUPBASE_SERVICE_ROLE_KEY");
  },
};

export const redirectUri = () => `${env.appUrl}/api/oauth/callback`;
