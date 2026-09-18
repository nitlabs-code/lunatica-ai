import { ArrowUpRight, Code2, Lightbulb, PenLine, Split } from 'lucide-react'

const starters = [
  { tag: '01 / CONSTRUIR', title: 'Do bug à solução.', detail: 'Cole o código. Vamos encontrar a causa.', icon: Code2, prompt: 'Quero revisar um código. Vou colar o trecho e explicar o comportamento esperado para encontrarmos a causa do problema.' },
  { tag: '02 / EXPLORAR', title: 'Uma ideia, mil caminhos.', detail: 'Dê forma ao que ainda está no rascunho.', icon: Lightbulb, prompt: 'Tenho uma ideia e quero transformá-la em um projeto viável. Ajude a definir o primeiro passo a partir do que vou contar.' },
  { tag: '03 / ESCREVER', title: 'Encontre suas palavras.', detail: 'Um texto que soe como você.', icon: PenLine, prompt: 'Quero melhorar um texto mantendo minha voz. Vou enviar o rascunho, o público e o objetivo.' },
  { tag: '04 / DECIDIR', title: 'Clareza para seguir.', detail: 'Compare caminhos e seus custos reais.', icon: Split, prompt: 'Preciso tomar uma decisão. Ajude a comparar minhas opções, incertezas e consequências antes de recomendar um caminho.' },
]

export function WelcomePanel({ onSelect }: { onSelect: (prompt: string) => void }) {
  function select(prompt: string) {
    onSelect(prompt)
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensagem para a Lunatica"]')?.focus())
  }

  return <section className="welcome-panel">
    <div className="welcome-signature"><span>LUNATICA <b>1.5</b></span><span className="welcome-rule" aria-hidden="true" /></div>
    <div className="welcome-intro"><span className="welcome-eyebrow">UM ESPAÇO PARA PENSAR JUNTO</span><h1>Como posso ajudar?</h1><p>Traga a pergunta difícil, o código teimoso ou aquela ideia que ainda não tem nome.</p></div>
    <div className="welcome-grid">{starters.map(({ tag, title, detail, icon: Icon, prompt }) => <button className="welcome-card" type="button" key={tag} onClick={() => select(prompt)}><span className="welcome-card-top"><span>{tag}</span><ArrowUpRight className="h-4 w-4" /></span><Icon className="welcome-card-icon" /><strong>{title}</strong><small>{detail}</small></button>)}</div>
    <p className="welcome-footnote"><span aria-hidden="true">✦</span> Seu ponto de partida pode ser uma frase, uma foto ou um arquivo.</p>
  </section>
}
