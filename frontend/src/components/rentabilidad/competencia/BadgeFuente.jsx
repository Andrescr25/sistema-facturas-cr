const ESTILO_FUENTE = {
  epa: 'bg-yellow-100 text-yellow-700',
  walmart: 'bg-blue-100 text-blue-700',
  masxmenos: 'bg-emerald-100 text-emerald-700'
}

const LABEL_FUENTE = {
  epa: 'EPA',
  walmart: 'Walmart',
  masxmenos: 'Mas x Menos'
}

export default function BadgeFuente({ fuente }) {
  return (
    <span className={`inline-block text-[11px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap ${ESTILO_FUENTE[fuente] || 'bg-gray-100 text-gray-600'}`}>
      {LABEL_FUENTE[fuente] || fuente}
    </span>
  )
}
