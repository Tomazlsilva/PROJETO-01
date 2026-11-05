import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'
import { getErrorMessage } from '@/lib/pocketbase/errors'

// Login OAuth2 (Microsoft) em duas janelas, sem depender do realtime do
// PocketBase. O redirect_uri enviado à Microsoft é sempre o host PÚBLICO do
// frontend — https://gavazziengenharia.goskip.app/api/oauth2-redirect na
// produção e https://login-do-crm-921ce--preview.goskip.app/api/oauth2-redirect
// no preview — porque são as únicas URIs registradas no Portal Azure. O host
// do backend (*.internal.goskip.dev) é rejeitado pela Microsoft com AADSTS50011.
//
// - Janela principal: guarda o verificador PKCE (localStorage, compartilhado
//   entre janelas da mesma origem) e abre o popup na tela da Microsoft.
// - Popup: volta para a rota /api/oauth2-redirect da própria SPA, troca o
//   código diretamente com o PocketBase e devolve o resultado por postMessage.
//
// IMPORTANTE: o authURL que o PocketBase devolve vem SEM o parâmetro
// redirect_uri (acaba em "redirect_uri=" vazio — verificado no endpoint
// auth-methods). O PocketBase preenche esse parâmetro só dentro do próprio
// SDK, no método authorizeProvider(); fora dele o URL segue sem redirect_uri.
// Por isso a função abaixo ACRESCENTA o parâmetro quando ele não existe,
// com encodeURIComponent para a Microsoft aceitar o valor exato registrado
// no Portal Azure (AADSTS50011 quando difere, mesmo em case/escape).
// O state é trocado pelo valor local: o state do PocketBase pertence ao
// realtime do SDK, que este fluxo de duas janelas não usa.

const OAUTH2_REDIRECT_PATH = '/api/oauth2-redirect'
const PENDENTE_KEY = 'cmx_oauth2_pendente'
const PENDENTE_TTL_MS = 15 * 60 * 1000

interface Pendente {
  provider: string
  codeVerifier: string
  redirectURL: string
  state: string
  criadoEm: number
}

interface MensagemPopup {
  tipo: 'cmx-oauth2'
  ok: boolean
  mensagem?: string
  status?: number
  token?: string
  record?: RecordModel
}

export interface RetornoOAuth2 {
  token: string
  record: RecordModel
}

// Hosts públicos do frontend (*.goskip.app) servem a SPA e têm a rota de
// retorno registrada no Azure; fora deles (desenvolvimento local) mantém o
// comportamento antigo do SDK, que deriva o redirect do host do PocketBase.
function redirectUriPublica(): string {
  const origem = typeof window === 'undefined' ? '' : window.location.origin
  if (/^https:\/\/[^/]*\.goskip\.app$/.test(origem)) {
    return origem + OAUTH2_REDIRECT_PATH
  }
  return pb.buildURL(OAUTH2_REDIRECT_PATH)
}

function guardarPendente(pendente: Pendente): void {
  try {
    localStorage.setItem(PENDENTE_KEY, JSON.stringify(pendente))
  } catch {
    // armazenamento indisponível: o popup não conseguirá trocar o código
  }
}

function lerPendente(): Pendente | null {
  try {
    const bruto = localStorage.getItem(PENDENTE_KEY)
    if (!bruto) return null
    const pendente = JSON.parse(bruto) as Pendente
    if (
      !pendente?.provider ||
      !pendente?.codeVerifier ||
      !pendente?.redirectURL ||
      Date.now() - (pendente.criadoEm || 0) > PENDENTE_TTL_MS
    ) {
      localStorage.removeItem(PENDENTE_KEY)
      return null
    }
    return pendente
  } catch {
    return null
  }
}

function descartarPendente(): void {
  try {
    localStorage.removeItem(PENDENTE_KEY)
  } catch {
    // armazenamento indisponível
  }
}

// Substitui o parâmetro na URL do provedor (ou acrescenta, quando ausente).
function trocarParametro(url: string, chave: string, valor: string): string {
  const padrao = new RegExp('([?&])' + chave + '=[^&]*')
  if (padrao.test(url)) {
    return url.replace(padrao, '$1' + chave + '=' + encodeURIComponent(valor))
  }
  return url + (url.includes('?') ? '&' : '?') + chave + '=' + encodeURIComponent(valor)
}

function notificarOpener(mensagem: MensagemPopup): void {
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(mensagem, window.location.origin)
    }
  } catch {
    // opener de outra origem ou indisponível
  }
}

