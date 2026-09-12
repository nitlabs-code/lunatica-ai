import { useState } from 'react'
import { AtSign, BadgeCheck, Brain, Check, CircleAlert, ExternalLink, Headphones, Info, KeyRound, LogOut, Mail, MessageCircle, Moon, Paperclip, Rocket, Settings, ShieldCheck, Sparkles, Sun, Trash2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useProfile } from '../../contexts/ProfileContext'
import { useTheme, type Theme } from '../../contexts/ThemeContext'
import { useToast } from '../../contexts/ToastContext'
import { isEmailVerified } from '../../lib/auth'
import { friendlyError } from '../../lib/utils'
import type { UsageStatus } from '../../types/chat'
import type { Memory, UserPlan } from '../../types/database'
import { MemoryPanel } from '../memory/MemoryPanel'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { Modal } from '../ui/Modal'

export type SettingsTab = 'general' | 'memory' | 'plan' | 'important'

interface SettingsDialogProps {
  open: boolean
  initialTab?: SettingsTab
  usage?: UsageStatus | null
  plan: UserPlan | null
  expiredPlan?: UserPlan | null
  memories: Memory[]
  memoryLoading: boolean
  onClose: () => void
  onClearHistory: () => Promise<void>
  onAddMemory: (content: string) => Promise<void>
  onDeleteMemory: (id: string) => Promise<void>
  onRedeemPlan: (code: string, acceptedDisclaimer: boolean) => Promise<void>
}

const tabs = [
  { id: 'general', label: 'Geral', description: 'Tema, uso e conta', icon: Settings },
  { id: 'memory', label: 'Memória', description: 'O que a Lunatica lembra', icon: Brain },
  { id: 'plan', label: 'LunaMax', description: 'Plano e ativação', icon: Sparkles },
  { id: 'important', label: 'Informações', description: 'Privacidade e avisos', icon: Info },
] as const

function formatCode(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
  return normalized.match(/.{1,4}/g)?.join(' ') ?? ''
}

