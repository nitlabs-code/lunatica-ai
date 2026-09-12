import { useCallback, useEffect, useRef, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { cancelChatGeneration, getUsageStatus, streamChatResponse } from '../lib/api'
import { createConversationTitle, friendlyError } from '../lib/utils'
import type { ChatMessage, Conversation, MemoryActivity, Message, MessageAttachment, RenderedAttachment } from '../types/database'
import type { UsageStatus } from '../types/chat'

interface UseChatOptions {
  user: User
  session: Session
  onNotify: (message: string, kind?: 'success' | 'error' | 'info') => void
  onAnalyzeMemory?: (messageId: string) => Promise<MemoryActivity | null>
}

const MAX_ATTACHMENTS = 3
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024
const MAX_TOTAL_SIZE = 12 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json'])
function safeFileName(name: string) {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'anexo'
}

export function useChat({ user, session, onNotify, onAnalyzeMemory }: UseChatOptions) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [usage, setUsage] = useState<UsageStatus | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [loadingConversations, setLoadingConversations] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [generating, setGenerating] = useState(false)
  const abortRef = useRef<{ controller: AbortController; generationId: string } | null>(null)
  const activeIdRef = useRef<string | null>(null)
  const openRequestRef = useRef(0)
  const memoryActivityRef = useRef(new Map<string, MemoryActivity>())

  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const decorateAttachments = useCallback(async (rows: MessageAttachment[]): Promise<RenderedAttachment[]> => Promise.all(rows.map(async (row) => {
    if (!row.mime_type.startsWith('image/')) return row
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(row.storage_path, 60 * 60)
    return error ? row : { ...row, previewUrl: data.signedUrl }
  })), [])

  const purgeExpiredTemporaryChats = useCallback(async () => {
    try {
      const now = new Date().toISOString()
      const { data: expired, error } = await supabase.from('conversations').select('id').eq('is_temporary', true).lt('expires_at', now)
      if (error) throw error
      const ids = (expired ?? []).map((conversation) => conversation.id)
      if (!ids.length) return
      const { data: attachments, error: attachmentError } = await supabase.from('message_attachments').select('storage_path').in('conversation_id', ids)
      if (attachmentError) throw attachmentError
      const paths = (attachments ?? []).map((row) => row.storage_path)
      if (paths.length) await supabase.storage.from('attachments').remove(paths)
      const { error: deleteError } = await supabase.from('conversations').delete().in('id', ids)
      if (deleteError) throw deleteError
    } catch (error) {
      if (import.meta.env.DEV) console.error('Falha ao limpar chats temporários', error)
    }
  }, [])

  const conversationQuery = useCallback(() => supabase.from('conversations').select('*').or(`is_temporary.eq.false,expires_at.gt.${new Date().toISOString()}`).order('is_pinned', { ascending: false }).order('updated_at', { ascending: false }).limit(100), [])

  const refreshConversations = useCallback(async () => {
    await purgeExpiredTemporaryChats()
    const { data, error } = await conversationQuery()
    if (error) throw error
    setConversations(data)
  }, [conversationQuery, purgeExpiredTemporaryChats])

  const refreshUsage = useCallback(async (signal?: AbortSignal) => {
    const status = await getUsageStatus(session, signal)
    setUsage(status)
  }, [session])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    void purgeExpiredTemporaryChats().then(() => Promise.all([
      conversationQuery(),
      getUsageStatus(session, controller.signal),
    ])).then(([conversationResult, nextUsage]) => {
      if (!active) return
      if (conversationResult.error) throw conversationResult.error
      setConversations(conversationResult.data)
      setUsage(nextUsage)
    }).catch((error: unknown) => {
      if (!active || (error instanceof DOMException && error.name === 'AbortError')) return
      onNotify(friendlyError(error), 'error')
      if (import.meta.env.DEV) console.error(error)
    }).finally(() => {
      if (active) setLoadingConversations(false)
    })
    return () => { active = false; controller.abort() }
  }, [conversationQuery, onNotify, purgeExpiredTemporaryChats, session])

  const openConversation = useCallback(async (conversationId: string | null) => {
    const requestId = ++openRequestRef.current
    activeIdRef.current = conversationId
    setActiveId(conversationId)
    if (!conversationId) {
      setMessages([])
      setLoadingMessages(false)
      return
    }
    setLoadingMessages(true)
    try {
      const { data: selectedConversation, error: conversationError } = await supabase.from('conversations').select('*').eq('id', conversationId).maybeSingle()
      if (requestId !== openRequestRef.current) return
      if (conversationError) throw conversationError
      if (!selectedConversation) throw new Error('Conversa não encontrada')
      if (selectedConversation.is_temporary && selectedConversation.expires_at && new Date(selectedConversation.expires_at).getTime() <= Date.now()) {
        await purgeExpiredTemporaryChats()
        activeIdRef.current = null
        setActiveId(null)
        setMessages([])
        onNotify('Este chat temporário expirou e foi apagado.', 'info')
        return
      }
      setConversations((current) => current.some((conversation) => conversation.id === selectedConversation.id) ? current : [selectedConversation, ...current])
      const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
      if (requestId !== openRequestRef.current) return
      if (error) throw error
      let attachments: MessageAttachment[] = []
      if (data.length) {
        const { data: attachmentData, error: attachmentError } = await supabase.from('message_attachments').select('*').in('message_id', data.map((message) => message.id)).order('created_at', { ascending: true })
        if (attachmentError) throw attachmentError
        attachments = await decorateAttachments(attachmentData)
      }
      if (requestId !== openRequestRef.current) return
      setMessages(data.map((message) => ({ ...message, attachments: attachments.filter((file) => file.message_id === message.id), memoryActivity: memoryActivityRef.current.get(message.id) })))
    } catch (error) {
      if (requestId !== openRequestRef.current) return
      onNotify(friendlyError(error), 'error')
      setMessages([])
    } finally {
      if (requestId === openRequestRef.current) setLoadingMessages(false)
    }
  }, [decorateAttachments, onNotify, purgeExpiredTemporaryChats])

  const waitForGeneration = useCallback(async (generationId: string, attempts: number) => {
    let found = false
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const { data, error } = await supabase.from('chat_generations').select('status, assistant_message_id, error_code').eq('id', generationId).maybeSingle()
      if (error) throw error
      if (data) found = true
      if (data?.status === 'completed' && data.assistant_message_id) {
        const { data: assistant, error: messageError } = await supabase.from('messages').select('*').eq('id', data.assistant_message_id).single()
        if (messageError) throw messageError
        return { status: data.status, assistant, errorCode: null }
      }
      if (data?.status === 'failed' || data?.status === 'cancelled') return { status: data.status, assistant: null, errorCode: data.error_code }
      if (!found && attempt >= 3) return { status: 'missing' as const, assistant: null, errorCode: null }
      await new Promise((resolve) => window.setTimeout(resolve, 250))
    }
    return { status: 'generating' as const, assistant: null, errorCode: null }
  }, [])

  const generate = useCallback(async (conversationId: string) => {
    const controller = new AbortController()
    const generationId = crypto.randomUUID()
    abortRef.current = { controller, generationId }
    setGenerating(true)
    const temporaryId = `stream-${crypto.randomUUID()}`
    const temporaryMessage: ChatMessage = {
      id: temporaryId,
      conversation_id: conversationId,
      user_id: user.id,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
    }
    if (activeIdRef.current === conversationId) setMessages((current) => [...current, temporaryMessage])
    let content = ''
    let streamError: unknown = null
    let assistantMessageId: string | null = null

    try {
      try {
        await streamChatResponse({
          conversationId,
          generationId,
          session,
          signal: controller.signal,
          onText: (text) => {
            content += text
            if (activeIdRef.current === conversationId) setMessages((current) => current.map((message) => message.id === temporaryId ? { ...message, content } : message))
          },
        })
      } catch (error) {
        streamError = error
      }

      if (controller.signal.aborted) throw new DOMException('Geração interrompida', 'AbortError')
      const persisted = await waitForGeneration(generationId, streamError ? 40 : 16)
      if (persisted.status === 'cancelled') throw new DOMException('Geração interrompida', 'AbortError')
      if (persisted.status === 'failed') throw new Error(persisted.errorCode === 'RATE_LIMITED' ? '429: Limite do Gemini atingido' : 'Não foi possível concluir a resposta.')
      if (persisted.status === 'missing' && streamError) throw streamError
      if (persisted.assistant) {
        assistantMessageId = persisted.assistant.id
        if (activeIdRef.current === conversationId) setMessages((current) => current.map((message) => message.id === temporaryId ? persisted.assistant! : message))
      } else if (streamError) {
        if (activeIdRef.current === conversationId) setMessages((current) => current.filter((message) => message.id !== temporaryId))
        onNotify('A resposta continua em segundo plano e aparecerá no histórico quando terminar.', 'info')
      } else if (!content.trim()) {
        throw new Error('Resposta vazia da IA')
      }
      await refreshConversations()
    } catch (error) {
      if (activeIdRef.current === conversationId) setMessages((current) => current.filter((message) => message.id !== temporaryId))
      if (error instanceof DOMException && error.name === 'AbortError') onNotify('Geração interrompida.', 'info')
      else {
        onNotify(friendlyError(error), 'error')
        if (import.meta.env.DEV) console.error(error)
      }
    } finally {
      if (abortRef.current?.controller === controller) abortRef.current = null
      setGenerating(false)
      void refreshUsage().catch((error: unknown) => { if (import.meta.env.DEV) console.error(error) })
    }
    return assistantMessageId
  }, [onNotify, refreshConversations, refreshUsage, session, user.id, waitForGeneration])

  const markMemoryActivity = useCallback((conversationId: string, assistantMessageId: string | null, activity: MemoryActivity | null) => {
    if (!assistantMessageId || !activity) return
    memoryActivityRef.current.set(assistantMessageId, activity)
    if (activeIdRef.current !== conversationId) return
    setMessages((current) => current.map((message) => message.id === assistantMessageId ? { ...message, memoryActivity: activity } : message))
  }, [])

  const uploadFiles = useCallback(async (conversationId: string, messageId: string, files: File[]) => {
    if (files.length > MAX_ATTACHMENTS) throw new Error('Use no máximo 3 anexos')
    if (files.some((file) => !ALLOWED_TYPES.has(file.type) || file.size > MAX_ATTACHMENT_SIZE)) throw new Error('Anexo inválido ou maior que 5 MB')
    if (files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_SIZE) throw new Error('Os anexos devem somar no máximo 12 MB')
    const uploaded: string[] = []
    try {
      const rows: RenderedAttachment[] = []
      for (const file of files) {
        const path = `${user.id}/${conversationId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
        const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file, { contentType: file.type, upsert: false })
        if (uploadError) throw uploadError
        uploaded.push(path)
        const { data, error } = await supabase.from('message_attachments').insert({ message_id: messageId, conversation_id: conversationId, user_id: user.id, storage_path: path, file_name: file.name.slice(0, 160), mime_type: file.type, size_bytes: file.size }).select().single()
        if (error) throw error
        if (data.mime_type.startsWith('image/')) {
          const { data: signed } = await supabase.storage.from('attachments').createSignedUrl(data.storage_path, 60 * 60)
          rows.push(signed ? { ...data, previewUrl: signed.signedUrl } : data)
        } else rows.push(data)
      }
      return rows
    } catch (error) {
      if (uploaded.length) await supabase.storage.from('attachments').remove(uploaded)
      await supabase.from('message_attachments').delete().eq('message_id', messageId)
      throw error
    }
  }, [user.id])

  const sendMessage = useCallback(async (rawContent: string, files: File[] = [], temporaryMode = false) => {
    const content = rawContent.trim() || (files.length ? 'Analise os anexos enviados.' : '')
    if (!content || generating) return null
    const cost = 1 + files.length
    const activeConversation = conversations.find((conversation) => conversation.id === activeId)
    const isTemporary = activeConversation?.is_temporary ?? temporaryMode
    const userMessageCount = messages.filter((message) => message.role === 'user').length
    const conversationAttachmentCount = messages.reduce((total, message) => total + (message.attachments?.length ?? 0), 0)
    const messageLimit = usage?.conversation.messageLimit
    const attachmentLimit = usage?.conversation.attachmentLimit
    if (activeId && !usage?.unlimited && ((messageLimit !== null && messageLimit !== undefined && userMessageCount >= messageLimit) || (attachmentLimit !== null && attachmentLimit !== undefined && conversationAttachmentCount + files.length > attachmentLimit))) {
      onNotify('Esta conversa atingiu o limite de contexto. Comece um novo chat limpo para continuar.', 'info')
      return null
    }
    if (usage && usage.remaining !== null && usage.remaining < cost) {
      onNotify('Seu limite gratuito terminou por hoje. Conheça o LunaMax para continuar sem interrupções.', 'error')
      return null
    }
    let conversationId = activeId
    let createdConversation = false
    let insertedMessageId: string | null = null
    try {
      if (!conversationId) {
        const titleSource = rawContent.trim() || files[0]?.name || 'Conversa com anexos'
        const { data, error } = await supabase.from('conversations').insert({ user_id: user.id, title: createConversationTitle(titleSource), is_temporary: temporaryMode, expires_at: temporaryMode ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null }).select().single()
        if (error) throw error
        conversationId = data.id
        createdConversation = true
        activeIdRef.current = data.id
        setActiveId(data.id)
        setConversations((current) => [data, ...current])
      }

      const { data: userMessage, error } = await supabase.from('messages').insert({ conversation_id: conversationId, user_id: user.id, role: 'user', content }).select().single()
      if (error) throw error
      insertedMessageId = userMessage.id
      const attachments = files.length ? await uploadFiles(conversationId, userMessage.id, files) : []
      setMessages((current) => [...current, { ...userMessage, attachments }])
      const targetConversationId = conversationId
      // O composer pode ser liberado assim que a mensagem e os anexos estão
      // seguros. A geração durável continua mesmo após trocar de rota ou aba.
      void generate(targetConversationId).then((assistantMessageId) => {
        // A memória só é analisada depois da resposta para não disputar
        // latência com o stream principal do Gemini.
        if (!isTemporary && onAnalyzeMemory) {
          void onAnalyzeMemory(userMessage.id).then((activity) => markMemoryActivity(targetConversationId, assistantMessageId, activity))
        }
      })
      return conversationId
    } catch (error) {
      if (!createdConversation && insertedMessageId) await supabase.from('messages').delete().eq('id', insertedMessageId)
      if (createdConversation && conversationId) await supabase.from('conversations').delete().eq('id', conversationId)
      onNotify(friendlyError(error), 'error')
      if (import.meta.env.DEV) console.error(error)
      return null
    }
  }, [activeId, conversations, generate, generating, markMemoryActivity, messages, onAnalyzeMemory, onNotify, uploadFiles, usage, user.id])

  const removeStoredAttachments = useCallback(async (query: 'conversation' | 'messages' | 'all', value?: string | string[]) => {
    let request = supabase.from('message_attachments').select('storage_path')
    if (query === 'conversation' && typeof value === 'string') request = request.eq('conversation_id', value)
    if (query === 'messages' && Array.isArray(value) && value.length) request = request.in('message_id', value)
    if (query === 'all') request = request.eq('user_id', user.id)
    const { data, error } = await request
    if (error) throw error
    const paths = data.map((row) => row.storage_path)
    if (paths.length) {
      const { error: storageError } = await supabase.storage.from('attachments').remove(paths)
      if (storageError) throw storageError
    }
  }, [user.id])

  const stopGeneration = useCallback(() => {
    const current = abortRef.current
    if (!current) return
    void cancelChatGeneration(session, current.generationId).catch((error: unknown) => {
      if (import.meta.env.DEV) console.error('Falha ao cancelar geração no servidor', error)
    })
    current.controller.abort()
  }, [session])

  const retryGeneration = useCallback(async () => {
    if (!activeId || generating) return
    await generate(activeId)
  }, [activeId, generate, generating])

  const renameConversation = useCallback(async (id: string, title: string) => {
    const cleanTitle = title.replace(/\s+/g, ' ').trim().slice(0, 80)
    if (!cleanTitle) return
    try {
      const { error } = await supabase.from('conversations').update({ title: cleanTitle }).eq('id', id)
      if (error) throw error
      setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, title: cleanTitle } : conversation))
      onNotify('Título alterado.', 'success')
    } catch (error) {
      onNotify(friendlyError(error), 'error')
      if (import.meta.env.DEV) console.error(error)
    }
  }, [onNotify])

  const togglePinConversation = useCallback(async (id: string, pinned: boolean) => {
    try {
      const { error } = await supabase.from('conversations').update({ is_pinned: pinned }).eq('id', id)
      if (error) throw error
      setConversations((current) => current.map((conversation) => conversation.id === id ? { ...conversation, is_pinned: pinned } : conversation).sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()))
      onNotify(pinned ? 'Conversa fixada.' : 'Conversa desafixada.', 'success')
    } catch (error) {
      onNotify(friendlyError(error), 'error')
      if (import.meta.env.DEV) console.error(error)
    }
  }, [onNotify])

  const deleteConversation = useCallback(async (id: string) => {
    await removeStoredAttachments('conversation', id)
    const { error } = await supabase.from('conversations').delete().eq('id', id)
    if (error) throw error
    setConversations((current) => current.filter((conversation) => conversation.id !== id))
    if (activeId === id) { activeIdRef.current = null; setActiveId(null); setMessages([]) }
    onNotify('Conversa excluída.', 'success')
  }, [activeId, onNotify, removeStoredAttachments])

  const clearHistory = useCallback(async () => {
    await removeStoredAttachments('all')
    const { error } = await supabase.from('conversations').delete().eq('user_id', user.id)
    if (error) throw error
    setConversations([])
    setMessages([])
    activeIdRef.current = null
    setActiveId(null)
    onNotify('Histórico limpo.', 'success')
  }, [onNotify, removeStoredAttachments, user.id])

  const regenerateMessage = useCallback(async (message: Message) => {
    if (generating || message.role !== 'assistant') return
    const { error } = await supabase.from('messages').delete().eq('id', message.id)
    if (error) throw error
    setMessages((current) => current.filter((item) => item.id !== message.id))
    await generate(message.conversation_id)
  }, [generate, generating])

  const editUserMessage = useCallback(async (message: Message, nextContent: string) => {
    const content = nextContent.trim()
    if (!content || generating || message.role !== 'user') return
    const { data: laterMessages, error: laterError } = await supabase.from('messages').select('id').eq('conversation_id', message.conversation_id).gt('created_at', message.created_at)
    if (laterError) throw laterError
    if (laterMessages.length) await removeStoredAttachments('messages', laterMessages.map((item) => item.id))
    const { error: updateError } = await supabase.from('messages').update({ content }).eq('id', message.id)
    if (updateError) throw updateError
    const { error: deleteError } = await supabase.from('messages').delete().eq('conversation_id', message.conversation_id).gt('created_at', message.created_at)
    if (deleteError) throw deleteError
    setMessages((current) => current.filter((item) => item.created_at <= message.created_at).map((item) => item.id === message.id ? { ...item, content } : item))
    const assistantMessageId = await generate(message.conversation_id)
    if (onAnalyzeMemory) {
      void onAnalyzeMemory(message.id).then((activity) => markMemoryActivity(message.conversation_id, assistantMessageId, activity))
    }
  }, [generate, generating, markMemoryActivity, onAnalyzeMemory, removeStoredAttachments])

  return { conversations, messages, usage, activeId, loadingConversations, loadingMessages, generating, openConversation, sendMessage, stopGeneration, retryGeneration, renameConversation, togglePinConversation, deleteConversation, clearHistory, regenerateMessage, editUserMessage, refreshUsage }
}
