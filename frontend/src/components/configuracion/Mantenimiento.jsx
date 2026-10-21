/** La historia se conserva; no hay limpieza global. */
export default function Mantenimiento() {
  return <section className="space-y-4">
    <h2 className="text-lg font-bold text-neutro-900">Historial operativo</h2>
    <div className="card p-4 sm:p-6 space-y-2">
      <p>Las facturas y los pedidos conservan su historial.</p>
      <p>En Reporte Clientes, las facturas enviadas a Impresión pasan a Historial después de 24 horas sin movimiento.</p>
      <p>En Reporte Proveedores, los pedidos enviados se muestran separados de los faltantes nuevos.</p>
    </div>
  </section>
}