export function SettingsDialog({ open, initialTab = 'general', usage, plan, expiredPlan, memories, memoryLoading, onClose, onClearHistory, onAddMemory, onDeleteMemory, onRedeemPlan }: SettingsDialogProps) {
  const { user, signOut } = useAuth()
  const { profile, saveProfile } = useProfile()
  const { theme, setTheme } = useTheme()
  const { showToast } = useToast()
  const [tab, setTab] = useState<SettingsTab>(initialTab)
  const [busy, setBusy] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [code, setCode] = useState('')
  const [accepted, setAccepted] = useState(false)
  const planEligible = isEmailVerified(user)
  const normalizedCode = code.replace(/\s/g, '')
  const usageNearLimit = Boolean(usage && !usage.unlimited && usage.remaining !== null && usage.limit !== null && usage.remaining > 0 && usage.remaining <= Math.max(3, Math.ceil(usage.limit * 0.2)))

  async function selectTheme(nextTheme: Theme) {
    setTheme(nextTheme)
    try {
      if (profile) await saveProfile({ theme: nextTheme })
      showToast('Tema atualizado.', 'success')
    } catch (error) { showToast(friendlyError(error), 'error') }
  }

  async function clear() {
    setBusy(true)
    try { await onClearHistory(); setConfirmClear(false); onClose() }
    catch (error) { showToast(friendlyError(error), 'error') }
    finally { setBusy(false) }
  }

  async function redeem() {
    if (!planEligible || !accepted || normalizedCode.length !== 16) return
    setBusy(true)
    try {
      await onRedeemPlan(normalizedCode, accepted)
      setCode('')
      setAccepted(false)
      showToast('LunaMax ativado com sucesso.', 'success')
    } catch (error) { showToast(friendlyError(error), 'error') }
    finally { setBusy(false) }
  }

  async function logout() {
    setBusy(true)
    try {
      await signOut()
      onClose()
    } catch (error) {
      showToast(friendlyError(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Central da Lunatica" description="Sua conta, memória, assinatura e informações importantes." size="wide">
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Seções das configurações">{tabs.map(({ id, label, description, icon: Icon }) => <button key={id} type="button" onClick={() => setTab(id)} className={`settings-tab ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined}><span className="settings-tab-icon"><Icon className="h-4 w-4" /></span><span><strong>{label}</strong><small>{description}</small></span></button>)}</nav>

          <div className="min-w-0">
            {tab === 'general' && <div>
              <section><h3 className="text-sm font-semibold">Aparência</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Escolha a atmosfera visual da interface.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{([{ value: 'light', label: 'Claro lunar', note: 'Branco suave e legível.', icon: Sun }, { value: 'dark', label: 'Escuro grafite', note: 'Carvão confortável.', icon: Moon }, { value: 'black', label: 'Preto eclipse', note: 'Contraste máximo.', icon: Moon }] as const).map((option) => <button key={option.value} type="button" onClick={() => void selectTheme(option.value as Theme)} className={`theme-card ${theme === option.value ? 'active' : ''}`}><span className={`theme-swatch ${option.value}`}><option.icon className="h-4 w-4" /></span><span><strong>{option.label}</strong><small>{option.note}</small></span></button>)}</div></section>
              <section className="mt-7"><div className="flex items-center justify-between"><div><h3 className="text-sm font-semibold">{usage?.unlimited ? 'Uso LunaMax' : 'Uso diário'}</h3><p className="mt-1 text-xs leading-5 text-zinc-500">{usage?.unlimited ? 'Seu plano não usa limite diário nem limite de contexto.' : 'Avisaremos quando seu limite gratuito estiver perto do fim.'}</p></div>{usage?.plan === 'lunamax' && <span className="plan-badge"><Sparkles className="h-3 w-3" /> LunaMax</span>}</div><div className="mt-4 rounded-2xl border border-lunar-400/15 bg-lunar-500/[0.055] p-4"><div className="flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm"><Sparkles className="h-4 w-4 text-lunar-300" /> {usage?.unlimited ? 'Acesso ampliado' : 'Plano gratuito'}</span><strong className={usageNearLimit ? 'text-amber-300' : 'text-lunar-300'}>{usage?.unlimited ? 'LunaMax ativo' : usageNearLimit ? 'Quase no limite' : 'Disponível'}</strong></div><div className="mt-4 flex items-start gap-2 border-t border-white/10 pt-3 text-xs leading-5 text-zinc-500"><Paperclip className="mt-0.5 h-4 w-4 shrink-0" />{usage?.unlimited ? 'Mensagens e anexos não reduzem seu acesso. O limite técnico continua em 3 arquivos por envio.' : 'Mensagens e anexos usam o acesso gratuito. O contador fica oculto; você recebe um aviso antes de acabar.'}</div></div></section>
              <section className="mt-7 border-t border-white/10 pt-6"><h3 className="text-sm font-semibold">Conta e suporte</h3><div className="mt-3 grid gap-2"><a href="mailto:core.healops@gmail.com?subject=Suporte%20Lunatica" className="settings-row !mt-0 border border-white/10"><Headphones className="h-4 w-4" /><span><strong>Falar com o suporte</strong><small>core.healops@gmail.com</small></span></a><button type="button" onClick={() => void logout()} disabled={busy} className="settings-row !mt-0 border border-white/10"><LogOut className="h-4 w-4" /><span><strong>Sair da conta</strong><small>Encerra a sessão neste dispositivo.</small></span></button></div><button type="button" onClick={() => setConfirmClear(true)} className="danger-row mt-3 border border-red-500/15"><Trash2 className="h-4 w-4" /><span><strong>Limpar todo o histórico</strong><small>Exclui conversas, mensagens e anexos. Suas memórias ficam preservadas.</small></span></button></section>
            </div>}

            {tab === 'memory' && <MemoryPanel memories={memories} loading={memoryLoading} onAdd={onAddMemory} onDelete={onDeleteMemory} />}

            {tab === 'plan' && <div>
              <section className="lunamax-hero"><span className="micro-label text-lunar-300">PLANO LUNAMAX</span><div className="mt-3 flex flex-wrap items-end justify-between gap-3"><div><h3 className="text-3xl font-semibold tracking-[-.04em]">Mais espaço para criar.</h3><p className="mt-2 max-w-lg text-sm leading-6 text-zinc-400">Uma ativação manual de 30 dias, sem cobrança automática.</p></div><p className="text-right"><strong className="text-3xl text-lunar-200">R$ 12,99</strong><small className="block text-[10px] uppercase tracking-wider text-zinc-500">por chave de 30 dias</small></p></div></section>

              {expiredPlan && !plan && <div className="plan-expired-card mt-5"><CircleAlert className="h-5 w-5" /><div><strong>Sua assinatura LunaMax terminou</strong><p>O acesso gratuito continua funcionando. Insira uma nova chave para reativar os benefícios.</p></div></div>}

              {plan ? <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><BadgeCheck className="h-5 w-5" /></span><div><strong className="text-sm text-emerald-200">LunaMax ativo</strong><p className="mt-1 text-xs text-zinc-500">Válido até {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(plan.expires_at))}.</p></div></div></div> : <div className="mt-5 grid gap-3 sm:grid-cols-2">{[
                ['Mensagens ilimitadas', 'Sem créditos diários ou bloqueio por tamanho da conversa.'],
                ['Contexto contínuo', 'Continue conversas longas sem precisar abrir um chat limpo.'],
                ['Respostas mais completas', 'Mais espaço de raciocínio e respostas maiores quando necessário.'],
                ['Busca na web', 'Pesquisa do Google quando o modelo detectar que informações atuais ajudam.'],
              ].map(([title, note]) => <article key={title} className="plan-benefit"><Check className="h-4 w-4" /><div><strong>{title}</strong><p>{note}</p></div></article>)}</div>}

              <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.02] p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-lunar-300" /><div><h3 className="text-sm font-semibold">Antes de ativar</h3><p className="mt-1 text-xs leading-5 text-zinc-500">A Lunatica é uma IA e ainda pode produzir respostas incorretas. Verifique informações importantes, especialmente nas áreas médica, jurídica, financeira e de segurança.</p></div></div><label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 p-3 text-xs leading-5 text-zinc-400"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 accent-violet-500" /><span>Li e concordo que a Lunatica pode cometer erros e que sou responsável por verificar decisões importantes.</span></label></section>

              <section className="mt-5"><label htmlFor="plan-key" className="text-sm font-semibold">Chave de ativação</label><p className="mt-1 text-xs leading-5 text-zinc-500">Insira os 16 números e letras recebidos após falar com o desenvolvedor.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><div className="relative min-w-0 flex-1"><KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><input id="plan-key" value={code} onChange={(event) => setCode(formatCode(event.target.value))} inputMode="text" autoComplete="off" spellCheck={false} placeholder="XXXX XXXX XXXX XXXX" className="field pl-10 font-mono uppercase tracking-[.16em]" /></div><button type="button" className="btn-primary shrink-0" onClick={() => void redeem()} disabled={busy || Boolean(plan) || !planEligible || !accepted || normalizedCode.length !== 16}>{busy ? 'Ativando…' : plan ? 'Plano ativo' : 'Ativar LunaMax'}</button></div>{!planEligible && <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-300"><CircleAlert className="h-3.5 w-3.5" /> Confirme seu email antes de ativar um plano.</p>}</section>

              <section className="mt-7 border-t border-white/10 pt-6"><h3 className="text-sm font-semibold">Como obter uma chave?</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Entre em contato, combine o pagamento diretamente e receba uma chave única. Não envie senhas nem códigos de login.</p><div className="mt-3 grid gap-2 sm:grid-cols-3"><a className="contact-card" href="https://wa.me/5563992938845" target="_blank" rel="noreferrer"><MessageCircle /><strong>WhatsApp</strong><span>+55 63 99293-8845</span></a><a className="contact-card" href="mailto:core.healops@gmail.com?subject=LunaMax" target="_blank" rel="noreferrer"><Mail /><strong>E-mail</strong><span>core.healops@gmail.com</span></a><a className="contact-card" href="https://instagram.com/lucasgabriel_" target="_blank" rel="noreferrer"><AtSign /><strong>Instagram</strong><span>@lucasgabriel_</span></a></div></section>
            </div>}

            {tab === 'important' && <div>
              <span className="micro-label">LEIA COM ATENÇÃO</span><h3 className="mt-3 text-2xl font-semibold tracking-tight">Informações importantes</h3><p className="mt-2 text-sm leading-6 text-zinc-500">Transparência sobre o produto, seus dados e os limites atuais.</p>
              <div className="mt-6 space-y-3">{[
                { icon: CircleAlert, title: 'A IA pode errar', text: 'Não trate respostas como aconselhamento profissional. Confirme fatos relevantes em fontes confiáveis.' },
                { icon: Brain, title: 'Você controla a memória', text: 'Memórias ficam separadas do chat, são usadas apenas quando relevantes e podem ser excluídas neste painel.' },
                { icon: Paperclip, title: 'Arquivos privados', text: 'Anexos são armazenados no Supabase e protegidos por políticas de acesso. Ainda assim, evite dados sensíveis.' },
                { icon: KeyRound, title: 'Ativação manual', text: 'LunaMax não tem renovação automática. Uma chave válida concede o período configurado e funciona uma única vez por conta.' },
                { icon: Rocket, title: 'Produto independente', text: 'Lunatica 1.5 foi criada e é mantida por um único desenvolvedor: Lucas Gabriel R. Aguiar.' },
              ].map(({ icon: Icon, title, text }) => <article key={title} className="important-card"><Icon className="h-4 w-4" /><div><strong>{title}</strong><p>{text}</p></div></article>)}</div>
              <a href="mailto:core.healops@gmail.com?subject=Informação%20importante%20Lunatica" className="btn-secondary mt-6"><Headphones className="h-4 w-4" /> Falar com suporte <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>}
          </div>
        </div>
      </Modal>
      <ConfirmDialog open={confirmClear} title="Limpar todo o histórico?" description="Todas as conversas, mensagens e anexos serão excluídos permanentemente. Suas memórias não serão removidas." confirmLabel="Limpar histórico" busy={busy} onCancel={() => setConfirmClear(false)} onConfirm={() => void clear()} />
    </>
  )
}
