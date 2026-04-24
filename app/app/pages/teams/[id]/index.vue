<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useOpenApeAuth } from '#imports'

const { user, fetchUser } = useOpenApeAuth()
const route = useRoute()
const teamId = computed(() => String(route.params.id))

interface TeamMember { email: string, role: 'owner' | 'editor' | 'viewer', joined_at: number }
interface TaskCount { open: number, doing: number, done: number, archived: number, total: number }
interface TeamDetail {
  id: string
  name: string
  description: string | null
  created_at: number
  members: TeamMember[]
  task_count: TaskCount
}

type TaskStatus = 'open' | 'doing' | 'done' | 'archived'
type TaskPriority = 'low' | 'med' | 'high' | null
interface Task {
  id: string
  team_id: string
  title: string
  notes: string
  status: TaskStatus
  priority: TaskPriority
  due_at: number | null
  assignee_email: string | null
  sort_order: number
  owner_email: string
  created_at: number
  updated_at: number
  updated_by: string
  completed_at: number | null
}

interface InviteSummary {
  id: string
  created_by: string
  note: string | null
  max_uses: number
  used_count: number
  expires_at: number
  created_at: number
}

const detail = ref<TeamDetail | null>(null)
const tasks = ref<Task[]>([])
const loading = ref(true)
const error = ref('')

const newTitle = ref('')
const adding = ref(false)
const addError = ref('')

const editingId = ref<string | null>(null)
const editingTitle = ref('')
const editInputEl = ref<HTMLInputElement | null>(null)

const showCompleted = ref(false)
const showMembers = ref(false)
const showInvites = ref(false)

const invites = ref<InviteSummary[]>([])
const invitesLoading = ref(false)
const invitesError = ref('')

const showInviteModal = ref(false)
const inviteMaxUses = ref(5)
const inviteExpiresIn = ref('7d')
const inviteNote = ref('')
const creating = ref(false)
const createError = ref('')
const createdUrl = ref('')
const copied = ref(false)

const openTasks = computed(() =>
  tasks.value
    .filter(t => t.status === 'open' || t.status === 'doing')
    .sort((a, b) => a.sort_order - b.sort_order || a.created_at - b.created_at),
)
const completedTasks = computed(() =>
  tasks.value
    .filter(t => t.status === 'done')
    .sort((a, b) => (b.completed_at ?? 0) - (a.completed_at ?? 0)),
)

const callerRole = computed<'owner' | 'editor' | 'viewer' | null>(() => {
  if (!detail.value || !user.value) return null
  return detail.value.members.find(m => m.email === user.value?.sub)?.role ?? null
})
const canEdit = computed(() => callerRole.value === 'owner' || callerRole.value === 'editor')

onMounted(async () => {
  await fetchUser()
  if (!user.value) {
    await navigateTo('/login')
    return
  }
  await Promise.all([loadDetail(), loadTasks()])
  loading.value = false
})

async function loadDetail() {
  try {
    detail.value = await ($fetch as any)(`/api/teams/${teamId.value}`) as TeamDetail
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    error.value = e.data?.title ?? 'Failed to load team'
    detail.value = null
  }
}

async function loadTasks() {
  try {
    tasks.value = await ($fetch as any)(`/api/teams/${teamId.value}/tasks?status=open,doing,done`) as Task[]
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    error.value = e.data?.title ?? 'Failed to load tasks'
  }
}

async function addTask() {
  const title = newTitle.value.trim()
  if (!title || adding.value) return
  adding.value = true
  addError.value = ''
  try {
    const created = await ($fetch as any)(`/api/teams/${teamId.value}/tasks`, {
      method: 'POST',
      body: { title },
    }) as Task
    tasks.value.push(created)
    newTitle.value = ''
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    addError.value = e.data?.title ?? 'Failed to add task'
  }
  finally {
    adding.value = false
  }
}

async function toggleDone(t: Task) {
  if (!canEdit.value) return
  const next: TaskStatus = t.status === 'done' ? 'open' : 'done'
  const prevStatus = t.status
  const prevCompletedAt = t.completed_at
  t.status = next
  t.completed_at = next === 'done' ? Math.floor(Date.now() / 1000) : null
  try {
    const updated = await ($fetch as any)(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      body: { status: next },
    }) as Task
    Object.assign(t, updated)
  }
  catch (err: unknown) {
    t.status = prevStatus
    t.completed_at = prevCompletedAt
    const e = err as { data?: { title?: string } }
    error.value = e.data?.title ?? 'Failed to update task'
  }
}

async function deleteTask(id: string) {
  if (!canEdit.value) return
  const before = tasks.value
  tasks.value = tasks.value.filter(t => t.id !== id)
  try {
    await ($fetch as any)(`/api/tasks/${id}`, { method: 'DELETE' })
  }
  catch (err: unknown) {
    tasks.value = before
    const e = err as { data?: { title?: string } }
    error.value = e.data?.title ?? 'Failed to delete task'
  }
}

