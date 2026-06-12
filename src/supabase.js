import { createClient } from '@supabase/supabase-js'

// Replace these with your actual Supabase project values
// Get them from: https://supabase.com → Your Project → Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null

export const isSupabaseReady = !!supabase

// ─── STORAGE HELPERS ──────────────────────────────────────────────────────────
// Upload a file to Supabase Storage and return its public URL
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
}
