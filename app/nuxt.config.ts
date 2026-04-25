// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: { enabled: true },

  modules: ['@nuxt/ui', '@openape/nuxt-auth-sp'],

  css: ['~/assets/main.css'],

  runtimeConfig: {
    // DB — overridden at runtime by NUXT_TURSO_URL. Defaults to a local dev
    // file so `pnpm dev` works without any env setup. Production MUST set
    // NUXT_TURSO_URL (path under shared/ so it survives deploy rotation).
    tursoUrl: 'file:./dev.db',
    tursoAuthToken: '',
    // Invite JWT — runtime-overridden by NUXT_INVITE_SECRET.
    inviteSecret: 'dev-invite-secret-change-me-min-32-chars',
    // CLI bearer token JWT (HS256) — runtime-overridden by NUXT_CLI_TOKEN_SECRET.
    cliTokenSecret: 'dev-cli-token-secret-change-me-min-32-chars!!',
    // OpenApe IdP for /api/cli/exchange JWKS verification. NUXT_IDP_ISSUER /
    // NUXT_IDP_JWKS_URI / NUXT_IDP_AUDIENCE override at runtime.
    idpIssuer: 'https://id.openape.ai',
    idpJwksUri: 'https://id.openape.ai/.well-known/jwks.json',
    idpAudience: 'apes-cli',
    public: {
      siteName: 'OpenApe Tasks',
    },
  },

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  openapeSp: {
    clientId: process.env.NUXT_OPENAPE_CLIENT_ID || 'tasks.openape.ai',
    spName: 'OpenApe Tasks',
    // Canonical env: NUXT_OPENAPE_SP_SESSION_SECRET. NUXT_SESSION_SECRET is
    // kept as a legacy fallback for existing prod .env files — remove after
    // all deploys have been rotated.
    sessionSecret: process.env.NUXT_OPENAPE_SP_SESSION_SECRET
      || process.env.NUXT_SESSION_SECRET
      || 'dev-session-secret-at-least-32-characters-long',
    fallbackIdpUrl: process.env.NUXT_FALLBACK_IDP_URL || 'https://id.openape.ai',
  },

  nitro: {
    preset: 'node-server',
  },
})
