import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, CircleAlert, Lightbulb, Orbit, PenLine, RefreshCw, Search, Sparkles, WifiOff, X } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { MessageBubble } from '../components/chat/MessageBubble'
import { MessageComposer } from '../components/chat/MessageComposer'
import { ChatHeaderActions } from '../components/chat/ChatHeaderActions'
import { ProfileDialog } from '../components/profile/ProfileDialog'
import { MobileMenuButton, Sidebar } from '../components/sidebar/Sidebar'
import { SettingsDialog, type SettingsTab } from '../components/settings/SettingsDialog'
import { useAuth } from '../contexts/AuthContext'
import { useProfile } from '../contexts/ProfileContext'
import { useToast } from '../contexts/ToastContext'
import { useChat } from '../hooks/useChat'
import { useMemories } from '../hooks/useMemories'
import { usePlan } from '../hooks/usePlan'
import { friendlyError } from '../lib/utils'

const suggestions = [
  { tag: 'CÓDIGO', label: 'Revisar meu código', prompt: 'Revise este código comigo: encontre a causa do problema, riscos e a correção mais simples.', icon: PenLine },
  { tag: 'IDEIA', label: 'Destravar uma ideia', prompt: 'Tenho uma ideia ainda confusa. Faça perguntas úteis e transforme-a em um plano concreto.', icon: Lightbulb },
  { tag: 'TEXTO', label: 'Escrever sem enrolação', prompt: 'Ajude a escrever um texto claro, natural e bem estruturado, sem frases genéricas.', icon: Sparkles },
  { tag: 'DECISÃO', label: 'Decidir o próximo passo', prompt: 'Compare minhas opções com honestidade e recomende o próximo passo mais sensato.', icon: Search },
]