function startEdit(t: Task) {
  if (!canEdit.value || t.status === 'done') return
  editingId.value = t.id
  editingTitle.value = t.title
  nextTick(() => editInputEl.value?.focus())
}

async function saveEdit(t: Task) {
  const next = editingTitle.value.trim()
  editingId.value = null
  if (!next || next === t.title) return
  const prev = t.title
  t.title = next
  try {
    const updated = await ($fetch as any)(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      body: { title: next },
    }) as Task
    Object.assign(t, updated)
  }
  catch (err: unknown) {
    t.title = prev
    const e = err as { data?: { title?: string } }
    error.value = e.data?.title ?? 'Failed to rename task'
  }
}

function cancelEdit() {
  editingId.value = null
}

async function removeMember(email: string) {
  if (!confirm(`Remove ${email} from this team?`)) return
  try {
    await ($fetch as any)(`/api/teams/${teamId.value}/members/${encodeURIComponent(email)}`, { method: 'DELETE' })
    await loadDetail()
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    error.value = e.data?.title ?? 'Failed to remove member'
  }
}

async function toggleInvites() {
  showInvites.value = !showInvites.value
  if (showInvites.value) await loadInvites()
}

async function loadInvites() {
  invitesLoading.value = true
  invitesError.value = ''
  try {
    invites.value = await ($fetch as any)(`/api/teams/${teamId.value}/invites`) as InviteSummary[]
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    invitesError.value = e.data?.title ?? 'Failed to load invites'
    invites.value = []
  }
  finally {
    invitesLoading.value = false
  }
}

function openInviteModal() {
  createdUrl.value = ''
  createError.value = ''
  inviteMaxUses.value = 5
  inviteExpiresIn.value = '7d'
  inviteNote.value = ''
  copied.value = false
  showInviteModal.value = true
}

async function createInvite() {
  if (creating.value) return
  creating.value = true
  createError.value = ''
  try {
    const result = await ($fetch as any)(`/api/teams/${teamId.value}/invites`, {
      method: 'POST',
      body: {
        max_uses: inviteMaxUses.value,
        expires_in: inviteExpiresIn.value,
        note: inviteNote.value.trim() || undefined,
      },
    }) as { url: string }
    createdUrl.value = result.url
    await loadInvites()
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    createError.value = e.data?.title ?? 'Failed to create invite'
  }
  finally {
    creating.value = false
  }
}

