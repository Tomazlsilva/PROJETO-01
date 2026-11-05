import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { concluirLoginOAuth2 } from '@/lib/oauth2'

// A Microsoft devolve o usuário para a URI pública registrada no Portal Azure
// (ex.: https://gavazziengenharia.goskip.app/api/oauth2-redirect), que é uma
// rota da própria SPA. Quando o fluxo começou nesta janela, o popup troca o
// código diretamente com o PocketBase e devolve o resultado à janela principal
// por postMessage. Sem pendência local (ex.: popup bloqueado), repassa os
// parâmetros ao endpoint de OAuth2 do PocketBase na mesma janela.
export default function OAuth2Redirect() {
  const [mensagem, setMensagem] = useState('Retornando ao aplicativo…')

  useEffect(() => {
    void concluirLoginOAuth2().then((r) => {
      if (!r.ok) setMensagem(r.mensagem)
      // Em caso de sucesso a janela é fechada pelo postMessage;
      // se for a própria aba (sem opener), /dashboard já foi aberto.
    })
  }, [])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-[#F5F7FA] px-6 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden />
      <span>{mensagem}</span>
    </div>
  )
}
