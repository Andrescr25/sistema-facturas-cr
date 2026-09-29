import { useState, useEffect } from 'react';
import { Building2, Save, CreditCard, Database, Trash2 } from 'lucide-react';
import { alegraService } from '../services/alegraService';
import { useDialog } from '../hooks/useDialog';
import ConfirmModal from '../components/ConfirmModal';
import SeccionWhatsApp from '../components/configuracion/SeccionWhatsApp';

export default function Configuracion() {
  const { confirm, dialogProps } = useDialog();
  const confirmarDesvincular = (mensaje) =>
    confirm(mensaje, { title: '¿Desvincular WhatsApp?', confirmLabel: 'Desvincular', variant: 'danger' });
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const [config, setConfig] = useState({
    empresa: {
      nombre: 'DISTRIBUIDORA TACHI',
      cedula: '204050474',
      direccion: 'Contiguo al mirador Call vazquez, Palmares',
      telefono: '+506-86477036',
      email: 'tachifacturas@gmail.com',
      actividadEconomica: '523402 - Venta al por menor artículos de ferretería pinturas madera y materiales'
    },
    bancos: [
      { nombre: 'SINPE', cuenta: '86477036 TARCICIO VARGAS CHAVARRIA' },
      { nombre: 'Banco Nacional', cuenta: '5518980336453110' },
      { nombre: 'BAC', cuenta: '4745812311852180' }
    ]
  });

  // Cargar configuración guardada
  useEffect(() => {
    const configGuardada = localStorage.getItem('empresa_config');
    if (configGuardada) {
      try {
        const parsed = JSON.parse(configGuardada);
        setConfig(parsed);
      } catch (error) {
        console.error('Error cargando configuración:', error);
      }
    }
  }, []);

  const handleInputChange = (seccion, campo, valor) => {
    setConfig(prev => ({
      ...prev,
      [seccion]: {
        ...prev[seccion],
        [campo]: valor
      }
    }));
  };

  const handleBancoChange = (index, campo, valor) => {
    const nuevosBancos = [...config.bancos];
    nuevosBancos[index] = { ...nuevosBancos[index], [campo]: valor };
    setConfig(prev => ({ ...prev, bancos: nuevosBancos }));
  };

  const agregarBanco = () => {
    setConfig(prev => ({
      ...prev,
      bancos: [...prev.bancos, { nombre: '', cuenta: '' }]
    }));
  };

  const eliminarBanco = (index) => {
    setConfig(prev => ({
      ...prev,
      bancos: prev.bancos.filter((_, i) => i !== index)
    }));
  };

  const guardarConfiguracion = () => {
    try {
      setLoading(true);
      localStorage.setItem('empresa_config', JSON.stringify(config));
      setMensaje({ tipo: 'success', texto: '✅ Configuración guardada exitosamente' });
      setTimeout(() => setMensaje(null), 3000);
    } catch (error) {
      console.error('Error guardando configuración:', error);
      setMensaje({ tipo: 'error', texto: '❌ Error guardando configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleLimpiarFaltantes = async () => {
    if (!window.confirm('⚠️ ¿Estás seguro de limpiar la Base de Datos DE FALTANTES?\n\nEsta acción elimina:\n- Todos los faltantes pendientes y procesados.\n- Ajustes temporales y observaciones.\n\nÚsala solo después de haber procesado tus pedidos de la semana.')) {
      return;
    }

    try {
      setLoading(true);
      const resultado = await alegraService.limpiarFaltantesProveedor();

      alert(`✅ Limpieza exitosa:\n\n• ${resultado.datos_borrados || 0} pendientes borrados\n• ${resultado.procesados_borrados || 0} procesados borrados\n• ${resultado.ajustes_eliminados || 0} ajustes eliminados\n• ${resultado.facturas_pendientes_eliminadas || 0} facturas liberadas`);

    } catch (error) {
      console.error('Error limpiando BD:', error);
      alert(`❌ Error al limpiar: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutro-900 flex items-center gap-3">
            <Building2 className="text-primario-600" size={32} />
            Configuración del Sistema
          </h1>
          <p className="text-neutro-600 mt-2">Configura los datos de tu empresa y facturas</p>
        </div>

        <button
          onClick={guardarConfiguracion}
          disabled={loading}
          className="btn btn-primary flex items-center gap-2"
        >
          <Save size={20} />
          Guardar Cambios
        </button>
      </div>

      {/* Mensaje de confirmación */}
      {mensaje && (
        <div className={`mb-6 p-4 rounded-lg ${mensaje.tipo === 'success' ? 'bg-exito-100 text-exito-800' : 'bg-peligro-100 text-peligro-800'
          }`}>
          {mensaje.texto}
        </div>
      )}

      <div className="space-y-6">
        {/* Información de la Empresa */}
        <div className="card p-5 sm:p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Building2 size={24} className="text-primario-600" />
            Información de la Empresa
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Nombre de la Empresa *</label>
              <input
                type="text"
                value={config.empresa.nombre}
                onChange={(e) => handleInputChange('empresa', 'nombre', e.target.value)}
                className="input"
                placeholder="DISTRIBUIDORA TACHI"
              />
            </div>

            <div>
              <label className="label">Cédula Jurídica/Física *</label>
              <input
                type="text"
                value={config.empresa.cedula}
                onChange={(e) => handleInputChange('empresa', 'cedula', e.target.value)}
                className="input"
                placeholder="3-101-234567"
              />
            </div>

            <div>
              <label className="label">Teléfono</label>
              <input
                type="tel"
                value={config.empresa.telefono}
                onChange={(e) => handleInputChange('empresa', 'telefono', e.target.value)}
                className="input"
                placeholder="+506-2222-2222"
              />
            </div>

            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={config.empresa.email}
                onChange={(e) => handleInputChange('empresa', 'email', e.target.value)}
                className="input"
                placeholder="info@empresa.com"
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Dirección</label>
              <input
                type="text"
                value={config.empresa.direccion}
                onChange={(e) => handleInputChange('empresa', 'direccion', e.target.value)}
                className="input"
                placeholder="San José, Costa Rica"
              />
            </div>

            <div className="md:col-span-2">
              <label className="label">Actividad Económica</label>
              <textarea
                value={config.empresa.actividadEconomica}
                onChange={(e) => handleInputChange('empresa', 'actividadEconomica', e.target.value)}
                className="input resize-none"
                rows="2"
                placeholder="523402 - Venta al por menor..."
              />
            </div>
          </div>
        </div>

        {/* Cuentas Bancarias */}
        <div className="card p-5 sm:p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CreditCard size={24} className="text-exito-600" />
            Cuentas Bancarias
          </h2>

          <div className="space-y-4">
            {config.bancos.map((banco, index) => (
              <div key={index} className="flex gap-3 items-start">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={banco.nombre}
                    onChange={(e) => handleBancoChange(index, 'nombre', e.target.value)}
                    className="input"
                    placeholder="Nombre del banco (ej: SINPE, BAC)"
                  />
                  <input
                    type="text"
                    value={banco.cuenta}
                    onChange={(e) => handleBancoChange(index, 'cuenta', e.target.value)}
                    className="input"
                    placeholder="Número de cuenta"
                  />
                </div>
                <button
                  onClick={() => eliminarBanco(index)}
                  className="btn btn-outline text-peligro-600 border-peligro-300 hover:bg-peligro-50"
                >
                  Eliminar
                </button>
              </div>
            ))}

            <button
              onClick={agregarBanco}
              className="btn btn-outline w-full"
            >
              + Agregar Cuenta Bancaria
            </button>
          </div>
        </div>

        <SeccionWhatsApp confirmar={confirmarDesvincular} />

        {/* Zona de Peligro / Mantenimiento */}
        <div className="card border-peligro-200 p-5 sm:p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-peligro-700">
            <Database size={24} />
            Mantenimiento del Sistema
          </h2>

          <div className="bg-peligro-50 p-4 rounded-lg border border-peligro-100 mb-4">
            <h3 className="font-bold text-peligro-800 mb-2">Limpieza Manual de Faltantes</h3>
            <p className="text-sm text-peligro-700 mb-4">
              Esta acción ejecuta la misma limpieza automática de los domingos a las 23:59.<br />
              Utilízala si necesitas "resetear" el ciclo de pedidos manualmente (por ejemplo, lunes por la mañana).
            </p>

            <button
              onClick={handleLimpiarFaltantes}
              disabled={loading}
              className="btn bg-peligro-600 hover:bg-peligro-700 text-white border-none flex items-center gap-2"
            >
              <Trash2 size={18} />
              Limpiar BD Faltantes Ahora
            </button>
          </div>
        </div>
      </div>
      <ConfirmModal {...dialogProps} />
    </div>
  );
}
