<script setup lang="ts">
import { ref } from 'vue'
import { useOpenApeAuth } from '#imports'

const { user, fetchUser, login } = useOpenApeAuth()

const loginEmail = ref('')
const loginSubmitting = ref(false)
const loginError = ref('')

const token = ref('')
const expiresAt = ref(0)
const issuing = ref(false)
const issueError = ref('')
const copied = ref(false)

onMounted(async () => {
  await fetchUser()
})

async function onLogin() {
  if (!loginEmail.value.trim() || loginSubmitting.value) return
  loginSubmitting.value = true
  loginError.value = ''
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('openape-tasks:returnTo', '/cli-login')
    }
    await login(loginEmail.value.trim())
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    loginError.value = e.data?.title ?? 'Login failed'
  }
  finally {
    loginSubmitting.value = false
  }
}

async function issueToken() {
  if (issuing.value) return
  issuing.value = true
  issueError.value = ''
  try {
    const res = await ($fetch as any)('/api/cli/token', {
      method: 'POST',
      body: { ttl_hours: 24 * 30 },
    }) as { token: string, expires_at: number }
    token.value = res.token
    expiresAt.value = res.expires_at
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    issueError.value = e.data?.title ?? 'Failed to issue token'
  }
  finally {
    issuing.value = false
  }
}

async function copyToken() {
  try {
    await navigator.clipboard.writeText(token.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
  catch { copied.value = false }
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}
</script>

<template>
  <div class="min-h-dvh py-12 px-4">
    <div class="max-w-lg mx-auto">
      <h1 class="text-2xl font-bold mb-2 text-center">
        CLI login
      </h1>
      <p class="text-center text-sm text-gray-500 mb-6">
        Generate a bearer token for <code class="font-mono">ape-tasks</code>.
      </p>

      <UCard v-if="!user">
        <form class="space-y-4" @submit.prevent="onLogin">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Sign in first. You'll come back here to copy a token.
          </p>
          <UFormField label="Email">
            <UInput
              v-model="loginEmail"
              type="email"
              placeholder="you@example.com"
              class="w-full"
              required
            />
          </UFormField>
          <UAlert v-if="loginError" color="error" :title="loginError" @close="loginError = ''" />
          <UButton
            type="submit"
            color="primary"
            size="lg"
            block
            :loading="loginSubmitting"
            :disabled="!loginEmail.trim() || loginSubmitting"
          >
            Continue
          </UButton>
        </form>
      </UCard>

      <UCard v-else>
        <div v-if="!token" class="space-y-4">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Signed in as <span class="font-mono">{{ user.sub }}</span>.
            The token below is valid for 30 days. Paste it into the CLI when prompted.
          </p>
          <UAlert v-if="issueError" color="error" :title="issueError" @close="issueError = ''" />
          <UButton color="primary" size="lg" block :loading="issuing" @click="issueToken">
            Generate CLI token
          </UButton>
        </div>

        <div v-else class="space-y-3">
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Token expires {{ formatDate(expiresAt) }}.
          </p>
          <div class="p-3 rounded bg-gray-100 dark:bg-gray-800 font-mono text-xs break-all max-h-48 overflow-y-auto">
            {{ token }}
          </div>
          <div class="flex gap-2">
            <UButton color="primary" icon="i-lucide-copy" @click="copyToken">
              {{ copied ? 'Copied!' : 'Copy token' }}
            </UButton>
            <UButton color="neutral" variant="ghost" @click="token = ''">
              Generate another
            </UButton>
          </div>
          <div class="pt-2 text-xs text-gray-500">
            <p class="mb-1">
              Back in your terminal:
            </p>
            <pre class="p-2 rounded bg-gray-100 dark:bg-gray-800">ape-tasks login {{ user.sub }}</pre>
            <p class="mt-1">
              …then paste the token when asked.
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
