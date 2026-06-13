import { createClient } from '@supabase/supabase-js'

// Get from: Supabase Dashboard → Your Project → Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

export const isSupabaseReady = !!supabase

// ─── AUTH HELPERS ─────────────────────────────────────────────────────────────

/**
 * Sign up with email + password.
 * Supabase will send a real OTP/magic-link confirmation email.
 * Pass emailRedirectTo if you want a link-style flow instead of OTP.
 */
export async function authSignUp({ email, password, name, role, genre, country, bio }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Store extra profile fields in user_metadata so we can read them
      // when the user confirms and we create their profile row.
      data: { name, role, genre, country, bio },
    },
  })
  if (error) throw error
  return data // data.user, data.session (session is null until confirmed)
}

/**
 * Verify the 6-digit OTP that Supabase emailed to the user.
 * tokenHash comes from the URL if using email links; for code-style OTP
 * we use type='signup' and the raw token.
 */
export async function authVerifyOtp({ email, token }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'signup',
  })
  if (error) throw error
  return data // data.user, data.session
}

/**
 * Sign in with email + password (confirmed accounts only).
 */
export async function authSignIn({ email, password }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data // data.user, data.session
}

/**
 * Sign out the current user.
 */
export async function authSignOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

/**
 * Resend signup OTP/confirmation email.
 */
export async function authResendOtp({ email }) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.resend({ type: 'signup', email })
  if (error) throw error
}

/**
 * Get the currently logged-in session (null if not logged in).
 */
export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

/**
 * Fires whenever auth state changes (login, logout, email confirmed).
 * Returns the subscription so the caller can unsubscribe.
 */
export function onAuthStateChange(callback) {
  if (!supabase) return { data: { subscription: { unsubscribe(){} } } }
  return supabase.auth.onAuthStateChange((_event, session) => callback(session))
}

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────

export async function uploadFile(bucket, path, file) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, cacheControl: '3600' })
  if (error) throw error
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path)
  return urlData.publicUrl
}

// ─── DATABASE HELPERS ─────────────────────────────────────────────────────────
export const db = {
  // Songs
  async getSongs() {
    if (!supabase) return []
    const { data } = await supabase
      .from('songs')
      .select('*')
      .order('uploaded_at', { ascending: false })
    return data || []
  },
  async insertSong(song) {
    if (!supabase) return null
    const { data, error } = await supabase.from('songs').insert([song]).select().single()
    if (error) throw error
    return data
  },
  async updateSong(id, updates) {
    if (!supabase) return null
    const { data, error } = await supabase.from('songs').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },
  async deleteSong(id) {
    if (!supabase) return
    await supabase.from('songs').delete().eq('id', id)
  },

  // Profiles
  async getProfiles() {
    if (!supabase) return []
    const { data } = await supabase.from('profiles').select('*')
    return data || []
  },
  async getProfile(id) {
    if (!supabase) return null
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single()
    return data
  },
  async upsertProfile(profile) {
    if (!supabase) return null
    const { data, error } = await supabase.from('profiles').upsert([profile]).select().single()
    if (error) throw error
    return data
  },

  // Likes
  async getLikes(userId) {
    if (!supabase) return []
    const { data } = await supabase.from('likes').select('song_id').eq('user_id', userId)
    return (data || []).map(r => r.song_id)
  },
  async toggleLike(userId, songId) {
    if (!supabase) return
    const { data } = await supabase.from('likes').select('id').eq('user_id', userId).eq('song_id', songId).single()
    if (data) {
      await supabase.from('likes').delete().eq('user_id', userId).eq('song_id', songId)
      return false
    } else {
      await supabase.from('likes').insert([{ user_id: userId, song_id: songId }])
      return true
    }
  },

  // Comments
  async getComments(songId) {
    if (!supabase) return []
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(name, avatar)')
      .eq('song_id', songId)
      .order('created_at', { ascending: false })
    return data || []
  },
  async addComment(userId, songId, text) {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('comments')
      .insert([{ user_id: userId, song_id: songId, text }])
      .select('*, profiles(name, avatar)')
      .single()
    if (error) throw error
    return data
  },

  // Follows
  async toggleFollow(followerId, artistId) {
    if (!supabase) return
    const { data } = await supabase.from('follows').select('id').eq('follower_id', followerId).eq('artist_id', artistId).single()
    if (data) {
      await supabase.from('follows').delete().eq('follower_id', followerId).eq('artist_id', artistId)
      return false
    } else {
      await supabase.from('follows').insert([{ follower_id: followerId, artist_id: artistId }])
      return true
    }
  },
  async getFollowing(userId) {
    if (!supabase) return []
    const { data } = await supabase.from('follows').select('artist_id').eq('follower_id', userId)
    return (data || []).map(r => r.artist_id)
  },

  // Admin song controls (needs service-role or anon with correct RLS policy)
  async adminUpdateSong(id, updates) {
    if (!supabase) return null
    const { data, error } = await supabase.from('songs').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },
  async adminDeleteSong(id) {
    if (!supabase) return
    await supabase.from('songs').delete().eq('id', id)
  },
  async adminGetAllSongs() {
    if (!supabase) return []
    const { data } = await supabase.from('songs').select('*').order('uploaded_at', { ascending: false })
    return data || []
  },
  async adminUpdateProfile(id, updates) {
    if (!supabase) return null
    const { data, error } = await supabase.from('profiles').update(updates).eq('id', id).select().single()
    if (error) throw error
    return data
  },

  // Check if a user is in the secure `admins` table (db-enforced, not guessable)
  async isAdmin(userId) {
    if (!supabase || !userId) return false
    const { data, error } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (error) return false
    return !!data
  },
}
