'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseBrowser } from '@/lib/supabaseBrowser'

const supabase = supabaseBrowser()

export default function Auth() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (error) setError(error.message)
    else setCodeSent(true)
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) setError(error.message)
    else router.replace('/')
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
      {!codeSent ? (
        <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '30px', border: '1px solid #e2e8f0', borderRadius: '8px', minWidth: '300px' }}>
          <h2>Sign in</h2>
          <input type="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }} />
          {error && <p style={{ color: 'crimson', fontSize: '0.875rem' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: '10px', backgroundColor: '#92400e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {loading ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '30px', border: '1px solid #e2e8f0', borderRadius: '8px', minWidth: '300px' }}>
          <h2>Enter your code</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>We sent a 6-digit code to <strong>{email}</strong></p>
          <input type="text" inputMode="numeric" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} required style={{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', letterSpacing: '0.3em', fontSize: '1.25rem', textAlign: 'center' }} />
          {error && <p style={{ color: 'crimson', fontSize: '0.875rem' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: '10px', backgroundColor: '#92400e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {loading ? 'Verifying…' : 'Sign in'}
          </button>
          <button type="button" onClick={() => { setCodeSent(false); setCode(''); setError(null) }} style={{ background: 'none', border: 'none', color: '#92400e', cursor: 'pointer', fontSize: '0.875rem' }}>
            Use a different email
          </button>
        </form>
      )}
    </div>
  )
}