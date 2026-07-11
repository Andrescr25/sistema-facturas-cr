/**
 * Modal para registrar un proveedor nuevo directamente en Alegra (usado
 * cuando el destino de una reasignación aún no existe). Extraído de
 * ReporteProveedores.jsx.
 */
export default function ModalCrearProveedor({ loading, onCrear, onCerrar }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-2xl font-bold mb-4">Registrar en Alegra</h2>
        <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.target); onCrear({ name: fd.get('name'), identification: fd.get('identification'), identificationType: fd.get('identificationType') }); }}>
          <div className="space-y-4">
            <input name="name" required className="input w-full" placeholder="Razón Social o Nombre *" />
            <select name="identificationType" className="input w-full"><option value="">-- Doc. Tipo --</option><option value="CF">Física</option><option value="CJ">Jurídica</option></select>
            <input name="identification" className="input w-full" placeholder="Número Documento" />
          </div>
          <div className="flex gap-2 mt-6">
            <button type="button" onClick={onCerrar} className="btn btn-outline flex-1">Atrás</button>
            <button type="submit" className="btn btn-primary flex-1" disabled={loading}>Crear y Asignar</button>
          </div>
        </form>
      </div>
    </div>
  )
}
