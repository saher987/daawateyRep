import { auth } from './firebase'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

async function authedFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) {
    throw new Error('Not signed in')
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`)
  }

  return res.json() as Promise<T>
}

export interface Me {
  uid: string
  email: string | null
}

// Calls the backend's protected /api/me route. The backend derives this
// identity only from the verified Firebase ID token above — never from
// anything the client asserts.
export function fetchMe(): Promise<Me> {
  return authedFetch<Me>('/api/me')
}
