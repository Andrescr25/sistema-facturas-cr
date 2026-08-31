const ESTILO_FUENTE = {
  epa: 'bg-alerta-100 text-alerta-700',
  walmart: 'bg-primario-100 text-primario-700',
  masxmenos: 'bg-exito-100 text-exito-700'
}

const LABEL_FUENTE = {
  epa: 'EPA',
  walmart: 'Walmart',
  masxmenos: 'Mas x Menos'
}

export default function BadgeFuente({ fuente }) {
  return (
    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap ${ESTILO_FUENTE[fuente] || 'bg-neutro-100 text-neutro-600'}`}>
      {LABEL_FUENTE[fuente] || fuente}
    </span>
  )
}
