import { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Search,
  Check,
  AlertCircle,
  Save,
  CheckSquare,
  ChevronRight,
  Play,
  CheckCircle,
  RefreshCw,
  X,
  TrendingUp,
  AlertTriangle,
  Info,
  ArrowLeft,
  DollarSign
} from 'lucide-react';
import {
  getAuditorias,
  getCategorias,
  crearAuditoria,
  getAuditoriaDetalle,
  guardarConteos,
  finalizarAuditoria,
  ajustarAlegra,
  resyncAuditoria
} from '../services/inventarioService';

import ToastContainer from '../components/ToastContainer';

const formatCurrency = (value) =>
  `₡${(Number(value) || 0).toLocaleString('es-CR', { minimumFractionDigits: 2 })}`;

const formatDate = (value) =>
  new Date(value).toLocaleDateString('es-CR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

export default function InventarioAuditoria() {
  // State
  const [auditorias, setAuditorias] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'info', duration = 5000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, duration }]);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Active states
  const [auditoriaActiva, setAuditoriaActiva] = useState(null);
  const [conteosDraft, setConteosDraft] = useState({}); // { itemId: stock_real }
  const [observacionesFinales, setObservacionesFinales] = useState('');

  // Modal states
  const [showNewModal, setShowNewModal] = useState(false);
  const [newAuditTipo, setNewAuditTipo] = useState('random');
  const [newAuditCategoria, setNewAuditCategoria] = useState('');
  const [newAuditNombre, setNewAuditNombre] = useState('');

  // Search & filter states for audit execution
  const [executionSearch, setExecutionSearch] = useState('');
  const [executionFilter, setExecutionFilter] = useState('todos'); // 'todos', 'pendiente', 'correcto', 'descuadre'

  // Alegra adjustment state
  const [loadingAjuste, setLoadingAjuste] = useState(false);
  const [successAjuste, setSuccessAjuste] = useState(null);

  // Load initial dashboard data
  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditorias();
      if (data.success) {
        setAuditorias(data.data);
      }

      const cats = await getCategorias();
      if (cats.success) {
        setCategorias(cats.data);
        if (cats.data.length > 0) {
          setNewAuditCategoria(cats.data[0]);
        }
      }
    } catch (err) {
      console.error('Error cargando panel de inventario:', err);
      setError('No se pudo cargar la información de inventario.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // Compute KPIs
  const kpis = useMemo(() => {
    const finalizadas = auditorias.filter(a => a.estado === 'finalizado');
    if (finalizadas.length === 0) {
      return { precision: 100, descuadre: 0, total: 0 };
    }

    const sumPrecision = finalizadas.reduce((acc, curr) => acc + Number(curr.precision_porcentaje || 0), 0);
    const sumDescuadre = finalizadas.reduce((acc, curr) => acc + Number(curr.descuadre_dinero || 0), 0);

    return {
      precision: sumPrecision / finalizadas.length,
      descuadre: sumDescuadre,
      total: auditorias.length
    };
  }, [auditorias]);

  // Load details of a specific audit
  const handleSelectAuditoria = async (id) => {
    setLoading(true);
    setError(null);
    setSuccessAjuste(null);
    try {
      const result = await getAuditoriaDetalle(id);
      if (result.success) {
        setAuditoriaActiva(result.data);
        // Initialize draft counts
        const draft = {};
        result.data.items.forEach(item => {
          draft[item.id] = item.stock_real !== null ? item.stock_real : '';
        });
        setConteosDraft(draft);
        setObservacionesFinales(result.data.observaciones || '');
      }
    } catch (err) {
      console.error('Error cargando detalles de auditoría:', err);
      setError('No se pudieron obtener los detalles de la auditoría.');
    } finally {
      setLoading(false);
    }
  };

  // Start new audit
  const handleCreateAudit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await crearAuditoria(newAuditTipo, newAuditTipo === 'categoria' ? newAuditCategoria : null, newAuditNombre);
      if (result.success) {
        setShowNewModal(false);
        setNewAuditNombre('');
        // Load details immediately
        await handleSelectAuditoria(result.data.id);
        // Refresh dashboard list behind
        const dashboardData = await getAuditorias();
        if (dashboardData.success) {
          setAuditorias(dashboardData.data);
        }
      }
    } catch (err) {
      console.error('Error al iniciar auditoría:', err);
      setError(err.response?.data?.message || 'Error al crear la sesión de auditoría.');
    } finally {
      setLoading(false);
    }
  };

  // Save draft counts
  // Save counts and immediately apply adjustments in Alegra
  const handleSaveDraft = async () => {
    if (!auditoriaActiva) return;
    setLoading(true);
    try {
      // Filtrar sólo ítems no ajustados que tengan un conteo real ingresado
      const itemsPayload = Object.entries(conteosDraft)
        .map(([id, val]) => {
          const item = auditoriaActiva.items.find(i => i.id === Number(id));
          return {
            id: Number(id),
            stock_real: val !== '' ? Number(val) : null,
            ajustado_alegra: item?.ajustado_alegra
          };
        })
        .filter(p => !p.ajustado_alegra && p.stock_real !== null);

      if (itemsPayload.length === 0) {
        showToast('No hay nuevos conteos ingresados para guardar y ajustar.', 'info');
        setLoading(false);
        return;
      }

      const result = await guardarConteos(auditoriaActiva.id, itemsPayload);
      if (result.success) {
        showToast(result.message || 'Conteos guardados y ajustados en Alegra exitosamente.', 'success');
        // Refresh detail
        const updatedDetail = await getAuditoriaDetalle(auditoriaActiva.id);
        if (updatedDetail.success) {
          setAuditoriaActiva(updatedDetail.data);
          // Actualizar conteosDraft con los valores del servidor
          const draft = {};
          updatedDetail.data.items.forEach(item => {
            draft[item.id] = item.stock_real !== null ? item.stock_real : '';
          });
          setConteosDraft(draft);
        }
      }
    } catch (err) {
      console.error('Error guardando y ajustando inventario:', err);
      showToast(err.response?.data?.message || 'Error al guardar y ajustar el inventario.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Resync expired audit stocks from Alegra
  const handleResyncAuditoria = async () => {
    if (!auditoriaActiva) return;
    setLoading(true);
    setError(null);
    showToast('Re-sincronizando stocks de Alegra en vivo...', 'info');
    try {
      const result = await resyncAuditoria(auditoriaActiva.id);
      if (result.success) {
        showToast(result.message || 'Stocks sincronizados con éxito. Ya puede continuar con la auditoría.', 'success');
        // Refresh the detail to clear the expired flag
        const updatedDetail = await getAuditoriaDetalle(auditoriaActiva.id);
        if (updatedDetail.success) {
          setAuditoriaActiva(updatedDetail.data);
        }
      }
    } catch (err) {
      console.error('Error re-sincronizando auditoría:', err);
      showToast(err.response?.data?.message || 'Error al intentar re-sincronizar stocks.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Finalize audit
  const handleFinalize = async () => {
    if (!auditoriaActiva) return;

    // Check if there are empty counts
    const emptyCount = Object.values(conteosDraft).some(val => val === '');
    if (emptyCount) {
      const confirm = window.confirm('Hay productos sin conteo real. Se asumirá que coinciden con el stock de sistema. ¿Desea continuar?');
      if (!confirm) return;
    }

    setLoading(true);
    try {
      // First, save all current counts
      const itemsPayload = Object.entries(conteosDraft).map(([id, val]) => ({
        id: Number(id),
        stock_real: val !== '' ? Number(val) : null
      }));
      await guardarConteos(auditoriaActiva.id, itemsPayload);

      // Finalize
      const result = await finalizarAuditoria(auditoriaActiva.id, observacionesFinales);
      if (result.success) {
        showToast('Auditoría finalizada con éxito.', 'success');
        // Refresh details and dashboard list
        const updatedDetail = await getAuditoriaDetalle(auditoriaActiva.id);
        if (updatedDetail.success) {
          setAuditoriaActiva(updatedDetail.data);
        }
        const dashboardData = await getAuditorias();
        if (dashboardData.success) {
          setAuditorias(dashboardData.data);
        }
      }
    } catch (err) {
      console.error('Error finalizando auditoría:', err);
      showToast('Error al finalizar la auditoría.', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Send adjustments to Alegra API
  const handleApplyAlegraAdjustment = async () => {
    if (!auditoriaActiva) return;

    const confirm = window.confirm('Esto enviará una transacción de Ajuste de Inventario a Alegra y actualizará de forma irreversible el stock de los productos. ¿Está completamente seguro?');
    if (!confirm) return;

    setLoadingAjuste(true);
    setSuccessAjuste(null);
    setError(null);
    try {
      const result = await ajustarAlegra(auditoriaActiva.id);
      if (result.success) {
        setSuccessAjuste(result.message || 'Ajuste de inventario aplicado con éxito en Alegra.');
      }
    } catch (err) {
      console.error('Error enviando ajustes a Alegra:', err);
      setError(err.response?.data?.message || 'Error al aplicar ajustes en Alegra. Verifique los logs.');
    } finally {
      setLoadingAjuste(false);
    }
  };

  // Handle key digit/conteo changes
  const handleConteoChange = (itemId, val) => {
    setConteosDraft(prev => ({
      ...prev,
      [itemId]: val === '' ? '' : Number(val)
    }));
  };

  // Filter items in active audit
  const filteredItems = useMemo(() => {
    if (!auditoriaActiva || !auditoriaActiva.items) return [];

    return auditoriaActiva.items.filter(item => {
      // 1. Search text
      const searchMatch =
        item.nombre_producto.toLowerCase().includes(executionSearch.toLowerCase()) ||
        (item.referencia && item.referencia.toLowerCase().includes(executionSearch.toLowerCase()));

      if (!searchMatch) return false;

      // 2. Filter status
      const conteoReal = conteosDraft[item.id];
      const stockSistema = Number(item.stock_sistema);

      if (executionFilter === 'pendiente') {
        return conteoReal === '';
      }
      if (executionFilter === 'correcto') {
        return item.ajustado_alegra || (conteoReal !== '' && Number(conteoReal) === stockSistema);
      }
      if (executionFilter === 'descuadre') {
        return !item.ajustado_alegra && conteoReal !== '' && Number(conteoReal) !== stockSistema;
      }

      return true;
    });
  }, [auditoriaActiva, executionSearch, executionFilter, conteosDraft]);

  // Items count summaries
  const itemsStats = useMemo(() => {
    if (!auditoriaActiva || !auditoriaActiva.items) return { total: 0, pendientes: 0, correctos: 0, descuadres: 0 };

    let pendientes = 0;
    let correctos = 0;
    let descuadres = 0;

    auditoriaActiva.items.forEach(item => {
      const conteo = conteosDraft[item.id];
      const stockSistema = Number(item.stock_sistema);
      
      if (item.ajustado_alegra) {
        correctos++;
      } else if (conteo === '') {
        pendientes++;
      } else if (Number(conteo) === stockSistema) {
        correctos++;
      } else {
        descuadres++;
      }
    });

    return {
      total: auditoriaActiva.items.length,
      pendientes,
      correctos,
      descuadres
    };
  }, [auditoriaActiva, conteosDraft]);

  // Adjustments preview for finalization / Alegra
  const adjustmentsPreview = useMemo(() => {
    if (!auditoriaActiva || !auditoriaActiva.items) return [];
    return auditoriaActiva.items.filter(item => {
      const conteo = conteosDraft[item.id];
      return conteo !== '' && Number(conteo) !== Number(item.stock_sistema);
    }).map(item => {
      const conteoVal = Number(conteosDraft[item.id]);
      const diff = conteoVal - Number(item.stock_sistema);
      const costoVal = Number(item.costo_unitario || 0);
      return {
        id: item.id,
        nombre: item.nombre_producto,
        referencia: item.referencia,
        stock_sistema: item.stock_sistema,
        stock_real: conteoVal,
        diferencia: diff,
        costo_unitario: costoVal,
        impacto_dinero: diff * costoVal,
        ajustado_alegra: item.ajustado_alegra
      };
    });
  }, [auditoriaActiva, conteosDraft]);

  // Calculate live financial impact during execution (only for pending adjustments)
  const liveFinancialImpact = useMemo(() => {
    let sum = 0;
    Object.entries(conteosDraft).forEach(([itemId, val]) => {
      if (val === '') return;
      const item = auditoriaActiva?.items?.find(i => i.id === Number(itemId));
      if (!item || item.ajustado_alegra) return;
      const diff = Number(val) - Number(item.stock_sistema);
      sum += (diff * Number(item.costo_unitario || 0));
    });
    return sum;
  }, [conteosDraft, auditoriaActiva]);

  // Dashboard view
  if (!auditoriaActiva) {
    return (
      <div className="max-w-6xl mx-auto space-y-6 px-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight flex items-center gap-2">
              <Boxes className="text-emerald-600" size={32} />
              Auditoría de Inventarios
            </h1>
            <p className="text-gray-500 mt-1">
              Controla el inventario de la distribuidora mediante auditorías selectivas cíclicas de stock en tiempo real.
            </p>
          </div>
        </div>

        {/* Dashboard KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* KPI 1 */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-emerald-50 rounded-2xl text-emerald-600">
              <TrendingUp size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Precisión de Inventario</p>
              <h3 className="text-3xl font-extrabold text-gray-900 mt-1">
                {kpis.precision.toFixed(1)}%
              </h3>
            </div>
          </div>

          {/* KPI 2 */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
            <div className={`p-4 rounded-2xl ${kpis.descuadre >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
              <DollarSign size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Descuadre Acumulado</p>
              <h3 className={`text-3xl font-extrabold mt-1 ${kpis.descuadre >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(kpis.descuadre)}
              </h3>
            </div>
          </div>

          {/* KPI 3 */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-5">
            <div className="p-4 bg-gray-50 rounded-2xl text-gray-600">
              <Boxes size={28} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Auditorías Realizadas</p>
              <h3 className="text-3xl font-extrabold text-gray-900 mt-1">
                {kpis.total}
              </h3>
            </div>
          </div>
        </div>

        {/* Minimalist Control Panel or History */}
        {!showHistory ? (
          <div className="bg-white border border-gray-100 shadow-sm rounded-3xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-gray-900">Control de Existencias</h2>
              <p className="text-gray-500 text-sm">
                Inicia un conteo rápido de 50 productos, por categoría o productos críticos.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0 w-full md:w-auto">
              <button
                onClick={() => setShowNewModal(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-6 py-3.5 rounded-2xl shadow-md transition-all active:scale-95 text-center flex items-center justify-center gap-2"
              >
                <Plus size={20} />
                Nueva Auditoría
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 py-3.5 rounded-2xl transition-all active:scale-95 text-center flex items-center justify-center gap-2"
              >
                <Boxes size={18} />
                Ver Historial
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowHistory(false)}
                className="text-sm font-bold text-gray-500 hover:text-emerald-600 flex items-center gap-1.5 transition-colors"
              >
                <ArrowLeft size={16} />
                Volver a Auditoría
              </button>
              <h2 className="text-xl font-extrabold text-gray-900">Historial de Sesiones</h2>
            </div>

            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h2 className="text-xl font-bold text-gray-900">Historial de Sesiones</h2>
                <button
                  onClick={loadDashboard}
                  className="p-2 text-gray-400 hover:text-emerald-600 transition-colors"
                  title="Recargar"
                >
                  <RefreshCw size={18} className={loading ? 'animate-spin text-emerald-600' : ''} />
                </button>
              </div>

              {loading && auditorias.length === 0 ? (
                <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="animate-spin text-emerald-600" size={32} />
                  <span>Cargando historial de auditorías...</span>
                </div>
              ) : auditorias.length === 0 ? (
                <div className="p-12 text-center text-gray-400 flex flex-col items-center justify-center gap-4">
                  <Boxes size={48} className="text-gray-300" />
                  <div>
                    <p className="text-lg font-bold text-gray-700">No hay auditorías registradas</p>
                    <p className="text-sm text-gray-500 mt-1">Presiona "Nueva Auditoría" para comenzar tu primer conteo de stock.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Mobile Card List */}
                  <div className="block sm:hidden divide-y divide-gray-100">
                    {auditorias.map((audit) => (
                      <div
                        key={audit.id}
                        onClick={() => handleSelectAuditoria(audit.id)}
                        className="p-4 active:bg-gray-50 cursor-pointer flex flex-col gap-2"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-gray-900">{audit.nombre}</h4>
                            <p className="text-xs text-gray-400">
                              {formatDate(audit.fecha_creacion)} • <span className="capitalize">{audit.tipo}</span>
                            </p>
                          </div>
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            audit.estado === 'finalizado'
                              ? 'bg-green-50 text-green-700 border border-green-150'
                              : 'bg-yellow-50 text-yellow-700 border border-yellow-150'
                          }`}>
                            {audit.estado === 'finalizado' ? 'Finalizada' : 'En Progreso'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs pt-1">
                          {audit.estado === 'finalizado' ? (
                            <div className="flex gap-4">
                              <span>
                                Precisión: <strong className="text-gray-800">{Number(audit.precision_porcentaje).toFixed(1)}%</strong>
                              </span>
                              <span>
                                Descuadre: <span className={`font-extrabold ${Number(audit.descuadre_dinero) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                                  {formatCurrency(audit.descuadre_dinero)}
                                </span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Conteo en curso</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100">
                          <th className="px-6 py-4">Nombre / Sesión</th>
                          <th className="px-6 py-4">Tipo</th>
                          <th className="px-6 py-4">Fecha</th>
                          <th className="px-6 py-4">Estado</th>
                          <th className="px-6 py-4 text-right">Precisión</th>
                          <th className="px-6 py-4 text-right">Descuadre</th>
                          <th className="px-6 py-4"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-sm">
                        {auditorias.map((audit) => (
                          <tr
                            key={audit.id}
                            className="hover:bg-gray-50/70 transition-colors cursor-pointer group"
                            onClick={() => handleSelectAuditoria(audit.id)}
                          >
                            <td className="px-6 py-4">
                              <p className="font-bold text-gray-900 group-hover:text-emerald-700 transition-colors">{audit.nombre}</p>
                              {audit.categoria && (
                                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full mt-1 inline-block">
                                  {audit.categoria}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 capitalize text-gray-600 font-medium">
                              {audit.tipo === 'random' ? 'Aleatoria 50' : audit.tipo === 'categoria' ? 'Categoría' : 'Crítica'}
                            </td>
                            <td className="px-6 py-4 text-gray-500">
                              {formatDate(audit.fecha_creacion)}
                            </td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1 font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider ${
                                audit.estado === 'finalizado'
                                  ? 'bg-green-50 text-green-700 border border-green-150'
                                  : 'bg-yellow-50 text-yellow-700 border border-yellow-150'
                              }`}>
                                {audit.estado === 'finalizado' ? 'Finalizada' : 'En Progreso'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right font-extrabold text-gray-900">
                              {audit.estado === 'finalizado' ? `${Number(audit.precision_porcentaje).toFixed(1)}%` : '—'}
                            </td>
                            <td className={`px-6 py-4 text-right font-extrabold ${
                              audit.estado !== 'finalizado'
                                ? 'text-gray-400'
                                : Number(audit.descuadre_dinero) >= 0
                                  ? 'text-blue-600'
                                  : 'text-red-600'
                            }`}>
                              {audit.estado === 'finalizado' ? formatCurrency(audit.descuadre_dinero) : '—'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <ChevronRight className="text-gray-400 group-hover:text-emerald-600 transition-colors inline-block" size={20} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Modal: New Audit */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowNewModal(false)} />

            <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-6 transform transition-all border border-gray-150">
              <div className="flex items-center justify-between border-b pb-3">
                <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Play className="text-emerald-600 fill-emerald-600" size={20} />
                  Nueva Auditoría
                </h3>
                <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleCreateAudit} className="space-y-4">
                {/* Nombre de la sesión */}
                <div>
                  <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Nombre (Opcional)</label>
                  <input
                    type="text"
                    value={newAuditNombre}
                    onChange={(e) => setNewAuditNombre(e.target.value)}
                    className="input w-full py-2.5 px-3 border-2 border-gray-300 focus:border-emerald-500 rounded-xl text-base"
                  />
                </div>

                {/* Tipo de Auditoría */}
                <div>
                  <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-2">Estrategia de Selección</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setNewAuditTipo('random')}
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 justify-center transition-all ${newAuditTipo === 'random'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wide">Random 50</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewAuditTipo('categoria')}
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 justify-center transition-all ${newAuditTipo === 'categoria'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wide">Categoría</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewAuditTipo('critico')}
                      className={`p-3 rounded-2xl border-2 flex flex-col items-center gap-1.5 justify-center transition-all ${newAuditTipo === 'critico'
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                          : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                    >
                      <span className="text-xs font-bold uppercase tracking-wide">Críticos 30</span>
                    </button>
                  </div>
                </div>

                {/* Category selector (condicional) */}
                {newAuditTipo === 'categoria' && (
                  <div>
                    <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Seleccionar Categoría</label>
                    <select
                      value={newAuditCategoria}
                      onChange={(e) => setNewAuditCategoria(e.target.value)}
                      className="select w-full py-2.5 px-3 border-2 border-gray-300 focus:border-emerald-500 rounded-xl text-base bg-white"
                    >
                      {categorias.map((cat, idx) => (
                        <option key={idx} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Info Note */}
                <div className="bg-emerald-50 text-emerald-900 border border-emerald-150 p-3.5 rounded-2xl text-xs leading-relaxed flex items-start gap-2.5">
                  <Info size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                  <p>
                    {newAuditTipo === 'random' && 'El sistema elegirá al azar 50 productos activos de la distribuidora para auditar su existencia.'}
                    {newAuditTipo === 'categoria' && 'Se auditarán todos los productos clasificados bajo la categoría seleccionada.'}
                    {newAuditTipo === 'critico' && 'Se auditarán los 30 productos que tienen mayor cantidad de incidencias de faltantes reportados históricamente.'}
                  </p>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <RefreshCw className="animate-spin" size={20} /> : <Play size={20} fill="white" />}
                  {loading ? 'Inicializando...' : 'Iniciar Sesión'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Active Audit Screen
  const esActiva = auditoriaActiva.estado === 'en_progreso';

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-4 pb-28 sm:pb-20">
      {/* Header back button */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            setAuditoriaActiva(null);
            loadDashboard();
          }}
          className="flex items-center gap-2 text-gray-500 hover:text-emerald-600 font-bold transition-colors"
        >
          <ArrowLeft size={20} />
          Volver a auditorías
        </button>
        <span className={`inline-flex items-center gap-1 font-bold text-xs px-3 py-1 rounded-full uppercase tracking-wider ${esActiva ? 'bg-yellow-50 text-yellow-700 border border-yellow-150' : 'bg-green-50 text-green-700 border border-green-150'}`}>
          {esActiva ? 'En Progreso' : 'Finalizada'}
        </span>
      </div>

      {auditoriaActiva.expirada ? (
        <div className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-gray-100 shadow-lg text-center space-y-6 mt-12">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 mx-auto">
            <AlertTriangle size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-gray-950">Auditoría Expirada</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Esta sesión de auditoría fue creada hace más de 24 horas y no fue finalizada. Los stocks en Alegra pueden estar desactualizados.
            </p>
            <p className="text-xs text-amber-600 font-bold bg-amber-50 py-2 px-3 rounded-xl inline-block mt-2">
              Debe volver a sincronizar la auditoría con los stocks actuales para poder acceder.
            </p>
          </div>
          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={handleResyncAuditoria}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 px-6 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95 disabled:bg-emerald-400"
            >
              {loading ? <RefreshCw className="animate-spin" size={20} /> : <RefreshCw size={20} />}
              Re-sincronizar Stocks de Alegra
            </button>
            <button
              onClick={() => {
                setAuditoriaActiva(null);
                loadDashboard();
              }}
              className="w-full bg-white hover:bg-gray-50 text-gray-700 font-bold border border-gray-200 py-3 px-6 rounded-2xl transition-all active:scale-95"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Audit Identity Card */}
          <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">{auditoriaActiva.nombre}</h1>
          <p className="text-sm text-gray-500 flex items-center gap-3">
            <span>Tipo: <strong className="text-gray-700 capitalize">{auditoriaActiva.tipo === 'random' ? 'Aleatoria 50' : auditoriaActiva.tipo === 'categoria' ? 'Categoría' : 'Crítica'}</strong></span>
            <span>•</span>
            <span>Creada: <strong className="text-gray-700">{formatDate(auditoriaActiva.fecha_creacion)}</strong></span>
          </p>
        </div>

        {!esActiva && (
          <div className="flex flex-wrap items-center gap-6 border-t md:border-t-0 pt-4 md:pt-0">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Precisión</p>
              <h4 className="text-2xl font-extrabold text-gray-900">{Number(auditoriaActiva.precision_porcentaje).toFixed(1)}%</h4>
            </div>
            <div className="border-l pl-6">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Descuadre Monetario</p>
              <h4 className={`text-2xl font-extrabold ${Number(auditoriaActiva.descuadre_dinero) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(auditoriaActiva.descuadre_dinero)}
              </h4>
            </div>
          </div>
        )}
      </div>

      {/* Execution filters */}
      {esActiva ? (
        <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
          {/* Search bar */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-gray-400">
              <Search size={18} />
            </span>
            <input
              type="text"
              value={executionSearch}
              onChange={(e) => setExecutionSearch(e.target.value)}
              placeholder="Buscar producto por nombre o referencia..."
              className="input w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 focus:border-emerald-500 rounded-xl text-base"
            />
          </div>

          {/* Status filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setExecutionFilter('todos')}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${executionFilter === 'todos'
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
            >
              Todos ({itemsStats.total})
            </button>
            <button
              onClick={() => setExecutionFilter('pendiente')}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${executionFilter === 'pendiente'
                  ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
            >
              Pendientes ({itemsStats.pendientes})
            </button>
            <button
              onClick={() => setExecutionFilter('correcto')}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${executionFilter === 'correcto'
                  ? 'bg-green-600 border-green-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
            >
              Coincide ({itemsStats.correctos})
            </button>
            <button
              onClick={() => setExecutionFilter('descuadre')}
              className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all ${executionFilter === 'descuadre'
                  ? 'bg-red-600 border-red-600 text-white shadow-sm'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
            >
              Descuadre ({itemsStats.descuadres})
            </button>
          </div>
        </div>
      ) : null}

      {/* Main Grid: Products execution or report details */}
      {esActiva ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Left / Middle: Products counting sheet */}
          <div className="md:col-span-2 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Hoja de Conteo Físico ({filteredItems.length} mostrados)</h3>

            {filteredItems.length === 0 ? (
              <div className="bg-white p-12 text-center text-gray-400 rounded-3xl border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-3">
                <Search size={32} className="text-gray-300" />
                <span>No se encontraron productos con los filtros aplicados.</span>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map(item => {
                  const conteoRaw = conteosDraft[item.id];
                    // Compute state classes
                  let cardBorder = 'border-gray-100 hover:border-gray-200';
                  let badge = <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2 py-0.5 rounded-md uppercase">Pendiente</span>;
                  let financialNode = null;

                  if (item.ajustado_alegra) {
                    const realVal = item.stock_real !== null ? Number(item.stock_real) : stockSis;
                    const diff = realVal - stockSis;
                    cardBorder = 'border-emerald-300 bg-emerald-50/10';
                    badge = <span className="bg-emerald-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase">Ajustado ({diff > 0 ? '+' : ''}{diff})</span>;
                    financialNode = <span className="text-xs font-extrabold text-emerald-600 shrink-0">Sincronizado</span>;
                  } else if (conteoRaw !== '') {
                    const diff = Number(conteoRaw) - stockSis;
                    const diffCost = diff * Number(item.costo_unitario || 0);

                    if (diff === 0) {
                      cardBorder = 'border-green-300 bg-green-50/20';
                      badge = <span className="bg-green-150 text-green-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Coincide</span>;
                    } else if (diff < 0) {
                      cardBorder = 'border-red-300 bg-red-50/20';
                      badge = <span className="bg-red-150 text-red-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Falta ({diff})</span>;
                      financialNode = <span className="text-xs font-bold text-red-600 shrink-0">{formatCurrency(diffCost)}</span>;
                    } else {
                      cardBorder = 'border-blue-300 bg-blue-50/20';
                      badge = <span className="bg-blue-150 text-blue-700 text-xs font-extrabold px-2.5 py-0.5 rounded-md uppercase">Sobra (+{diff})</span>;
                      financialNode = <span className="text-xs font-bold text-blue-600 shrink-0">+{formatCurrency(diffCost)}</span>;
                    }
                  }

                   return (
                     <div key={item.id} className={`bg-white p-4 rounded-3xl border shadow-sm transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${cardBorder}`}>
                       <div className="space-y-1 min-w-0 flex-1">
                         <div className="flex flex-wrap items-center gap-2">
                           <h4 className="font-bold text-gray-900 leading-snug">{item.nombre_producto}</h4>
                           {badge}
                         </div>
                         <p className="text-xs text-gray-400">
                           Ref: <strong className="text-gray-600 font-semibold">{item.referencia || 'N/A'}</strong>
                           {item.category && ` • Cat: ${item.category}`}
                         </p>
                       </div>
 
                       {/* Stock Comparison area */}
                       <div className="flex items-center justify-between sm:justify-end gap-3 mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-150 shrink-0 w-full sm:w-auto">
                         {/* Cost impact */}
                         <div className="flex items-center">
                           {financialNode}
                         </div>
 
                         <div className="flex items-center gap-3">
                           {/* Expected stock */}
                           <div className="text-center bg-gray-50 px-3 py-1.5 rounded-2xl border border-gray-150 min-w-[70px]">
                             <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block">Sistema</span>
                             <span className="text-sm font-extrabold text-gray-700">{stockSis}</span>
                           </div>
 
                           {/* Input stock real */}
                           <div className="text-center min-w-[90px]">
                             <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 block mb-0.5">Conteo Real</span>
                             <input
                               type="number"
                               value={conteoRaw}
                               min="0"
                               disabled={item.ajustado_alegra}
                               onChange={(e) => handleConteoChange(item.id, e.target.value)}
                               placeholder="Cantidad"
                               className="w-20 text-center py-1 px-2 border-2 border-gray-300 focus:border-emerald-500 rounded-xl font-extrabold text-sm focus:outline-none bg-white disabled:bg-gray-100 disabled:text-gray-500"
                             />
                           </div>
                         </div>
                       </div>
                     </div>
                   );
                 })}
              </div>
            )}
          </div>

          {/* Right: Auditor summary action pane */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5 sticky top-6">
              <h3 className="text-lg font-bold text-gray-900 border-b pb-2 flex items-center gap-1.5">
                <CheckSquare className="text-emerald-600" size={18} />
                Progreso del Conteo
              </h3>

              {/* Progress bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-gray-500">
                  <span>Productos digitados</span>
                  <span>{itemsStats.total - itemsStats.pendientes} / {itemsStats.total}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${((itemsStats.total - itemsStats.pendientes) / itemsStats.total) * 100}%` }}
                  />
                </div>
              </div>

              {/* Stats detail list */}
              <div className="divide-y divide-gray-100 text-sm">
                <div className="py-2.5 flex justify-between">
                  <span className="text-gray-500 font-medium">Coinciden con sistema:</span>
                  <span className="font-extrabold text-green-600">{itemsStats.correctos}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-gray-500 font-medium">Con descuadre (Diferencia):</span>
                  <span className="font-extrabold text-red-600">{itemsStats.descuadres}</span>
                </div>
                <div className="py-2.5 flex justify-between">
                  <span className="text-gray-500 font-medium">Conteo pendiente:</span>
                  <span className="font-extrabold text-gray-500">{itemsStats.pendientes}</span>
                </div>
                <div className="py-2.5 flex justify-between border-t-2 font-bold text-base pt-3">
                  <span>Impacto financiero:</span>
                  <span className={liveFinancialImpact >= 0 ? 'text-blue-600' : 'text-red-600'}>
                    {formatCurrency(liveFinancialImpact)}
                  </span>
                </div>
              </div>

              {/* Observaciones textarea */}
              <div className="space-y-1">
                <label className="label text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">Notas de la Auditoría</label>
                <textarea
                  value={observacionesFinales}
                  onChange={(e) => setObservacionesFinales(e.target.value)}
                  placeholder="Ingrese observaciones sobre roturas, mercadería vencida, etc."
                  rows="3"
                  className="input w-full resize-none py-2 px-3 border-2 border-gray-300 focus:border-emerald-500 rounded-xl text-sm"
                />
              </div>

              {/* Actions */}
              <div className="space-y-2 pt-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <Save size={18} />
                  Guardar y Ajustar
                </button>
                <button
                  onClick={handleFinalize}
                  disabled={loading}
                  className="w-full bg-gray-800 hover:bg-gray-900 text-white font-bold py-3 rounded-2xl shadow-sm transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <CheckCircle size={18} />
                  Finalizar Auditoría
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Finalized Audit / Report Screen */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {/* Main Left: Audit details & list of adjustments made */}
          <div className="md:col-span-2 space-y-6">
            {/* Final state info alert */}
            <div className="bg-green-50 text-green-950 border border-green-200 p-5 rounded-3xl flex items-start gap-4">
              <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={28} />
              <div className="space-y-1.5 text-sm">
                <h4 className="font-extrabold text-green-900 text-base">Auditoría Cerrada Exitosamente</h4>
                <p>
                  El conteo físico de stock concluyó el <strong>{formatDate(auditoriaActiva.fecha_finalizacion)}</strong> con un porcentaje de precisión de <strong>{Number(auditoriaActiva.precision_porcentaje).toFixed(1)}%</strong>.
                </p>
                {auditoriaActiva.observaciones && (
                  <p className="italic bg-white/50 p-2.5 rounded-xl border border-green-150 text-xs text-green-800 mt-2 block">
                    Observaciones: "{auditoriaActiva.observaciones}"
                  </p>
                )}
              </div>
            </div>

            {/* List of differences / adjustments preview */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <AlertTriangle className="text-red-500" size={18} />
                  Detalle de Ajustes Requeridos ({adjustmentsPreview.length} discrepancias)
                </h3>
              </div>

              {adjustmentsPreview.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  <CheckCircle size={36} className="text-green-500 mx-auto mb-2" />
                  <p className="font-bold text-gray-700">¡Perfecto! No se encontraron discrepancias</p>
                  <p className="text-xs text-gray-500 mt-0.5">El conteo físico de todos los productos coincidió 100% con el sistema.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 text-sm">
                  {adjustmentsPreview.map((adj, idx) => (
                    <div key={idx} className="p-4 flex items-center justify-between gap-4">
                      <div className="space-y-0.5">
                        <p className="font-bold text-gray-900">{adj.nombre}</p>
                        <p className="text-xs text-gray-400">
                          Ref: <strong className="text-gray-600 font-semibold">{adj.referencia || 'N/A'}</strong>
                          {adj.costo_unitario > 0 && ` • Costo: ${formatCurrency(adj.costo_unitario)}`}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`inline-block font-extrabold text-xs px-2.5 py-0.5 rounded-md uppercase ${adj.diferencia > 0 ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                          }`}>
                          {adj.diferencia > 0 ? `+${adj.diferencia}` : adj.diferencia} unid.
                        </span>
                        <p className={`text-xs font-bold mt-1 ${adj.diferencia > 0 ? 'text-blue-600' : 'text-red-600'
                          }`}>
                          {adj.diferencia > 0 ? '+' : ''}{formatCurrency(adj.impacto_dinero)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: Corrective actions */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
              <h3 className="text-lg font-bold text-gray-900 border-b pb-2 flex items-center gap-1.5">
                <CheckCircle className="text-emerald-600" size={18} />
                Acción Correctiva
              </h3>

              <p className="text-xs text-gray-500 leading-relaxed">
                Una vez auditado el stock, es fundamental corregir los descuadres en el inventario oficial de Alegra para que coincidan con la existencia física real de la distribuidora.
              </p>

              {/* Success adjustment message */}
              {successAjuste && (
                <div className="bg-blue-50 text-blue-900 border border-blue-200 p-4 rounded-2xl text-xs flex items-start gap-2">
                  <CheckCircle className="text-blue-600 shrink-0 mt-0.5" size={16} />
                  <span>{successAjuste}</span>
                </div>
              )}

              {/* Error feedback */}
              {error && (
                <div className="bg-red-50 text-red-950 border border-red-200 p-4 rounded-2xl text-xs flex items-start gap-2">
                  <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={16} />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handleApplyAlegraAdjustment}
                disabled={loadingAjuste || adjustmentsPreview.length === 0}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-150 disabled:text-gray-400 text-white font-extrabold py-3.5 px-4 rounded-2xl shadow-md transition-all flex items-center justify-center gap-2 active:scale-95"
              >
                {loadingAjuste ? <RefreshCw className="animate-spin" size={18} /> : <CheckCircle size={18} />}
                {loadingAjuste ? 'Sincronizando...' : 'Ajustar Inventario en Alegra'}
              </button>

              {adjustmentsPreview.length === 0 && (
                <p className="text-[10px] text-gray-400 text-center">
                  * No se requieren ajustes ya que no hay discrepancias.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Floating Action Summary Bar (Sticky at the bottom of the viewport) */}
      {esActiva && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-3.5 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:hidden flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
              Conteo: {itemsStats.total - itemsStats.pendientes}/{itemsStats.total}
            </p>
            <p className={`text-xs font-extrabold ${liveFinancialImpact >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {formatCurrency(liveFinancialImpact)}
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleSaveDraft}
              disabled={loading}
              className="bg-emerald-600 text-white active:bg-emerald-700 font-extrabold px-4 py-2.5 rounded-xl shadow flex items-center gap-1.5 text-sm"
              title="Guardar y Sincronizar"
            >
              <Save size={18} />
              Guardar
            </button>
            <button
              onClick={handleFinalize}
              disabled={loading}
              className="bg-gray-800 text-white active:bg-gray-900 font-bold px-4 py-2.5 rounded-xl shadow flex items-center gap-1.5 text-sm"
            >
              <CheckCircle size={18} />
              Finalizar
            </button>
          </div>
        </div>
      )}
      </>
      )}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
