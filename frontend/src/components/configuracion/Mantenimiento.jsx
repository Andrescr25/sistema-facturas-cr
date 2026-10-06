/** Conservación por ciclo; ninguna acción de limpieza global. */
export default function Mantenimiento() {
  return <section className="space-y-4">
    <h2 className="text-lg font-bold text-neutro-900">Historial operativo</h2>
    <div className="card p-4 sm:p-6 space-y-2">
      <p>Los pedidos, faltantes y compras se conservan por ruta y semana.</p>
      <p>Una orden con recepción final sale de la lista activa 24 horas después.
        Podés consultarla en Reporte Proveedores → Órdenes por ciclo → Historial,
        junto con su factura, PDF y recepción.</p>
      <p>Las recepciones parciales siguen activas hasta registrar la entrega final.</p>
    </div>
  </section>
}
