import { useEffect, useState } from 'react'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { auth } from './lib/firebase'
import { fetchMe, type Me } from './lib/api'
import { Login } from './pages/Login'

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState<string | null>(null)

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setAuthLoading(false)
    })
  }, [])

  async function handleVerify() {
    setMeError(null)
    setMe(null)
    try {
      setMe(await fetchMe())
    } catch (err) {
      setMeError(err instanceof Error ? err.message : 'Request failed')
    }
  }

  if (authLoading) {
    return <p>Loading…</p>
  }

  if (!user) {
    return <Login />
  }

  return (
    <main>
      <h1>daawatey</h1>
      <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>
        Welcome, {user.email ?? user.uid}!
      </p>

      <button type="button" onClick={handleVerify}>
        Call /api/me
      </button>
      {me && (
        <p style={{ fontSize: '1.75rem', fontWeight: 700, wordBreak: 'break-word' }}>
          Backend verified: uid=<code>{me.uid}</code> email=<code>{me.email}</code>
        </p>
      )}
      {meError && <p role="alert">{meError}</p>}

      <button type="button" onClick={() => signOut(auth)}>
        Sign out
      </button>
    </main>
  )
}

export default App