// Lado da janela principal: abre o popup na tela da Microsoft (de forma
// síncrona, ainda no gesto do clique — exigência do Safari/iOS) e aguarda o
// resultado que o popup devolve pela rota /api/oauth2-redirect da SPA.
export function iniciarLoginOAuth2(providerName: string): Promise<RetornoOAuth2> {
  return new Promise<RetornoOAuth2>((resolve, reject) => {
    let popup: Window | null = null
    let encerrado = false
    let vigia: ReturnType<typeof setInterval> | undefined

    const finalizar = (prosseguir: () => void): void => {
      if (encerrado) return
      encerrado = true
      if (vigia) clearInterval(vigia)
      window.removeEventListener('message', aoMensagem)
      prosseguir()
    }

    const aoMensagem = (evento: MessageEvent): void => {
      if (encerrado) return
      if (evento.origin !== window.location.origin || evento.source !== popup) return
      const dados = evento.data as MensagemPopup | undefined
      if (!dados || dados.tipo !== 'cmx-oauth2') return
      if (dados.ok && dados.token) {
        finalizar(() =>
          resolve({ token: dados.token as string, record: dados.record as RecordModel }),
        )
      } else {
        const erro = new Error(dados.mensagem || 'Não foi possível concluir o login.') as Error & {
          status?: number
        }
        erro.status = dados.status
        finalizar(() => {
          if (popup && !popup.closed) popup.close()
          reject(erro)
        })
      }
    }

    window.addEventListener('message', aoMensagem)
    vigia = setInterval(() => {
      if (popup && popup.closed && !encerrado) {
        finalizar(() => reject(new Error('A janela de login foi fechada antes de concluir.')))
      }
    }, 800)

    void (async () => {
      try {
        // A janela é criada antes do primeiro await: fora de funções async o
        // Safari e o iOS só abrem janelas no gesto do clique.
        popup = window.open('about:blank', 'cmx_oauth2', 'width=520,height=720,popup=yes')
        const metodos = await pb.collection('users').listAuthMethods()
        const provedor = (metodos.oauth2?.providers || []).find((p) => p.name === providerName)
        if (!metodos.oauth2?.enabled || !provedor) {
          throw new Error('Provedor de login indisponível. Tente novamente.')
        }
        const redirectURL = redirectUriPublica()
        const pendente: Pendente = {
          provider: provedor.name,
          codeVerifier: provedor.codeVerifier,
          redirectURL,
          state: crypto.randomUUID(),
          criadoEm: Date.now(),
        }
        guardarPendente(pendente)
        const url = trocarParametro(
          trocarParametro(provedor.authURL, 'redirect_uri', redirectURL),
          'state',
          pendente.state,
        )
        if (popup && !popup.closed) {
          popup.location.href = url
        } else {
          // Popup bloqueado: segue na própria aba; a sessão fica no
          // localStorage e o app entra ao recarregar na volta da Microsoft.
          window.location.href = url
        }
      } catch (erro) {
        finalizar(() => {
          if (popup && !popup.closed) popup.close()
          reject(erro instanceof Error ? erro : new Error('Não foi possível iniciar o login.'))
        })
      }
    })()
  })
}

// Lado do popup: recebe code/state da Microsoft, troca o código pelo token do
// PocketBase (mesmas regras do servidor: só conta existente e ativa entra) e
// devolve o resultado à janela principal por postMessage.
export async function concluirLoginOAuth2(): Promise<{ ok: boolean; mensagem: string }> {
  const pendente = lerPendente()

  if (!pendente) {
    // Sem pendência local (acesso direto ou fluxo antigo): repassa os
    // parâmetros ao endpoint de OAuth2 do PocketBase.
    window.location.replace(pb.buildURL(OAUTH2_REDIRECT_PATH) + window.location.search)
    return { ok: false, mensagem: 'Retornando ao aplicativo…' }
  }

  const parametros = new URLSearchParams(window.location.search)
  const code = parametros.get('code')
  const erroProvedor = parametros.get('error')
  const state = parametros.get('state')

  if (erroProvedor || !code || state !== pendente.state) {
    const mensagem = erroProvedor
      ? 'A Microsoft cancelou a autorização. Tente novamente.'
      : state !== pendente.state
        ? 'Resposta de login inválida. Tente novamente.'
        : 'Código de autorização ausente. Tente novamente.'
    descartarPendente()
    notificarOpener({ tipo: 'cmx-oauth2', ok: false, mensagem })
    return { ok: false, mensagem }
  }

  try {
    const authData = await pb
      .collection('users')
      .authWithOAuth2Code(pendente.provider, code, pendente.codeVerifier, pendente.redirectURL)
    descartarPendente()
    notificarOpener({
      tipo: 'cmx-oauth2',
      ok: true,
      token: authData.token,
      record: authData.record,
    })
    if (!window.opener || window.opener.closed) {
      window.location.replace('/dashboard')
      return { ok: true, mensagem: 'Entrada concluída.' }
    }
    return { ok: true, mensagem: 'Entrada concluída. Pode fechar esta janela.' }
  } catch (erro) {
    // 400 = conta não cadastrada/inativa: o servidor responde
    // "Acesso não liberado. Fale com o administrador."
    const status = (erro as { status?: number })?.status
    const mensagem = getErrorMessage(erro)
    descartarPendente()
    notificarOpener({ tipo: 'cmx-oauth2', ok: false, mensagem, status })
    return { ok: false, mensagem }
  }
}