export function ChatPage() {
  const { user, session, signOut } = useAuth()
  const { profile, avatarUrl } = useProfile()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const { conversationId } = useParams()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [profileOpen, setProfileOpen] = useState(false)
  const [temporaryMode, setTemporaryMode] = useState(false)
  const [expiredDismissed, setExpiredDismissed] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [followingOutput, setFollowingOutput] = useState(true)
  const chatCanvasRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const followingOutputRef = useRef(true)
  const scrollContextRef = useRef(conversationId ?? 'new')

  if (!user || !session) throw new Error('ChatPage requer uma sessão autenticada')
  const memory = useMemories(session)
  const plan = usePlan(session)
  const chat = useChat({ user, session, onNotify: showToast, onAnalyzeMemory: memory.analyzeMessage })
  const openConversation = chat.openConversation
  const draftKey = chat.activeId ?? conversationId ?? 'new'
  const routeKey = conversationId ?? 'new'
  const draft = drafts[draftKey] ?? ''

  useEffect(() => {
    const routeId = conversationId ?? null
    if (routeId === chat.activeId) return
    void openConversation(routeId)
  }, [chat.activeId, conversationId, openConversation])
  useEffect(() => {
    if (scrollContextRef.current !== routeKey) {
      scrollContextRef.current = routeKey
      followingOutputRef.current = true
    }
    if (followingOutputRef.current) bottomRef.current?.scrollIntoView({ behavior: chat.generating ? 'auto' : 'smooth' })
  }, [chat.generating, chat.messages, routeKey])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  const selectConversation = useCallback((id: string) => navigate(`/chat/${id}`), [navigate])
  const newChat = useCallback(() => { setTemporaryMode(false); navigate('/') }, [navigate])

  function updateDraft(value: string) {
    setDrafts((current) => {
      if (value) return { ...current, [draftKey]: value }
      const next = { ...current }
      delete next[draftKey]
      return next
    })
  }

  function followLatest(behavior: ScrollBehavior = 'smooth') {
    scrollContextRef.current = routeKey
    followingOutputRef.current = true
    setFollowingOutput(true)
    bottomRef.current?.scrollIntoView({ behavior })
  }

  function trackScroll() {
    const canvas = chatCanvasRef.current
    if (!canvas) return
    const nearBottom = canvas.scrollHeight - canvas.scrollTop - canvas.clientHeight < 160
    scrollContextRef.current = routeKey
    followingOutputRef.current = nearBottom
    setFollowingOutput(nearBottom)
  }

  async function send(content: string, files: File[] = []) {
    followLatest('auto')
    const id = await chat.sendMessage(content, files, temporaryMode)
    if (id && id !== conversationId) navigate(`/chat/${id}`, { replace: true })
    return Boolean(id)
  }

  async function removeConversation(id: string) {
    try {
      await chat.deleteConversation(id)
      if (id === conversationId) navigate('/')
    } catch (error) {
      showToast(friendlyError(error), 'error')
      if (import.meta.env.DEV) console.error(error)
    }
  }

  async function logout() {
    try { await signOut() }
    catch (error) { showToast(friendlyError(error), 'error') }
  }

  const activeConversation = chat.conversations.find((conversation) => conversation.id === chat.activeId)
  const lastAssistantId = [...chat.messages].reverse().find((message) => message.role === 'assistant' && !message.id.startsWith('stream-'))?.id
  const lastMessage = chat.messages.at(-1)
  const responsePending = Boolean(lastMessage?.role === 'user' && !chat.generating && !chat.loadingMessages)
  const userLabel = profile?.display_name || user.user_metadata.display_name as string | undefined || user.email?.split('@')[0] || 'Conta'
  const userMessageCount = chat.messages.filter((message) => message.role === 'user').length
  const attachmentCount = chat.messages.reduce((total, message) => total + (message.attachments?.length ?? 0), 0)
  const contextLimitReached = Boolean(chat.activeId && chat.usage && !chat.usage.unlimited && ((chat.usage.conversation.messageLimit !== null && userMessageCount >= chat.usage.conversation.messageLimit) || (chat.usage.conversation.attachmentLimit !== null && attachmentCount >= chat.usage.conversation.attachmentLimit)))
  const dailyLimitReached = !chat.usage?.unlimited && chat.usage?.remaining === 0
  const dailyLimitAlmostReached = Boolean(chat.usage && !chat.usage.unlimited && chat.usage.remaining !== null && chat.usage.limit !== null && chat.usage.remaining > 0 && chat.usage.remaining <= Math.max(3, Math.ceil(chat.usage.limit * 0.2)))
  const conversationLimitAlmostReached = Boolean(chat.activeId && chat.usage && !chat.usage.unlimited && chat.usage.conversation.messageLimit !== null && userMessageCount < chat.usage.conversation.messageLimit && chat.usage.conversation.messageLimit - userMessageCount <= 2)
  const limitAlmostReached = !dailyLimitReached && !contextLimitReached && (dailyLimitAlmostReached || conversationLimitAlmostReached)
  const temporaryActive = Boolean(activeConversation?.is_temporary || (!chat.activeId && temporaryMode))

  function openSettings(tab: SettingsTab) {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  return (
    <div className="app-shell flex h-dvh overflow-hidden">
      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeId}
        loading={chat.loadingConversations}
        mobileOpen={mobileOpen}
        userLabel={userLabel}
        username={profile?.username}
        avatarUrl={avatarUrl}
        onMobileClose={() => setMobileOpen(false)}
        onNewChat={newChat}
        onSelect={selectConversation}
        onRename={chat.renameConversation}
        onTogglePin={chat.togglePinConversation}
        onDelete={removeConversation}
        onProfile={() => setProfileOpen(true)}
        onSettings={() => openSettings('general')}
        onLogout={logout}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="mission-header">
          <MobileMenuButton onClick={() => setMobileOpen(true)} />
          <button type="button" className={`lunamax-button ${plan.isLunaMax ? 'active' : ''}`} onClick={() => openSettings('plan')}><Sparkles className="h-3.5 w-3.5" /><span>{plan.isLunaMax ? 'LunaMax ativo' : 'Adquirir LunaMax'}</span></button>
          <div className="min-w-0 flex-1" />
          {!online && <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs text-amber-600 dark:text-amber-300"><WifiOff className="h-3.5 w-3.5" /> Offline</span>}
          <ChatHeaderActions conversation={activeConversation} temporaryMode={temporaryMode} onNewChat={newChat} onToggleTemporary={() => setTemporaryMode((value) => !value)} onTogglePin={chat.togglePinConversation} onRename={chat.renameConversation} onDelete={removeConversation} />
        </header>

        {plan.expiredPlan && !expiredDismissed && <div className="plan-expired-banner" role="status"><span><CircleAlert className="h-4 w-4" /></span><div><strong>Sua assinatura LunaMax terminou</strong><p>Você voltou ao plano gratuito. Ative uma nova chave quando quiser recuperar mensagens ilimitadas e busca na web.</p></div><button type="button" className="btn-primary shrink-0" onClick={() => openSettings('plan')}>Renovar</button><button type="button" className="icon-btn !h-8 !w-8 shrink-0" onClick={() => setExpiredDismissed(true)} aria-label="Fechar aviso"><X className="h-4 w-4" /></button></div>}

        <div ref={chatCanvasRef} onScroll={trackScroll} className="chat-canvas min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          {chat.loadingMessages ? (
            <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">{Array.from({ length: 3 }).map((_, index) => <div key={index} className={`h-20 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/[0.04] ${index % 2 === 0 ? 'ml-auto w-2/3' : 'w-full'}`} />)}</div>
          ) : chat.messages.length === 0 ? (
            <section className="empty-stage relative mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center px-5 py-12 text-center">
              <div className="relative"><span className="empty-signal" aria-hidden="true"><i /><i /><i /></span><span className="micro-label mt-5 inline-flex items-center gap-2">LUNATICA 1.5 · SINAL ABERTO</span><h2 className="mt-5 text-4xl font-semibold tracking-[-.055em] sm:text-6xl">Como posso ajudar?</h2><p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[var(--muted)]">Jogue a parte difícil aqui. Eu organizo o caos, explico o raciocínio e fico até a ideia funcionar.</p></div>
              <div className="empty-suggestions relative mt-10 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">{suggestions.map(({ tag, label, prompt, icon: Icon }) => <button key={label} type="button" onClick={() => void send(prompt)} className="suggestion-square"><span>{tag}</span><Icon className="h-5 w-5 text-lunar-300" /><strong>{label}</strong></button>)}</div>
            </section>
          ) : (
            <div className="space-y-8 py-8 sm:space-y-10 sm:py-10">
              {chat.messages.map((message) => <MessageBubble key={message.id} message={message} generating={chat.generating} canRegenerate={message.id === lastAssistantId} onRegenerate={chat.regenerateMessage} onEdit={chat.editUserMessage} onOpenMemory={() => openSettings('memory')} />)}
              {responsePending && <div className="response-recovery" role="status"><span><CircleAlert className="h-4 w-4" /></span><div><strong>A resposta não foi concluída</strong><p>Sua mensagem está salva. Você pode tentar gerar a resposta novamente sem repetir o texto.</p></div><button type="button" className="btn-secondary shrink-0" onClick={() => void chat.retryGeneration()}><RefreshCw className="h-4 w-4" /> Tentar novamente</button></div>}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {chat.messages.length > 0 && !followingOutput && <button type="button" className="jump-to-latest" onClick={() => followLatest()}><ArrowDown className="h-4 w-4" /> Voltar ao fim</button>}

        <div className="composer-dock">
          {dailyLimitReached || contextLimitReached ? <div className="limit-panel"><div className="limit-panel-icon"><Orbit className="h-5 w-5" /></div><div className="min-w-0 flex-1"><strong>{dailyLimitReached ? 'Seu limite gratuito terminou por hoje' : 'Esta conversa chegou ao limite de contexto'}</strong><p>{dailyLimitReached ? 'O acesso volta no próximo ciclo. Com o LunaMax, você continua criando sem interrupções.' : 'Abra um chat limpo para continuar sem o contexto e os anexos desta conversa.'}</p></div><div className="flex shrink-0 flex-col gap-2 sm:flex-row"><button type="button" className="btn-secondary" onClick={newChat}>Novo chat <ArrowRight className="h-4 w-4" /></button><button type="button" className="btn-primary" onClick={() => openSettings('plan')}>Conhecer LunaMax</button></div></div> : <>{limitAlmostReached && <div className="limit-warning" role="status"><span><Sparkles className="h-4 w-4" /></span><div><strong>Seu limite gratuito está quase acabando</strong><p>Continue criando sem interrupções e faça mais com o LunaMax.</p></div><button type="button" className="btn-secondary shrink-0" onClick={() => openSettings('plan')}>Ver LunaMax</button></div>}<MessageComposer key={draftKey} value={draft} onValueChange={updateDraft} generating={chat.generating} disabled={!online} allowAttachments remainingCredits={chat.usage?.remaining} unlimited={chat.usage?.unlimited} temporary={temporaryActive} onSend={send} onStop={chat.stopGeneration} /></>}
        </div>
      </main>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} />
      {settingsOpen && <SettingsDialog open initialTab={settingsTab} usage={chat.usage} plan={plan.plan} expiredPlan={plan.expiredPlan} memories={memory.memories} memoryLoading={memory.loading} onClose={() => setSettingsOpen(false)} onClearHistory={async () => { await chat.clearHistory(); navigate('/') }} onAddMemory={memory.addMemory} onDeleteMemory={memory.deleteMemory} onRedeemPlan={async (code, acceptedDisclaimer) => { await plan.redeem(code, acceptedDisclaimer); setExpiredDismissed(true); await chat.refreshUsage() }} />}
    </div>
  )
}
