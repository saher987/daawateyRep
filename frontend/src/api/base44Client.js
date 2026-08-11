// Compatibility shim: the ported pages/components (from
// github.com/saher987/zaffaf) call a uniform `base44.entities.X` /
// `base44.auth.Y` / `base44.functions.invoke(name, payload)` client — that
// was Base44's platform SDK. This module gives them the same call surface
// backed by *this* app's REST API instead, so pages port with little to no
// changes to their own code.
//
// This is NOT a generic re-implementation of Base44's entity filter/RLS
// engine — each method below maps the *specific* call shapes the ported
// pages actually use onto this backend's specific endpoints (documented
// inline). If a future ported page calls an entity method in a new shape,
// it needs a matching case added here (and usually a matching backend
// endpoint first) — see BUSINESS_LOGIC.md.

import { auth as firebaseAuth } from '@/lib/firebase'
import { signOut } from 'firebase/auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, { method = 'GET', body, auth = true, params } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (auth) {
    const token = await firebaseAuth.currentUser?.getIdToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let url = `${API_BASE_URL}${path}`
  if (params) {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) qs.set(key, value)
    }
    const qsString = qs.toString()
    if (qsString) url += `?${qsString}`
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    let detail
    try {
      detail = (await res.json()).detail
    } catch {
      /* body wasn't JSON — fall through to the generic message below */
    }
    throw new ApiError(detail || `${method} ${path} failed: ${res.status}`, res.status)
  }
  if (res.status === 204) return null
  return res.json()
}

// --- auth --------------------------------------------------------------

function toBase44User(me) {
  if (!me) return null
  const full_name = [me.nickname, me.first_name, me.last_name].filter(Boolean).join(' ') || me.email
  return { ...me, full_name }
}

const authApi = {
  async me() {
    return toBase44User(await request('/api/me'))
  },

  async updateMe(data) {
    return toBase44User(await request('/api/profile', { method: 'PUT', body: data }))
  },

  async isAuthenticated() {
    await firebaseAuth.authStateReady()
    return !!firebaseAuth.currentUser
  },

  async logout(redirectTo) {
    await signOut(firebaseAuth)
    if (typeof redirectTo === 'string') {
      window.location.href = redirectTo
    }
  },

  redirectToLogin(_returnUrl) {
    // The original built a same-origin-validated returnTo redirect
    // (authReturnTo.js) around Base44's own OAuth redirect flow — not
    // ported, since Firebase's sign-in doesn't work that way (native:
    // system picker, web: popup). Landing on /login is enough; there's no
    // return-to-previous-page behavior yet.
    window.location.href = '/login'
  },
}

// --- entities ------------------------------------------------------------

const eventsApi = {
  async list() {
    return request('/api/events')
  },
  async filter(query) {
    if ('id' in query) {
      const event = await request(`/api/events/${query.id}`)
      return [event]
    }
    if ('owner_emails' in query || 'owner_email' in query || 'created_by' in query) {
      // MyEvent.jsx probes three legacy/current shapes for "events I own" —
      // /api/my-events already covers all of them server-side in one call.
      return request('/api/my-events')
    }
    console.warn('base44Client shim: unhandled Event.filter() query', query)
    return []
  },
  async create(data) {
    return request('/api/events', { method: 'POST', body: data })
  },
  async update(id, data) {
    return request(`/api/events/${id}`, { method: 'PUT', body: data })
  },
  async delete(id) {
    return request(`/api/events/${id}`, { method: 'DELETE' })
  },
}