async function copyUrl() {
  if (!createdUrl.value) return
  try {
    await navigator.clipboard.writeText(createdUrl.value)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
  catch {
    copied.value = false
  }
}

async function revokeInvite(id: string) {
  if (!confirm('Revoke this invite? Anyone with the URL will no longer be able to join.')) return
  try {
    await ($fetch as any)(`/api/invites/${id}`, { method: 'DELETE' })
    await loadInvites()
  }
  catch (err: unknown) {
    const e = err as { data?: { title?: string } }
    invitesError.value = e.data?.title ?? 'Failed to revoke invite'
  }
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

function dueLabel(ts: number | null): string | null {
  if (!ts) return null
  const now = Math.floor(Date.now() / 1000)
  const diff = ts - now
  const absH = Math.abs(diff) / 3600
  if (absH < 24) {
    const d = new Date(ts * 1000)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  const days = Math.round(diff / 86400)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days < 7) return `In ${days}d`
  return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="min-h-dvh bg-zinc-950 text-zinc-100 pb-24">
    <!-- Top bar -->
    <header class="sticky top-0 z-10 bg-zinc-950/90 backdrop-blur border-b border-zinc-900">
      <div class="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
        <UButton
          to="/teams"
          color="neutral"
          variant="ghost"
          icon="i-lucide-chevron-left"
          size="md"
          class="-ml-2 text-primary-500 hover:bg-transparent"
        >
          Lists
        </UButton>
      </div>
    </header>

    <div class="max-w-2xl mx-auto px-4 pt-4">
      <div v-if="loading" class="text-center text-zinc-500 mt-10">
        Loading…
      </div>

      <UAlert v-else-if="error && !detail" color="error" :title="error" />

      <template v-else-if="detail">
        <!-- List title -->
        <div class="mb-6 flex items-center gap-3">
          <div class="size-10 rounded-full bg-primary-500 flex items-center justify-center">
            <UIcon name="i-lucide-list-checks" class="size-5 text-white" />
          </div>
          <div class="min-w-0">
            <h1 class="text-3xl font-bold text-primary-500 leading-tight truncate">
              {{ detail.name }}
            </h1>
            <p v-if="detail.description" class="text-sm text-zinc-500 mt-0.5 truncate">
              {{ detail.description }}
            </p>
          </div>
        </div>

        <!-- Add task -->
        <form
          v-if="canEdit"
          class="mb-4 flex items-center gap-2"
          @submit.prevent="addTask"
        >
          <button
            type="submit"
            class="size-8 shrink-0 rounded-full flex items-center justify-center text-primary-500 hover:bg-primary-500/10 transition disabled:opacity-40"
            :disabled="!newTitle.trim() || adding"
            :title="adding ? 'Adding…' : 'Add task'"
          >
            <UIcon name="i-lucide-plus-circle" class="size-7" />
          </button>
          <input
            v-model="newTitle"
            type="text"
            maxlength="200"
            placeholder="New reminder"
            class="flex-1 bg-transparent border-0 outline-none text-lg placeholder:text-zinc-600"
            :disabled="adding"
          >
        </form>
        <UAlert v-if="addError" color="error" :title="addError" class="mb-3" @close="addError = ''" />

        <!-- Open tasks -->
        <section class="mb-8">
          <div v-if="openTasks.length === 0 && completedTasks.length === 0" class="text-center py-10 text-zinc-500">
            <UIcon name="i-lucide-check-check" class="size-10 mx-auto mb-2 opacity-40" />
            <p>No reminders</p>
          </div>
          <ul class="divide-y divide-zinc-900">
            <li
              v-for="t in openTasks"
              :key="t.id"
              class="group flex items-center gap-3 py-3 min-h-[48px]"
            >
              <button
                type="button"
                class="size-6 shrink-0 rounded-full border-2 border-zinc-600 hover:border-primary-500 transition flex items-center justify-center"
                :disabled="!canEdit"
                :aria-label="`Mark ${t.title} as done`"
                @click="toggleDone(t)"
              />

              <div class="min-w-0 flex-1">
                <input
                  v-if="editingId === t.id"
                  ref="editInputEl"
                  v-model="editingTitle"
                  type="text"
                  maxlength="200"
                  class="w-full bg-transparent border-0 outline-none text-base"
                  @blur="saveEdit(t)"
                  @keydown.enter.prevent="saveEdit(t)"
                  @keydown.escape.prevent="cancelEdit"
                >
                <button
                  v-else
                  type="button"
                  class="block w-full text-left truncate text-base cursor-text"
                  :class="{ 'cursor-default': !canEdit }"
                  @click="startEdit(t)"
                >
                  {{ t.title }}
                </button>
                <div v-if="t.due_at || t.assignee_email" class="flex items-center gap-2 mt-0.5">
                  <span
                    v-if="t.due_at"
                    class="text-xs"
                    :class="t.due_at < Date.now() / 1000 ? 'text-red-400' : 'text-primary-500'"
                  >
                    <UIcon name="i-lucide-calendar" class="size-3 inline -mt-0.5" />
                    {{ dueLabel(t.due_at) }}
                  </span>
                  <span v-if="t.assignee_email" class="text-xs text-zinc-500 truncate">
                    · {{ t.assignee_email }}
                  </span>
                </div>
              </div>

              <button
                v-if="canEdit"
                type="button"
                class="size-8 rounded-full text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center"
                :aria-label="`Delete ${t.title}`"
                @click="deleteTask(t.id)"
              >
                <UIcon name="i-lucide-trash-2" class="size-4" />
              </button>
            </li>
          </ul>
        </section>

        <!-- Completed -->
        <section v-if="completedTasks.length > 0" class="mb-8">
          <button
            type="button"
            class="flex items-center gap-2 w-full py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
            @click="showCompleted = !showCompleted"
          >
            <UIcon :name="showCompleted ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
            Completed · {{ completedTasks.length }}
          </button>
          <ul v-if="showCompleted" class="divide-y divide-zinc-900 mt-1">
            <li
              v-for="t in completedTasks"
              :key="t.id"
              class="group flex items-center gap-3 py-3 min-h-[48px]"
            >
              <button
                type="button"
                class="size-6 shrink-0 rounded-full border-2 border-primary-500 bg-primary-500 flex items-center justify-center"
                :disabled="!canEdit"
                :aria-label="`Mark ${t.title} as open`"
                @click="toggleDone(t)"
              >
                <UIcon name="i-lucide-check" class="size-4 text-white" />
              </button>

              <div class="min-w-0 flex-1 text-zinc-500 line-through truncate">
                {{ t.title }}
              </div>

              <button
                v-if="canEdit"
                type="button"
                class="size-8 rounded-full text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100 focus:opacity-100 flex items-center justify-center"
                :aria-label="`Delete ${t.title}`"
                @click="deleteTask(t.id)"
              >
                <UIcon name="i-lucide-trash-2" class="size-4" />
              </button>
            </li>
          </ul>
        </section>

        <!-- Members -->
        <section class="mt-10 border-t border-zinc-900 pt-4">
          <button
            type="button"
            class="flex items-center gap-2 w-full py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
            @click="showMembers = !showMembers"
          >
            <UIcon :name="showMembers ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
            Members · {{ detail.members.length }}
          </button>
          <ul v-if="showMembers" class="divide-y divide-zinc-900 mt-1">
            <li
              v-for="m in detail.members"
              :key="m.email"
              class="flex items-center gap-3 py-3 min-h-[48px]"
            >
              <UIcon name="i-lucide-user" class="size-5 text-zinc-500 shrink-0" />
              <div class="min-w-0 flex-1 font-mono text-sm truncate">
                {{ m.email }}
              </div>
              <UBadge :color="m.role === 'owner' ? 'primary' : 'neutral'" variant="subtle" size="xs">
                {{ m.role }}
              </UBadge>
              <button
                v-if="callerRole === 'owner' && m.email !== user?.sub"
                type="button"
                class="size-8 rounded-full text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition flex items-center justify-center"
                :aria-label="`Remove ${m.email}`"
                @click="removeMember(m.email)"
              >
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </li>
          </ul>
        </section>

        <!-- Invites -->
        <section v-if="canEdit" class="border-t border-zinc-900 pt-4">
          <div class="flex items-center justify-between">
            <button
              type="button"
              class="flex items-center gap-2 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-200"
              @click="toggleInvites"
            >
              <UIcon :name="showInvites ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
              Invite links
            </button>
            <UButton color="primary" variant="ghost" icon="i-lucide-link" size="sm" @click="openInviteModal">
              New link
            </UButton>
          </div>
          <div v-if="showInvites" class="mt-1">
            <div v-if="invitesLoading" class="text-sm text-zinc-500 py-2">
              Loading…
            </div>
            <UAlert v-else-if="invitesError" color="error" :title="invitesError" />
            <div v-else-if="invites.length === 0" class="text-sm text-zinc-500 italic py-2">
              No active invites.
            </div>
            <ul v-else class="divide-y divide-zinc-900">
              <li
                v-for="inv in invites"
                :key="inv.id"
                class="flex items-center gap-3 py-3 min-h-[48px]"
              >
                <UIcon name="i-lucide-link" class="size-4 text-zinc-500 shrink-0" />
                <div class="min-w-0 flex-1 text-sm">
                  <div class="truncate">
                    By <span class="font-mono">{{ inv.created_by }}</span> · {{ inv.used_count }}/{{ inv.max_uses }}
                  </div>
                  <div class="text-xs text-zinc-500 truncate">
                    Expires {{ formatDate(inv.expires_at) }}
                    <span v-if="inv.note" class="italic">— "{{ inv.note }}"</span>
                  </div>
                </div>
                <button
                  type="button"
                  class="size-8 rounded-full text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition flex items-center justify-center"
                  :aria-label="`Revoke invite ${inv.id}`"
                  @click="revokeInvite(inv.id)"
                >
                  <UIcon name="i-lucide-x" class="size-4" />
                </button>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>

    <UModal v-model:open="showInviteModal" :dismissible="!creating">
      <template #content>
        <div class="p-6 space-y-4 max-w-md">
          <h3 class="text-lg font-semibold">
            Create invite link
          </h3>

          <div v-if="!createdUrl">
            <div class="space-y-3">
              <UFormField label="Max uses">
                <UInput v-model.number="inviteMaxUses" type="number" min="1" max="100" />
              </UFormField>
              <UFormField label="Expires in" help="e.g. 7d, 24h, 30m">
                <UInput v-model="inviteExpiresIn" placeholder="7d" />
              </UFormField>
              <UFormField label="Note (optional)" help="Context shown to the recipient.">
                <UInput v-model="inviteNote" maxlength="200" placeholder="Welcome to the team!" />
              </UFormField>
            </div>
            <UAlert v-if="createError" color="error" :title="createError" class="mt-3" @close="createError = ''" />
            <div class="flex gap-2 pt-4">
              <UButton color="primary" :loading="creating" @click="createInvite">
                Generate URL
              </UButton>
              <UButton color="neutral" variant="ghost" :disabled="creating" @click="showInviteModal = false">
                Cancel
              </UButton>
            </div>
          </div>

          <div v-else>
            <p class="text-sm text-zinc-400 mb-2">
              Share this URL. Anyone who opens it will be able to join the team (up to the uses limit before expiry).
            </p>
            <div class="p-3 rounded bg-zinc-800 font-mono text-xs break-all">
              {{ createdUrl }}
            </div>
            <div class="flex gap-2 pt-4">
              <UButton color="primary" icon="i-lucide-copy" @click="copyUrl">
                {{ copied ? 'Copied!' : 'Copy URL' }}
              </UButton>
              <UButton color="neutral" variant="ghost" @click="showInviteModal = false">
                Done
              </UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
