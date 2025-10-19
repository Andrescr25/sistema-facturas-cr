import { useState, useEffect } from 'react';
import { Building2, Save, Upload, Image as ImageIcon, CreditCard, FileText } from 'lucide-react';

export default function Configuracion() {
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  const [config, setConfig] = useState({
    empresa: {
      nombre: 'DISTRIBUIDORA TACHI',
      cedula: '204050474',
      direccion: 'Contiguo al mirador Call vazquez, Palmares',
      telefono: '+506-86477036',
      email: 'tachifacturas@gmail.com',
      actividadEconomica: '523402 - Venta al por menor artículos de ferretería pinturas madera y materiales',
      logo: null
    },
    bancos: [
      { nombre: 'SINPE', cuenta: '86477036 TARCICIO VARGAS CHAVARRIA' },
      { nombre: 'Banco Nacional', cuenta: '5518980336453110' },
      { nombre: 'BAC', cuenta: '4745812311852180' }
    ],
    factura: {
      terminosCondiciones: 'Gracias por su compra. Garantía según términos del fabricante.',
      notaPie: 'Factura autorizada por Hacienda',
      mostrarLogo: true,
      mostrarCabys: true,
      colorPrimario: '#FF6B35' // Naranja por defecto
    }
  });

  // Cargar configuración guardada
  useEffect(() => {
    const configGuardada = localStorage.getItem('empresa_config');
    if (configGuardada) {
      try {
        const parsed = JSON.parse(configGuardada);
        setConfig(parsed);
        if (parsed.empresa.logo) {
          setLogoPreview(parsed.empresa.logo);
        }
      } catch (error) {
        console.error('Error cargando configuración:', error);
      }
    }
  }, []);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validar tamaño (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setMensaje({ tipo: 'error', texto: 'El logo debe ser menor a 2MB' });
        return;
      }

      // Validar tipo
      if (!file.type.startsWith('image/')) {
        setMensaje({ tipo: 'error', texto: 'Solo se permiten imágenes' });
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        setLogoPreview(base64);
        setConfig(prev => ({
          ...prev,
          empresa: { ...prev.empresa, logo: base64 }
        }));
      };
      reader.readAsDataURL(file);
    }
  };

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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Building2 className="text-blue-600" size={32} />
            Configuración del Sistema
          </h1>
          <p className="text-gray-600 mt-2">Configura los datos de tu empresa y facturas</p>
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
        <div className={`mb-6 p-4 rounded-lg ${
          mensaje.tipo === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {mensaje.texto}
        </div>
      )}

      <div className="space-y-6">
        {/* Información de la Empresa */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Building2 size={24} className="text-blue-600" />
            Información de la Empresa
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo */}
            <div className="md:col-span-2">
              <label className="label">Logo de la Empresa</label>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative">
                    <img
                      src={logoPreview}
                      alt="Logo"
                      className="h-24 w-24 object-contain border-2 border-gray-300 rounded-lg p-2"
                    />
                    <button
                      onClick={() => {
                        setLogoPreview(null);
                        setConfig(prev => ({
                          ...prev,
                          empresa: { ...prev.empresa, logo: null }
                        }));
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="h-24 w-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                    <ImageIcon size={32} className="text-gray-400" />
                  </div>
                )}

                <div>
                  <label className="btn btn-outline cursor-pointer flex items-center gap-2 w-fit">
                    <Upload size={16} />
                    Subir Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                  </label>
                  <p className="text-xs text-gray-500 mt-2">PNG o JPG. Máximo 2MB.</p>
                </div>
              </div>
            </div>

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
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CreditCard size={24} className="text-green-600" />
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
                  className="btn btn-outline text-red-600 border-red-300 hover:bg-red-50"
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

        {/* Configuración de Facturas */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileText size={24} className="text-purple-600" />
            Configuración de Facturas
          </h2>

          <div className="space-y-4">
            <div>
              <label className="label">Términos y Condiciones</label>
              <textarea
                value={config.factura.terminosCondiciones}
                onChange={(e) => handleInputChange('factura', 'terminosCondiciones', e.target.value)}
                className="input resize-none"
                rows="3"
                placeholder="Gracias por su compra..."
              />
            </div>

            <div>
              <label className="label">Nota al Pie de Página</label>
              <input
                type="text"
                value={config.factura.notaPie}
                onChange={(e) => handleInputChange('factura', 'notaPie', e.target.value)}
                className="input"
                placeholder="Factura autorizada por Hacienda"
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.factura.mostrarLogo}
                    onChange={(e) => handleInputChange('factura', 'mostrarLogo', e.target.checked)}
                    className="w-5 h-5"
                  />
                  <span>Mostrar logo en facturas</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.factura.mostrarCabys}
                    onChange={(e) => handleInputChange('factura', 'mostrarCabys', e.target.checked)}
                    className="w-5 h-5"
                  />
                  <span>Mostrar código CABYS</span>
                </label>
              </div>

              <div>
                <label className="label">Color Principal de la Factura</label>
                <div className="flex items-center gap-4">
                  <input
                    type="color"
                    value={config.factura.colorPrimario}
                    onChange={(e) => handleInputChange('factura', 'colorPrimario', e.target.value)}
                    className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
                  />
                  <div className="flex-1">
                    <input
                      type="text"
                      value={config.factura.colorPrimario}
                      onChange={(e) => handleInputChange('factura', 'colorPrimario', e.target.value)}
                      className="input"
                      placeholder="#FF6B35"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                    <p className="text-xs text-gray-500 mt-1">Color para encabezados y títulos del PDF</p>
                  </div>
                  
                  {/* Colores predefinidos */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleInputChange('factura', 'colorPrimario', '#FF6B35')}
                      className="w-8 h-8 rounded-full border-2 border-gray-300 hover:border-gray-500"
                      style={{ backgroundColor: '#FF6B35' }}
                      title="Naranja (Defecto)"
                    />
                    <button
                      type="button"
                      onClick={() => handleInputChange('factura', 'colorPrimario', '#2563EB')}
                      className="w-8 h-8 rounded-full border-2 border-gray-300 hover:border-gray-500"
                      style={{ backgroundColor: '#2563EB' }}
                      title="Azul"
                    />
                    <button
                      type="button"
                      onClick={() => handleInputChange('factura', 'colorPrimario', '#059669')}
                      className="w-8 h-8 rounded-full border-2 border-gray-300 hover:border-gray-500"
                      style={{ backgroundColor: '#059669' }}
                      title="Verde"
                    />
                    <button
                      type="button"
                      onClick={() => handleInputChange('factura', 'colorPrimario', '#DC2626')}
                      className="w-8 h-8 rounded-full border-2 border-gray-300 hover:border-gray-500"
                      style={{ backgroundColor: '#DC2626' }}
                      title="Rojo"
                    />
                    <button
                      type="button"
                      onClick={() => handleInputChange('factura', 'colorPrimario', '#7C3AED')}
                      className="w-8 h-8 rounded-full border-2 border-gray-300 hover:border-gray-500"
                      style={{ backgroundColor: '#7C3AED' }}
                      title="Morado"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