const invitationRecipientsApi = {
  async list(_sort, limit) {
    // Cross-event (Invitees.jsx / Dashboard.jsx) — distinct from filter()
    // below, which is always "my own invitations".
    return request('/api/recipients', { params: { limit } })
  },
  async filter(query) {
    // Every current call site queries the *signed-in user's own*
    // invitations (by their own phone/email/user_id) — /api/my-invitations
    // already does that OR-match server-side, so the specific key in
    // `query` doesn't change which endpoint to call, just confirms intent.
    if ('phone' in query || 'email' in query || 'user_id' in query) {
      const mine = await request('/api/my-invitations')
      return mine.map((entry) => entry.recipient)
    }
    console.warn('base44Client shim: unhandled InvitationRecipient.filter() query', query)
    return []
  },
  async update(_id, _data) {
    // The only call sites for this were redundant client-side "mark as
    // opened" bookkeeping — already handled server-side by
    // GET /api/invitations/{token} (and reflected back through
    // /api/my-invitations), so this is a deliberate no-op rather than a
    // missing feature. See BUSINESS_LOGIC.md.
    return null
  },
  subscribe(_callback) {
    // Base44's realtime entity subscriptions have no equivalent here yet —
    // pages relying on this for live updates fall back to their own
    // polling/refetch-after-mutation, which is what actually drives their
    // UI already. Returns a no-op unsubscribe, matching the real API shape.
    return () => {}
  },
}

const venuesApi = {
  async list() {
    return request('/api/venues')
  },
  async get(id) {
    return request(`/api/venues/${id}`)
  },
  async create(data) {
    return request('/api/venues', { method: 'POST', body: data })
  },
  async update(id, data) {
    return request(`/api/venues/${id}`, { method: 'PUT', body: data })
  },
  async delete(id) {
    return request(`/api/venues/${id}`, { method: 'DELETE' })
  },
}

const usersApi = {
  async filter(query) {
    const params = {}
    if (query.phone) params.phone = query.phone
    if (query.email) params.email = query.email
    return request('/api/users', { params })
  },
  async list(_sort, limit) {
    return request('/api/users', { params: { limit } })
  },
  async update(id, data) {
    return request(`/api/users/${id}`, { method: 'PUT', body: data })
  },
}

// A separate namespace from `entities.User`, matching Base44's own split —
// inviteUser is an account-provisioning action, not an entity CRUD call.
const usersNamespaceApi = {
  async inviteUser(email, role, phone) {
    return request('/api/invites', { method: 'POST', body: { email, role, phone } })
  },
}

const eventRequestsApi = {
  async list() {
    return request('/api/event-requests')
  },
  async create(data) {
    return request('/api/event-requests', { method: 'POST', body: data })
  },
  async update(id, data) {
    return request(`/api/event-requests/${id}`, { method: 'PUT', body: data })
  },
}

const plannedWeddingsApi = {
  async list() {
    return request('/api/planned-weddings')
  },
  async create(data) {
    return request('/api/planned-weddings', { method: 'POST', body: data })
  },
  async update(id, data) {
    return request(`/api/planned-weddings/${id}`, { method: 'PUT', body: data })
  },
  async delete(id) {
    return request(`/api/planned-weddings/${id}`, { method: 'DELETE' })
  },
}

const notificationsApi = {
  async filter(query) {
    return request('/api/notifications', {
      params: { unread_only: query?.is_read === false ? true : undefined },
    })
  },
  async update(id, data) {
    if (data?.is_read === true) {
      return request(`/api/notifications/${id}/read`, { method: 'POST' })
    }
    console.warn('base44Client shim: unhandled Notification.update() payload', data)
    return null
  },
}

// --- functions.invoke ---------------------------------------------------

// Reshapes the backend's flat, guest-safe PublicInvitationOut into the
// {recipient, event, displayName} nesting InvitationPage.jsx destructures —
// keeping that page's own code identical to the original's.
function toNestedInvitation(flat) {
  return {
    recipient: {
      id: flat.recipient_id,
      rsvp_status: flat.rsvp_status,
      rsvp_guests_count: flat.rsvp_guests_count,
      guests_count: flat.invited_guests_count,
    },
    event: {
      title: flat.event_title,
      type: flat.event_type,
      date: flat.event_date,
      venue_name: flat.venue_name,
      venue_city: flat.venue_city,
      venue_address: flat.venue_address,
      venue_map_url: flat.venue_map_url,
      cover_image_url: flat.cover_image_url,
      invitation_image_url: flat.invitation_image_url,
      description: flat.description,
      groom_name: flat.groom_name,
      bride_name: flat.bride_name,
      theme_color: flat.theme_color,
    },
    displayName: flat.display_name,
  }
}

