import { useMemo, useState } from 'react'
import GraficoBarras from './GraficoBarras'
import {
  colonesCorto, colonesExactos, unidades,
  etiquetaSemana, tituloSemana, etiquetaMes, tituloMes, tituloAnio,
  DIAS_SEMANA, DIAS_SEMANA_CORTOS, MESES, MESES_CORTOS, lasMasAltas
} from '../../utils/rentabilidadFormato'

/**
 * Cuánto se vende y cuándo: la serie por semana, mes o año, y las tres
 * preguntas de temporada — qué días del mes, qué días de la semana y qué
 * meses del año se vende más. Cada una con su respuesta escrita arriba: el
 * gráfico la muestra, la frase la dice.
 *
 * `medida`: 'ventas' (colones, para el negocio entero: sumar unidades de
 * productos distintos no dice nada) o 'unidades' (para un producto).
 */

const PERIODOS = [
  { clave: 'semanas', texto: 'Por semana' },
  { clave: 'meses', texto: 'Por mes' },
  { clave: 'anios', texto: 'Por año' }
]

function Tarjeta({ titulo, respuesta, children }) {
  return (
    <div className="card min-w-0 p-5">
      <h3 className="text-base font-bold text-neutro-900">{titulo}</h3>
      {respuesta && <p className="mt-0.5 text-sm text-neutro-500">{respuesta}</p>}
      <div className="mt-3">{children}</div>
    </div>
  )
}

export default function CuandoSeVende({ series, medida = 'ventas', titulo = 'Cuándo se vende' }) {
  const [periodo, setPeriodo] = useState('semanas')
  const enColones = medida === 'ventas'
  const formato = enColones ? colonesExactos : (v) => `${unidades(v)} u.`
  const formatoEje = enColones ? colonesCorto : unidades
  const formatoPromedio = enColones ? (v) => `${colonesExactos(v)} por día` : (v) => `${unidades(v)} u. por día`
  const valor = (f) => Number(f[medida]) || 0

  const principal = useMemo(() => {
    if (periodo === 'meses') {
      return series.meses.map((f) => ({ clave: f.inicio, etiqueta: etiquetaMes(f.inicio), titulo: tituloMes(f.inicio), valor: valor(f) }))
    }
    if (periodo === 'anios') {
      return series.anios.map((f) => ({ clave: String(f.anio), etiqueta: String(f.anio), titulo: tituloAnio(f), valor: valor(f) }))
    }
    return series.semanas.map((f) => ({ clave: f.inicio, etiqueta: etiquetaSemana(f.inicio), titulo: tituloSemana(f.inicio), valor: valor(f) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, periodo, medida])
  // El último período todavía no terminó: va más claro y se dice.
  const enCurso = principal[principal.length - 1]?.clave

  const diasDelMes = series.diasDelMes.map((f) => ({ clave: f.dia, etiqueta: String(f.dia), titulo: `Día ${f.dia}`, valor: valor(f) }))
  const diasDeSemana = series.diasDeSemana.map((f) => ({ clave: f.diaSemana, etiqueta: DIAS_SEMANA_CORTOS[f.diaSemana - 1], titulo: DIAS_SEMANA[f.diaSemana - 1], valor: valor(f) }))
  const mesesDelAnio = series.mesesDelAnio.map((f) => ({
    clave: f.mes, etiqueta: MESES_CORTOS[f.mes - 1],
    titulo: `${MESES[f.mes - 1][0].toUpperCase()}${MESES[f.mes - 1].slice(1)} (promedio de ${f.veces} ${f.veces === 1 ? 'año' : 'años'})`,
    valor: valor(f)
  }))

  const topDias = lasMasAltas(diasDelMes, 3, (d) => d.etiqueta)
  const topSemana = lasMasAltas(diasDeSemana, 2, (d) => d.titulo)
  const topMeses = lasMasAltas(mesesDelAnio, 3, (d) => MESES[d.clave - 1])

  return (
    <section className="space-y-4">
      <div className="card min-w-0 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-neutro-900">{titulo}</h2>
            <p className="text-sm text-neutro-500">
              {enColones ? 'Ventas sin IVA' : 'Unidades vendidas'} · el período en curso va más claro
            </p>
          </div>
          <div className="flex rounded-xl bg-neutro-100 p-1" role="tablist">
            {PERIODOS.map((p) => (
              <button key={p.clave} type="button" role="tab" aria-selected={periodo === p.clave}
                onClick={() => setPeriodo(p.clave)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  periodo === p.clave ? 'bg-white text-neutro-900 shadow-sm' : 'text-neutro-500 hover:text-neutro-800'
                }`}>
                {p.texto}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <GraficoBarras datos={principal} formato={formato} formatoEje={formatoEje} enCurso={enCurso}
            descripcion={`${enColones ? 'Ventas' : 'Unidades'} ${PERIODOS.find((p) => p.clave === periodo).texto.toLowerCase()}`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Qué días del mes se vende más"
          respuesta={topDias ? `Los días ${topDias} · promedio de los últimos 12 meses` : 'Sin ventas en los últimos 12 meses'}>
          <GraficoBarras datos={diasDelMes} formato={formatoPromedio} formatoEje={formatoEje} resaltar={3} alto={150}
            descripcion="Promedio por día del mes" />
        </Tarjeta>
        <Tarjeta titulo="Qué días de la semana"
          respuesta={topSemana ? `Más los ${topSemana} · promedio de los últimos 12 meses` : 'Sin ventas en los últimos 12 meses'}>
          <GraficoBarras datos={diasDeSemana} formato={formatoPromedio} formatoEje={formatoEje} resaltar={2} alto={150}
            descripcion="Promedio por día de la semana" />
        </Tarjeta>
      </div>

      <Tarjeta titulo="Qué meses del año se vende más"
        respuesta={topMeses ? `En ${topMeses} · promedio de cada mes con todo el historial (meses completos)` : 'Todavía no hay meses completos con ventas'}>
        <GraficoBarras datos={mesesDelAnio} formato={enColones ? (v) => `${colonesExactos(v)} en el mes` : (v) => `${unidades(v)} u. en el mes`}
          formatoEje={formatoEje} resaltar={3} alto={150} descripcion="Promedio por mes del año" />
      </Tarjeta>
    </section>
  )
}
