import { useEffect, useState } from 'react'
import { ArrowRight, Code2, Compass, History, Lightbulb, LogIn, Menu, Search, ShieldCheck, Sparkles, UserPlus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MessageComposer } from '../components/chat/MessageComposer'
import { Logo } from '../components/ui/Logo'
import { Modal } from '../components/ui/Modal'

const suggestions = [
  { tag: 'CÓDIGO', label: 'Revisar meu código', prompt: 'Revise este código comigo: encontre a causa do problema, riscos e a correção mais simples.', icon: Code2 },
  { tag: 'IDEIA', label: 'Destravar uma ideia', prompt: 'Tenho uma ideia ainda confusa. Faça perguntas úteis e transforme-a em um plano concreto.', icon: Lightbulb },
  { tag: 'TEXTO', label: 'Escrever sem enrolação', prompt: 'Ajude a escrever um texto claro, natural e bem estruturado, sem frases genéricas.', icon: Sparkles },
  { tag: 'DECISÃO', label: 'Decidir o próximo passo', prompt: 'Compare minhas opções com honestidade e recomende o próximo passo mais sensato.', icon: Search },
]

export function GuestPage() {
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [authPromptOpen, setAuthPromptOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])

  const openLogin = () => navigate('/login?mode=login')
  const openSignup = () => navigate('/login?mode=signup')
  async function requestConversation() { setAuthPromptOpen(true) }

  const sidebar = (
    <aside className="guest-sidebar">
      <div className="flex h-20 items-center justify-between px-5"><Logo /><button type="button" onClick={() => setMobileOpen(false)} className="icon-btn lg:hidden" aria-label="Fechar menu"><X className="h-5 w-5" /></button></div>
      <div className="px-4"><button type="button" onClick={() => { setMobileOpen(false); setAuthPromptOpen(true) }} className="new-chat-button"><Sparkles className="h-4 w-4" /> Abrir um novo sinal <ArrowRight className="ml-auto h-4 w-4" /></button></div>
      <div className="flex-1 px-5 py-8"><span className="micro-label">MEMÓRIA DA MISSÃO</span><div className="mt-5 space-y-5"><div className="sidebar-feature"><History /><p><strong>Histórico contínuo</strong><span>Retome ideias exatamente de onde parou.</span></p></div><div className="sidebar-feature"><ShieldCheck /><p><strong>Espaço privado</strong><span>RLS protege cada conversa no banco.</span></p></div><div className="sidebar-feature"><Compass /><p><strong>Do seu jeito</strong><span>Perfil, tema e instruções pessoais.</span></p></div></div></div>
      <div className="border-t border-white/10 p-4"><p className="mb-4 text-xs leading-5 text-zinc-500">Crie sua conta para conversar, anexar arquivos e salvar seu histórico.</p><button type="button" onClick={openLogin} className="btn-secondary w-full"><LogIn className="h-4 w-4" /> Entrar</button><button type="button" onClick={openSignup} className="btn-primary mt-2 w-full"><UserPlus className="h-4 w-4" /> Criar conta grátis</button></div>
    </aside>
  )

  return (
    <div className="app-shell flex h-dvh overflow-hidden">
      <div className="hidden h-full lg:block">{sidebar}</div>
      {mobileOpen && <div className="fixed inset-0 z-50 lg:hidden"><button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} aria-label="Fechar menu" /><div className="relative h-full w-[min(88vw,320px)] animate-slide-in [&_.guest-sidebar]:!w-full">{sidebar}</div></div>}

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="mission-header relative z-10"><button type="button" onClick={() => setMobileOpen(true)} className="icon-btn lg:hidden" aria-label="Abrir menu"><Menu className="h-5 w-5" /></button><Logo compact className="lg:hidden" /><div className="hidden min-w-0 flex-1 items-center gap-3 lg:flex"><span className="micro-label">MODELO LUNATICA 1.5</span><span className="status-dot">online</span></div><div className="ml-auto flex items-center gap-2"><button type="button" onClick={openLogin} className="hidden px-3 py-2 text-sm text-zinc-500 transition hover:text-lunar-600 dark:text-zinc-400 dark:hover:text-white sm:inline-flex">Entrar</button><button type="button" onClick={openSignup} className="btn-primary !px-3.5 !py-2">Criar conta <ArrowRight className="h-4 w-4" /></button></div></header>

        <div className="chat-canvas relative z-[1] min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
          <section className="empty-stage mx-auto flex min-h-full w-full max-w-5xl flex-col items-center justify-center px-5 py-12 text-center lg:px-10">
            <div className="relative animate-fade-in"><span className="empty-signal" aria-hidden="true"><i /><i /><i /></span><span className="micro-label mt-5 inline-flex items-center gap-2">LUNATICA 1.5 · SINAL ABERTO</span><h1 className="mt-5 text-5xl font-semibold leading-none tracking-[-.065em] sm:text-7xl">Como posso ajudar?</h1><p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[var(--muted)] sm:text-base">Código que chega à causa, texto com pulso e ideias que saem do rascunho. Sem resposta de vitrine.</p><div className="mt-7 flex justify-center gap-2"><button type="button" onClick={openSignup} className="btn-primary"><Sparkles className="h-4 w-4" /> Começar agora</button><button type="button" onClick={openLogin} className="btn-secondary"><LogIn className="h-4 w-4" /> Entrar</button></div></div>
            <div className="empty-suggestions relative mt-10 grid w-full max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">{suggestions.map(({ tag, label, prompt, icon: Icon }) => <button key={label} type="button" onClick={() => setDraft(prompt)} className="suggestion-square"><span>{tag}</span><Icon className="h-5 w-5" /><strong>{label}</strong></button>)}</div>
          </section>
        </div>

        <div className="composer-dock relative z-10"><div className="mx-auto mb-2 flex max-w-4xl items-center justify-center gap-2 px-4 text-center text-xs text-zinc-500"><LogIn className="h-3.5 w-3.5" /> Entre ou crie uma conta para enviar e salvar.</div><MessageComposer generating={false} disabled={!online} value={draft} clearOnSend={false} allowAttachments onValueChange={setDraft} onSend={requestConversation} onStop={() => undefined} /></div>
      </main>

      <Modal open={authPromptOpen} onClose={() => setAuthPromptOpen(false)} title="Seu sinal está pronto" description="Entre ou crie uma conta para enviar a mensagem, anexar arquivos e continuar depois."><div className="space-y-3"><button type="button" onClick={openSignup} className="btn-primary w-full"><UserPlus className="h-4 w-4" /> Criar conta grátis</button><button type="button" onClick={openLogin} className="btn-secondary w-full"><LogIn className="h-4 w-4" /> Entrar na minha conta</button></div></Modal>
    </div>
  )
}
