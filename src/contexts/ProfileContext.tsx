import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Profile } from '../types/database'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

interface ProfileContextValue {
  profile: Profile | null
  avatarUrl: string | null
  loading: boolean
  error: string | null
  refreshProfile: () => Promise<void>
  saveProfile: (updates: Partial<Pick<Profile, 'display_name' | 'username' | 'avatar_path' | 'custom_instructions' | 'onboarding_completed' | 'theme'>>) => Promise<Profile>
  uploadAvatar: (file: File) => Promise<void>
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resolveAvatar = useCallback(async (nextProfile: Profile | null) => {
    if (!nextProfile?.avatar_path) {
      setAvatarUrl(null)
      return
    }
    const { data, error } = await supabase.storage.from('avatars').createSignedUrl(nextProfile.avatar_path, 3600)
    setAvatarUrl(error ? null : data.signedUrl)
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setAvatarUrl(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (error) throw error
      setProfile(data)
      await resolveAvatar(data)
    } catch (nextError) {
      setProfile(null)
      setAvatarUrl(null)
      setError('Não foi possível carregar seu perfil. Confira sua conexão e tente novamente.')
      throw nextError
    } finally {
      setLoading(false)
    }
  }, [resolveAvatar, user])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void refreshProfile().catch((error: unknown) => {
        if (import.meta.env.DEV) console.error('Falha ao carregar perfil', error)
      })
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [refreshProfile])

  const saveProfile = useCallback(async (updates: Partial<Pick<Profile, 'display_name' | 'username' | 'avatar_path' | 'custom_instructions' | 'onboarding_completed' | 'theme'>>) => {
    if (!user) throw new Error('Sessão necessária')
    const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select().single()
    if (error) throw error
    setProfile(data)
    await resolveAvatar(data)
    return data
  }, [resolveAvatar, user])

  const uploadAvatar = useCallback(async (file: File) => {
    if (!user) throw new Error('Sessão necessária')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Formato de imagem não aceito')
    if (file.size > 3 * 1024 * 1024) throw new Error('A foto deve ter até 3 MB')
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${user.id}/avatar-${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError
    const previousPath = profile?.avatar_path
    try {
      await saveProfile({ avatar_path: path })
      if (previousPath) await supabase.storage.from('avatars').remove([previousPath])
    } catch (error) {
      await supabase.storage.from('avatars').remove([path])
      throw error
    }
  }, [profile?.avatar_path, saveProfile, user])

  const profileLoading = loading || Boolean(user && !profile && !error)
  const value = useMemo<ProfileContextValue>(() => ({ profile, avatarUrl, loading: profileLoading, error, refreshProfile, saveProfile, uploadAvatar }), [avatarUrl, error, profile, profileLoading, refreshProfile, saveProfile, uploadAvatar])
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile() {
  const value = useContext(ProfileContext)
  if (!value) throw new Error('useProfile deve ser usado dentro de ProfileProvider')
  return value
}
