import React from 'react'
import { useParams } from 'react-router-dom'
import { Empty, Loading } from './UI'
import { useStore, usePublicEvent } from '../lib/store'

// Espera os dados públicos chegarem do banco antes de mostrar a tela. Com
// :slug na rota, também mantém aquele evento carregado e ao vivo.
export default function PublicGate({ children, dark = false }) {
  const { slug } = useParams()
  const { status } = useStore()
  usePublicEvent(slug)
  if (!status.ready) return <Loading dark={dark} />
  if (status.error && status.scope === 'public') {
    return <section className="section narrow"><Empty title="Sem conexão com o banco" description={status.error} /></section>
  }
  return children
}