const functionHandlers = {
  async getInvitationByToken({ token }) {
    return toNestedInvitation(await request(`/api/invitations/${token}`, { auth: false }))
  },
  async getEventRecipients({ eventId }) {
    const recipients = await request(`/api/events/${eventId}/recipients`)
    return { recipients }
  },
  async createInvitationRecipient(data) {
    const { eventId, externalFullName, guestsCount, groupLabel, userId, ...rest } = data
    return request(`/api/events/${eventId}/recipients`, {
      method: 'POST',
      body: {
        ...rest,
        external_full_name: externalFullName,
        guests_count: guestsCount,
        group_label: groupLabel,
        user_id: userId,
      },
    })
  },
  async submitRsvp({ recipientId, rsvpStatus, guestsCount, message }) {
    return request(`/api/invitation-recipients/${recipientId}/rsvp`, {
      method: 'POST',
      auth: false,
      body: { rsvp_status: rsvpStatus, guests_count: guestsCount, message },
    })
  },
  async sendOtp({ phone }) {
    return request('/api/otp/send', { method: 'POST', auth: false, body: { phone } })
  },
  async verifyOtpAndLink({ phone, otpCode, recipientId }) {
    return request('/api/otp/verify', {
      method: 'POST',
      auth: false,
      body: { phone, otp_code: otpCode, recipient_id: recipientId },
    })
  },
  async notifyEventRequest(_payload) {
    // EventRequest.create() already notifies admins/managers server-side
    // (see backend/app/routers/event_requests.py) — this call is kept only
    // so RequestEventDialog.jsx's original two-call code doesn't need
    // editing; it's a deliberate no-op here.
    return { success: true }
  },
  async deleteAccount(_payload) {
    await request('/api/account', { method: 'DELETE' })
    return { success: true }
  },
  // Not wired up yet (Phase 6 — needs RESEND_API_KEY provisioned):
  async sendSupportEmail() {
    console.warn('base44Client shim: sendSupportEmail is not implemented yet (Phase 6)')
    return { success: false }
  },
  async notifyEventUpdate() {
    console.warn('base44Client shim: notifyEventUpdate is not implemented yet (Phase 6)')
    return { success: false }
  },
  async sendInvitationSms() {
    console.warn('base44Client shim: sendInvitationSms is not implemented yet (Phase 6)')
    return { success: false }
  },
}

const functionsApi = {
  async invoke(name, payload) {
    const handler = functionHandlers[name]
    if (!handler) {
      throw new Error(`base44Client shim: no handler for functions.invoke('${name}')`)
    }
    return { data: await handler(payload ?? {}) }
  },
}

const integrationsApi = {
  Core: {
    async UploadFile({ file }) {
      // No real file storage yet — a Cloud Storage bucket is its own
      // piece of infra to provision (see BUSINESS_LOGIC.md), not built as
      // part of this pass. Stand-in: inline the file as a base64 data:
      // URL, so image upload/preview works end to end today. Fine for a
      // handful of small images; not something to leave in place once
      // real uploads matter — data: URLs bloat every row/response that
      // stores one and are never cleaned up.
      const file_url = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      return { file_url }
    },
  },
}

export const base44 = {
  auth: authApi,
  users: usersNamespaceApi,
  entities: {
    Event: eventsApi,
    InvitationRecipient: invitationRecipientsApi,
    Venue: venuesApi,
    User: usersApi,
    EventRequest: eventRequestsApi,
    Notification: notificationsApi,
    PlannedWedding: plannedWeddingsApi,
  },
  functions: functionsApi,
  integrations: integrationsApi,
}
