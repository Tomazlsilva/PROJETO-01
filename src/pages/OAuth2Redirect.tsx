import { useEffect } from 'react'
import pb from '@/lib/pocketbase/client'

// A Microsoft devolve o usuário para a URI pública registrada no Portal Azure
// (ex.: https://gavazziengenharia.goskip.app/api/oauth2-redirect). Os hosts
// públicos do frontend servem apenas a SPA, então esta rota repassa os parâmetros
// (state/code) ao endpoint de OAuth2 do PocketBase, que fecha o popup e devolve
// o resultado ao app pela conexão realtime aberta no login.
export default function OAuth2Redirect() {
  useEffect(() => {
    window.location.replace(pb.buildURL('/api/oauth2-redirect') + window.location.search)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-sm text-slate-500">
      Retornando ao aplicativo…
    </div>
  )
}
