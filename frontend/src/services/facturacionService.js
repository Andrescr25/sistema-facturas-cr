/**
 * 🧾 Servicio de Facturación
 * 
 * Maneja la lógica de facturación con soporte offline:
 * - Facturación contra el backend propio
 * - Cache de productos y clientes en IndexedDB
 * - Creación de facturas offline
 * - Sincronización automática cuando hay conexión
 */

import api, { TOKEN_KEY } from './api';
import indexedDBService from './indexedDBService'
import { nuevaClaveFactura } from './dispositivo';
import { facturaEscrita, facturaConsultada, combinarCopiaFactura, ordenDeLlegada } from '../utils/facturasLocales';
import { hoyEnCostaRica } from '../utils/fechaCR';

// Lo que se le dice a quien intenta editar una factura que no está marcada
// como propia (ver `editarFactura`).
const EDICION_DE_COPIA_VIEJA =
  'Esta factura viene de una copia vieja guardada en la tablet, de cuando las facturas ' +
  'estaban en Alegra. Actualizá la lista de facturas y abrila de nuevo para editarla.';

/**
 * Solo lo que guardó el sistema propio.
 *
 * El sistema anterior dejó en este dispositivo productos y clientes con el id
 * de ALEGRA en `id`; los del sistema propio llevan además su id en
 * `productoId` / `clienteId`. Una fila sin ese campo es del catálogo viejo y
 * NO se puede facturar con ella: su `id` es el id propio de OTRO producto u
 * otro cliente (2026-10-10, producción: se eligió un cliente y la factura
 * salió a nombre de otro). Al dejarlas afuera, la pantalla ve el catálogo
 * vacío y lo descarga de nuevo, que es justo lo que hace falta.
 */
const soloPropios = (lista, campo) => (lista || []).filter(fila => fila && fila[campo] != null);

class FacturacionService {
  async copiaFacturaConfirmada(fila, copia = null) {
    // Una clave antigua puede reconocer una factura aún no copiada. Su
    // cola sigue pendiente hasta tener un id propio que permita abrirla.
    if (!fila?.id) throw new Error(fila?.mensaje || 'El servidor no devolvió el id propio de la factura. La copia sigue pendiente.');
    const anterior = await indexedDBService.getFacturaById(fila.id).catch(() => null);
    // Al pasar de local-UUID al id definitivo se conserva la fotografía,
    // sin cambiar el cuerpo ni la clave del envío. El dato del servidor
    // prevalece, incluso cuando confirma explícitamente Sin ciclo.
    const base = combinarCopiaFactura(copia, { ...anterior, id: fila.id });
    return { ...combinarCopiaFactura(base, facturaEscrita(fila)),
      estado: fila.estado || anterior?.estado || 'emitida',
      pendienteSincronizar: false, pendienteEdicion: false, esLocal: false };
  }

  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    // Quién quiere enterarse cuando una sincronización termina (la pantalla).
    this.oyentesSincronizacion = new Set();
    
    // Escuchar cambios de conexión
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
  }

  /**
   * Inicializar servicio (cargar cache si existe)
   */
  async init() {
    try {
      await indexedDBService.init();
      console.log('✅ Servicio de facturación inicializado');
      
      // Verificar y limpiar cache corrupto
      const cacheLimpiado = await this.verificarYLimpiarCacheCorrupto();
      if (cacheLimpiado) {
        console.log('🔄 Cache limpiado. Se recargará automáticamente.');
      }
      
      // Si está online, intentar sincronizar facturas pendientes
      if (this.isOnline) {
        await this.sincronizarFacturasPendientes();
        await this.sincronizarEdicionesPendientes();
      }
      
      return true;
    } catch (error) {
      console.error('❌ Error inicializando servicio de facturación:', error);
      throw error;
    }
  }

  /**
   * Verificar y limpiar cache corrupto (reference como objeto)
   */
  async verificarYLimpiarCacheCorrupto() {
    try {
      const productos = await indexedDBService.getProductos();
      
      if (productos.length > 0) {
        // Verificar si el primer producto tiene reference como objeto
        const primerProducto = productos[0];
        if (typeof primerProducto.reference === 'object' && primerProducto.reference !== null) {
          console.warn('⚠️ Cache corrupto detectado (reference como objeto). Limpiando...');
          // El catálogo se puede descargar otra vez; una venta pendiente y
          // su clave no. Reparar productos nunca borra las colas ni la copia.
          await indexedDBService.clearProductosCache();
          return true; // Cache limpiado
        }
      }
      
      return false; // Cache OK
    } catch (error) {
      console.error('❌ Error verificando cache:', error);
      return false;
    }
  }

  /**
   * Actualizar cache de productos propios
   */
  /**
   * Actualizar cache de productos desde NUESTRO maestro.
   *
   * Se traduce a la forma que ya usa la pantalla (`name`, `price`, `tax`) y se
   * guarda además `productoId`: es el id que viaja en la factura. Mandar el de
   * Alegra ataría cada venta a una columna que queremos poder dejar vacía.
   */
  async actualizarCacheProductos() {
    try {
      console.log('📦 Actualizando cache de productos desde el maestro propio...');
      await this.verificarYLimpiarCacheCorrupto();

      // El maestro se pide por páginas. El servidor corta en 100 por página
      // aunque se le pidan 500, así que el tope de vueltas se calcula sobre
      // ESO: con 20 vueltas se cargaban 2.000 de 2.025 y los últimos 25
      // productos no aparecían al facturar. Un catálogo incompleto no da
      // error, solo un producto que "no existe" cuando alguien lo busca.
      const productos = [];
      let pagina = 1;
      let paginas = 1;
      const MAXIMO_VUELTAS = 200;
      do {
        // /catalogos y no /maestro: /maestro es de Gestión de Catálogo, y un
        // cajero con solo Facturación recibía 403 — la pantalla se quedaba sin
        // productos. /catalogos es la lectura compartida de lo activo.
        const response = await api.get('/catalogos/productos', { params: { pagina, limite: 100 } });
        productos.push(...(response.data?.data ?? []));
        paginas = response.data?.paginacion?.paginas ?? 1;
        pagina += 1;
      } while (pagina <= paginas && pagina <= MAXIMO_VUELTAS);

      if (paginas > MAXIMO_VUELTAS) {
        console.warn(`⚠️ El maestro tiene ${paginas} páginas y se leyeron ${MAXIMO_VUELTAS}: faltan productos en el cache.`);
      }

      const normalizados = productos.map(p => ({
        id: p.id,
        productoId: p.id,
        alegraId: p.alegra_id || null,
        name: p.nombre,
        description: p.descripcion || '',
        // Texto siempre: la referencia "0005" pierde los ceros como número.
        reference: String(p.referencia ?? '').trim(),
        price: Number(p.precio_sin_iva) || 0,
        // La lectura compartida trae solo activos y sin el campo `activo`.
        status: p.activo === false ? 'inactive' : 'active',
        type: 'product',
        // La tarifa viene del maestro, que es la que el servidor va a cobrar.
        // Así el cajero ve el mismo impuesto que va a salir impreso.
        tax: p.impuesto_id ? [{ id: p.impuesto_id, percentage: Number(p.tarifa) || 0 }] : [],
        category: p.categoria ? { name: p.categoria } : null,
        inventory: null,
        cabys: p.cabys || null,
        unidad: p.unidad || null
      }));

      await indexedDBService.saveProductos(normalizados);
      return { success: true, total: normalizados.length, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('❌ Error actualizando cache de productos:', error);
      throw error;
    }
  }

  /**
   * Actualizar cache de clientes desde Alegra
   */
  /**
   * Actualizar cache de clientes desde NUESTRA tabla.
   */
  async actualizarCacheClientes() {
    try {
      console.log('👥 Actualizando cache de clientes desde la base propia...');

      const clientes = [];
      let pagina = 1;
      let paginas = 1;
      const MAXIMO_VUELTAS = 200;
      do {
        // /catalogos y no /clientes: /clientes es del módulo Clientes (mismo
        // 403 que con los productos para quien solo tiene Facturación).
        const response = await api.get('/catalogos/clientes', { params: { pagina, limite: 100 } });
        clientes.push(...(response.data?.data ?? []));
        paginas = response.data?.paginacion?.paginas ?? 1;
        pagina += 1;
      } while (pagina <= paginas && pagina <= MAXIMO_VUELTAS);

      const normalizados = clientes.map(c => ({
        id: c.id,
        clienteId: c.id,
        alegraId: c.alegra_id || null,
        name: c.nombre,
        identification: c.identificacion,
        email: c.correo || '',
        // Los teléfonos de las fichas vienen sucios ("89350207 JEISON"): se
        // guardan como están y quien los use decide, igual que siempre.
        phonePrimary: c.telefono || '',
        mobile: c.celular || '',
        plazoCreditoId: c.plazo_credito_id || null, descuentoGlobal: Number(c.descuento_global) || 0,
        ciclos: c.ciclos || [],
        status: c.activo === false ? 'inactive' : 'active'
      }));

      await indexedDBService.saveClientes(normalizados);
      console.log(`✅ ${normalizados.length} clientes guardados en cache`);
      return { success: true, total: normalizados.length, timestamp: new Date().toISOString() };
    } catch (error) {
      console.error('❌ Error actualizando cache de clientes:', error);
      throw error;
    }
  }

  /**
   * Actualizar todo el cache (productos + contactos)
   */
  async actualizarTodoCache() {
    try {
      console.log('🔄 Actualizando todo el cache (productos + contactos + facturas)...');

      const [productos, clientes, facturas] = await Promise.all([
        this.actualizarCacheProductos(),
        this.actualizarCacheClientes(),
        this.precargarUltimasFacturas()
      ]);

      console.log(`✅ Cache actualizado: ${productos.total} productos, ${clientes.total} contactos, ${facturas.total} facturas`);

      return {
        success: true,
        productos: productos.total,
        clientes: clientes.total,
        facturas: facturas.total,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Error actualizando cache completo:', error);
      throw error;
    }
  }

  /**
   * Precargar las últimas 60 facturas para edición offline
   */
  async precargarUltimasFacturas() {
    try {
      if (!this.isOnline) {
        console.log('⚠️ Sin conexión, no se pueden precargar facturas');
        return { success: false, total: 0 };
      }

      // De la base propia, no de Alegra: son las mismas facturas y no hay que
      // salir a la red a buscarlas.
      const response = await api.get('/facturacion/facturas', {
        params: { estado: 'todas', limite: 60, pagina: 1 }
      });
      const facturas = (response.data?.data ?? []).map(facturaConsultada);

      if (facturas.length > 0) {
        const guardadas = await indexedDBService.saveFacturasCache(facturas);
        console.log(`✅ ${guardadas} facturas precargadas para edición offline`);
        return { success: true, total: guardadas };
      }
      return { success: true, total: 0 };
    } catch (error) {
      console.error('❌ Error precargando facturas:', error);
      // No se lanza: que falle la precarga no debe frenar el resto del cache.
      return { success: false, total: 0, error: error.message };
    }
  }

  /**
   * Obtener productos (desde cache)
   */
  async getProductos() {
    try {
      const productos = await indexedDBService.getProductos();
      return soloPropios(productos, 'productoId');
    } catch (error) {
      console.error('❌ Error obteniendo productos del cache:', error);
      throw error;
    }
  }

  /**
   * Buscar producto por referencia/código
   */
  async buscarProductoPorCodigo(codigo) {
    try {
      console.log(`🔍 Buscando producto con código: "${codigo}"`);
      const encontrado = await indexedDBService.getProductoByReference(codigo);
      const producto = soloPropios(encontrado ? [encontrado] : [], 'productoId')[0] || null;
      
      if (producto) {
        console.log(`✅ Producto encontrado: ${producto.name} (ref: "${producto.reference}")`);
      } else {
        console.log(`❌ Producto no encontrado con referencia: "${codigo}"`);
      }
      
      return producto;
    } catch (error) {
      console.error('❌ Error buscando producto:', error);
      throw error;
    }
  }

  /**
   * Buscar productos por nombre
   */
  async buscarProductosPorNombre(nombre) {
    try {
      const productos = await indexedDBService.searchProductosByName(nombre);
      return soloPropios(productos, 'productoId');
    } catch (error) {
      console.error('❌ Error buscando productos por nombre:', error);
      throw error;
    }
  }

  /**
   * Obtener clientes (desde cache)
   */
  async getClientes() {
    try {
      const clientes = await indexedDBService.getClientes();
      return soloPropios(clientes, 'clienteId');
    } catch (error) {
      console.error('❌ Error obteniendo clientes del cache:', error);
      throw error;
    }
  }

  /**
   * Buscar clientes por nombre
   */
  async buscarClientesPorNombre(nombre) {
    try {
      const clientes = await indexedDBService.searchClientesByName(nombre);
      return soloPropios(clientes, 'clienteId');
    } catch (error) {
      console.error('❌ Error buscando clientes:', error);
      throw error;
    }
  }

  /**
   * Los impuestos, de NUESTRO catálogo.
   *
   * Importa que salgan de acá y no de una lista escrita a mano: el servidor
   * cobra la tarifa del maestro, y si la pantalla mostrara otra, el cajero
   * vería 13 % en un producto al 1 % y el papel saldría distinto de lo que vio.
   */
  async getImpuestos() {
    const response = await api.get('/catalogos/configuracion');
    const impuestos = response.data?.data?.impuestos ?? response.data?.impuestos ?? [];
    return impuestos
      .filter(i => i.activo)
      .map(i => ({ id: i.id, name: i.nombre, percentage: Number(i.tarifa) || 0, type: i.tipo }));
  }

  /** Los métodos de pago, de NUESTRO catálogo (incluye SINPE Móvil). */
  async getMetodosPago() {
    const response = await api.get('/catalogos/configuracion');
    const metodos = response.data?.data?.metodosPago ?? response.data?.metodosPago ?? [];
    // El `id` es el NUMÉRICO de nuestra tabla, que es lo que el servidor usa
    // para registrar el cobro. Mandarle la clave de texto ("sinpe_movil"),
    // imitando la forma de Alegra, revienta con "invalid input syntax for
    // type integer". La clave se conserva aparte, que es de donde sale el
    // icono de cada método.
    return metodos
      .filter(m => m.activo)
      .map(m => ({
        id: m.id,
        clave: m.clave,
        name: m.nombre,
        type: m.clave,
        pideReferencia: m.pide_referencia
      }));
  }

  /**
   * Crear factura
   * Si hay internet: envía directamente al servidor propio
   * Si no hay internet: guarda localmente y sincroniza después
   */
  /**
   * Por qué falló, dicho para quien está en la caja.
   *
   * El servidor manda el motivo en `message`. Se siguen
   * mirando los otros lugares porque las respuestas viejas los usaban, y
   * `error.message` queda de último: es el de axios ("Request failed with
   * status code 400"), que no le dice nada a nadie.
   */
  motivoDelFallo(error) {
    return error?.response?.data?.message
      || error?.response?.data?.details?.message
      || error?.message
      || 'No se pudo crear la factura.'
  }

  /**
   * ¿El servidor dijo que NO, o no se pudo llegar?
   *
   * Vino de `developer`, donde el que contesta es Alegra; acá contesta el
   * backend propio ("X está inactivo: no se puede facturar"), y la regla es
   * la misma.
   * ESTA DIFERENCIA ES EL BUG QUE SE ARREGLA ACÁ. Cualquier fallo se guardaba
   * en la cola de "sin conexión", incluso un rechazo que no iba a cambiar
   * solo: el cajero tenía internet, veía la factura irse a pendientes y la
   * reintentaba —una llegó a quince intentos— contra un error que Alegra ya
   * había explicado. Era un producto configurado en Alegra para no facturarse
   * sin existencias.
   *
   * Con respuesta 4xx, el servidor contestó que no y no creó nada: hay que
   * arreglar algo antes de volver a mandarla. Sin respuesta, o con 5xx, sí es
   * para la cola. El 408 y el 429 son de tiempo, no de contenido.
   */
  esRechazo(error) {
    const codigo = error?.response?.status
    if (!codigo) return false
    return codigo >= 400 && codigo < 500 && codigo !== 408 && codigo !== 429
  }

  /**
   * Lo que ese cliente suele llevar, para recordárselo al tomarle el pedido.
   *
   * RECIBE NUESTRO ID del cliente (`cliente.id`) y devuelve los productos con
   * `producto.id`: el histórico sale de las facturas propias. Nunca el id de
   * Alegra — son números igual que los nuestros y el servidor contestaría,
   * sin error, lo que compra otro cliente.
   *
   * Si falla no se propaga: se factura igual que siempre. Una sugerencia
   * que no cargó no puede impedir cobrar.
   */
  async getSugerenciasCliente(clienteId) {
    try {
      const { data } = await api.get(`/facturacion/clientes/${clienteId}/sugerencias`);
      return {
        habituales: data?.data?.habituales || [],
        perdidos: data?.data?.perdidos || []
      };
    } catch {
      return { habituales: [], perdidos: [] };
    }
  }

  async getCiclosCliente(clienteId) {
    const clave = `ciclos_cliente_${clienteId}`;
    if (this.isOnline) {
      const { data } = await api.get(`/facturacion/clientes/${clienteId}/ciclos`);
      const ciclos = data.data || [];
      await indexedDBService.setConfig(clave, { ciclos, descargadoEn: Date.now() });
      return ciclos;
    }
    const cliente = (await indexedDBService.getClientes()).find(c => String(c.id) === String(clienteId));
    const copia = await indexedDBService.getConfig(clave);
    const actualizacionClientes = await indexedDBService.getConfig('clientes_last_update') || 0;
    const ciclos = copia?.descargadoEn > actualizacionClientes ? copia.ciclos : cliente?.ciclos ?? copia?.ciclos;
    if (!ciclos) throw new Error('Sin conexión y sin semanas descargadas para este cliente. Actualizá con conexión para seleccionar un ciclo.');
    return ciclos;
  }

  async crearFactura(facturaData, facturaVista = null) {
    try {
      console.log('🧾 Creando factura...', {
        online: this.isOnline,
        cliente: facturaData.client,
        items: facturaData.items?.length
      });

      // La clave nace ACÁ, antes del primer intento, y acompaña a esta factura
      // en todos los que vengan. Si el intento en línea expira, el servidor pudo
      // haberla creado: al guardarla offline conserva esta misma clave, así
      // que la sincronización posterior no crea una segunda.
      const claveIdempotencia = await nuevaClaveFactura();

      if (this.isOnline) {
        // Intentar crear directamente en la base propia
        try {
          const response = await api.post('/facturacion/facturas', {
            ...facturaData,
            claveIdempotencia
          });
          
          if (response.data.success) {
            // Se guarda la respuesta propia con número, cliente y líneas.
            const creada = await this.copiaFacturaConfirmada(response.data.data, facturaVista);
            console.log('✅ Factura creada online:', creada.id);

            // Guardar en cache para edición inmediata
            const facturaOnline = {
              ...creada,
              cliente: creada.cliente?.id ? creada.cliente : facturaVista?.cliente || creada.cliente,
              pendienteSincronizar: false,
              pendienteEdicion: false,
              esLocal: false,
              creadaEn: Date.now()
            };
            await indexedDBService.saveFacturasCache([facturaOnline]);
            
            return {
              success: true,
              online: true,
              data: creada,
              message: 'Factura creada'
            };
          }
        } catch (error) {
          // Un RECHAZO no se guarda offline: reenviarlo vuelve a fallar. Se
          // dice el motivo y la factura se queda en pantalla, para poder
          // arreglarla —quitar el producto sin existencias, corregir el
          // descuento— y volver a cobrar.
          if (this.esRechazo(error)) {
            const motivo = this.motivoDelFallo(error);
            console.error('⛔ El servidor rechazó la factura:', motivo);
            throw Object.assign(new Error(motivo), { code: error.response?.data?.code });
          }
          // Sin respuesta o con el servidor caído: eso sí es para la cola.
          console.warn('⚠️ No se pudo llegar al servidor, guardando offline:', error.message);
        }
      }

      // Modo offline: guardar localmente
      // Cuerpo y clave se guardan juntos: dos transacciones dejarían una cola
      // sin clave si se cierra la tablet después de la primera.
      const localId = await indexedDBService.saveFacturaPendiente({ ...facturaData, claveIdempotencia });

      // Guardar versión para edición inmediata
      if (facturaVista) {
        await this.guardarFacturaLocalEnCache({
          ...facturaVista,
          id: `local-${localId}`,
          localId,
          pendienteSincronizar: true,
          origen: 'creacion',
          fecha: facturaData.date
        });
      }
      
      console.log('💾 Factura guardada localmente:', localId);
      
      return {
        success: true,
        online: false,
        localId: localId,
        message: 'Factura guardada localmente. Se sincronizará cuando haya conexión.'
      };

    } catch (error) {
      console.error('❌ Error creando factura:', error);
      throw error;
    }
  }

  /**
   * Sincronizar facturas pendientes con el servidor propio
   */
  async sincronizarFacturasPendientes() {
    if (this.syncInProgress) {
      console.log('⏳ Sincronización ya en progreso...');
      return { success: false, sincronizadas: 0, mensaje: 'Sincronización en progreso' };
    }

    // Lo que se le cuenta a la pantalla al terminar (null si se cortó antes).
    let resumen = null;
    try {
      this.syncInProgress = true;
      console.log('🔄 Iniciando sincronización de facturas pendientes...');

      const facturasPendientes = await indexedDBService.getFacturasPendientes();
      
      if (facturasPendientes.length === 0) {
        console.log('✅ No hay facturas pendientes de sincronizar');
        return { success: true, sincronizadas: 0 };
      }

      console.log(`📋 ${facturasPendientes.length} facturas pendientes de sincronizar`);

      const resultados = {
        exitosas: [],
        fallidas: []
      };

      for (const factura of facturasPendientes) {
        try {
          // Intentar crear en la base propia
          const response = await api.post('/facturacion/facturas', {
            ...factura,
            claveIdempotencia: factura.claveIdempotencia
          });
          
          if (response.data.success) {
            // Se guarda la respuesta propia con número, cliente y líneas.
            const creada = await this.copiaFacturaConfirmada(response.data.data,
              await indexedDBService.getFacturaById(`local-${factura.localId}`));
            // Conservar primero la copia definitiva: si guardar falla, la
            // cola y la fotografía local siguen disponibles para reintentar.
            await indexedDBService.saveFacturasCache([creada]);
            // Marcar como sincronizada
            await indexedDBService.markFacturaSincronizada(
              factura.localId, 
              creada.id
            );

            // Reemplazar factura en cache (eliminar versión local y guardar definitiva)
            if (factura.localId) {
              await indexedDBService.deleteFacturaCache(`local-${factura.localId}`);
            }
            
            resultados.exitosas.push({
              localId: factura.localId,
              facturaId: creada.id
            });
            
            console.log(`✅ Factura ${factura.localId} sincronizada (Factura propia: ${creada.id})`);
          }
        } catch (error) {
          // La sesión venció. No es un rechazo de ESTA factura, y las que
          // siguen recibirían lo mismo: se corta acá sin anotarle a ninguna
          // un error que no tiene. Se mandan al volver a ingresar.
          if (error?.response?.status === 401) {
            resultados.sinSesion = true;
            console.warn('🔒 La sesión venció: las facturas pendientes quedan como estaban');
            break;
          }

          // El motivo que se guarda es el del servidor, no el de axios. En la
          // tarjeta de la factura pendiente se leía "Request failed with
          // status code 400", que no dice qué arreglar; ahora dice cuál
          // producto la está trabando.
          const motivo = this.motivoDelFallo(error);
          await indexedDBService.markFacturaError(factura.localId, motivo);

          resultados.fallidas.push({
            localId: factura.localId,
            error: motivo,
            // Con esto la pantalla puede dejar de ofrecer "Reintentar" a secas
            // en algo que no va a pasar hasta que alguien lo arregle.
            rechazada: this.esRechazo(error)
          });

          console.error(`❌ El servidor no aceptó la factura ${factura.localId}:`, motivo);
        }
      }

      console.log('🎯 Sincronización completada:', {
        exitosas: resultados.exitosas.length,
        fallidas: resultados.fallidas.length
      });

      resumen = {
        success: true,
        sincronizadas: resultados.exitosas.length,
        fallidas: resultados.fallidas.length,
        // true si se cortó porque la sesión venció: lo que faltaba sigue pendiente.
        sinSesion: Boolean(resultados.sinSesion),
        detalles: resultados
      };
      return resumen;

    } catch (error) {
      console.error('❌ Error en sincronización:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
      this.avisarSincronizacion('facturas', resumen);
    }
  }

  /**
   * Obtener facturas pendientes
   */
  async getFacturasPendientes() {
    try {
      const pendientes = await indexedDBService.getFacturasPendientes();
      return pendientes;
    } catch (error) {
      console.error('❌ Error obteniendo facturas pendientes:', error);
      throw error;
    }
  }

  /**
   * Reintentar el envío de una factura pendiente puntual (a diferencia de
   * sincronizarFacturasPendientes, que reintenta todas). Se usa desde el
   * botón "Reintentar" en la pestaña Editar Facturas para forzar el envío
   * ya mismo en vez de esperar el reintento automático periódico.
   */
  async reintentarFacturaPendiente(localId) {
    const numeroLocal = Number(localId);
    const pendientes = await indexedDBService.getFacturasPendientes();
    const factura = pendientes.find(f => f.localId === numeroLocal);

    if (!factura) {
      throw new Error('Factura pendiente no encontrada');
    }

    try {
      const response = await api.post('/facturacion/facturas', {
        ...factura,
        claveIdempotencia: factura.claveIdempotencia
      });

      if (response.data.success) {
        // Se guarda la respuesta propia con número, cliente y líneas.
        const creada = await this.copiaFacturaConfirmada(response.data.data,
          await indexedDBService.getFacturaById(`local-${numeroLocal}`));
        await indexedDBService.saveFacturasCache([creada]);
        await indexedDBService.markFacturaSincronizada(numeroLocal, creada.id);
        await indexedDBService.deleteFacturaCache(`local-${numeroLocal}`);

        return { success: true, data: creada };
      }

      throw new Error(response.data.message || 'Error enviando factura pendiente');
    } catch (error) {
      const motivo = this.motivoDelFallo(error);
      await indexedDBService.markFacturaError(numeroLocal, motivo);
      throw new Error(motivo);
    }
  }

  /**
   * Los descuentos de exceso vivos, con nuestro id de producto.
   *
   * El catálogo del agente y el portal ya se los muestran al cliente. Sin
   * esto, alguien que pidió viendo "−35 %" llegaba a la caja y se le cobraba
   * el precio completo.
   */
  async getOfertasExceso() {
    const response = await api.get('/facturacion/ofertas');
    return response.data?.data ?? [];
  }

  /**
   * Las facturas YA EMITIDAS, de la base propia.
   *
   * Devuelve la vista de consulta tal cual —con su saldo calculado y su
   * estado— y no la forma vieja de Alegra: esta lista es nueva y no tiene por
   * qué heredar ese vocabulario.
   */
  async listarFacturasEmitidas({ buscar = '', estado = 'emitidas', desde = '', hasta = '', pagina = 1, limite = 20 } = {}) {
    const params = { estado, pagina, limite };
    if (buscar) params.buscar = buscar;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;

    const response = await api.get('/facturacion/facturas', { params });
    return {
      facturas: response.data?.data ?? [],
      paginacion: response.data?.paginacion ?? { total: 0, pagina: 1, paginas: 1 }
    };
  }

  /** Una factura con sus líneas, sus cobros y sus notas de crédito. */
  async detalleFacturaEmitida(id) {
    const response = await api.get(`/facturacion/facturas/${id}`);
    return response.data?.data ?? null;
  }

  /**
   * Anular una factura. NO la borra: conserva su número y queda con el motivo
   * escrito, porque un número que desaparece hay que explicárselo a Hacienda.
   */
  async anularFacturaEmitida(id, motivo) {
    const response = await api.patch(`/facturacion/facturas/${id}/anular`, { motivo });
    return response.data?.data ?? null;
  }

  /**
   * Guardar la corrección de una factura ya emitida, desde la pantalla de
   * Facturas. Va directo: acá no hay cola sin conexión porque esta pantalla
   * consulta contra el servidor, no contra el cache.
   */
  async guardarCorreccionFactura(id, datos) {
    const response = await api.put(`/facturacion/facturas/${id}`, datos);
    return response.data?.data ?? null;
  }

  /** A qué números se le puede mandar esta factura. */
  async telefonosDeFactura(id) {
    const response = await api.get(`/facturacion/facturas/${id}/telefonos`);
    return response.data?.data ?? null;
  }

  /**
   * Mandarle la factura al cliente por WhatsApp, con NUESTRO PDF adjunto.
   * El archivo lo arma el servidor: un enlace tendría que ser público y la
   * factura lleva la cédula y la dirección del cliente.
   */
  async enviarFacturaPorWhatsApp(id, { telefono, mensaje }) {
    const response = await api.post(`/facturacion/facturas/${id}/whatsapp`, { telefono, mensaje });
    return response.data?.data ?? null;
  }

  /** Propuesta de correo de la ficha actual, con remitente visible. */
  async datosCorreoFactura(id) {
    const response = await api.get(`/facturacion/facturas/${id}/correo`);
    return response.data?.data ?? null;
  }

  /** Destinatario confirmado; PDF y remitente resueltos en el servidor. */
  async enviarFacturaPorCorreo(id, { para, asunto, mensaje }) {
    const response = await api.post(`/facturacion/facturas/${id}/correo`, { para, asunto, mensaje });
    return response.data?.data ?? null;
  }

  /** Una nota de crédito contra una factura. */
  async crearNotaCredito(datos) {
    const response = await api.post('/facturacion/notas-credito', datos);
    return response.data?.data ?? null;
  }

  /**
   * Obtener estadísticas del cache
   */
  async getCacheStats() {
    try {
      const stats = await indexedDBService.getCacheStats();
      return stats;
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * Limpiar cache completo
   */
  async limpiarCache() {
    try {
      await indexedDBService.clearAll();
      console.log('🗑️ Cache limpiado');
      return { success: true };
    } catch (error) {
      console.error('❌ Error limpiando cache:', error);
      throw error;
    }
  }

  /**
   * ¿Hay una sesión del personal con la que mandar algo?
   *
   * Sin ella, mandar lo pendiente solo consigue un 401 por cada factura.
   */
  haySesion() {
    try {
      return Boolean(localStorage.getItem(TOKEN_KEY));
    } catch {
      return false;
    }
  }

  /**
   * Volvió la conexión: se intenta mandar lo que quedó pendiente.
   *
   * ESTO CORRE EN CUALQUIER PANTALLA, no solo en Facturación: el servicio se
   * carga con la aplicación. Dos cosas que eso implica:
   *
   * - La base local puede no estar abierta (solo Facturación la abría). Cada
   *   método de `indexedDBService` la abre si hace falta; antes esto reventaba
   *   en el catálogo del agente con "Cannot read properties of null (reading
   *   'transaction')" y lo pendiente no se mandaba.
   * - Puede no haber sesión: el catálogo del agente se usa con la sesión
   *   vencida. Sin sesión no se intenta nada; las pendientes esperan intactas
   *   al próximo ingreso.
   *
   * Una después de la otra, no a la vez: las dos comparten `syncInProgress`,
   * y lanzadas juntas la segunda se encontraba la bandera puesta y no hacía
   * nada — al volver la conexión las ediciones pendientes nunca se mandaban.
   */
  async handleOnline() {
    console.log('🌐 Conexión detectada');
    this.isOnline = true;

    if (!this.haySesion()) {
      console.log('🔒 Sin sesión iniciada: lo pendiente se manda al volver a ingresar');
      return;
    }

    for (const sincronizar of [
      () => this.sincronizarFacturasPendientes(),
      () => this.sincronizarEdicionesPendientes()
    ]) {
      try {
        await sincronizar();
      } catch (error) {
        console.error('Error en sincronización automática:', error);
      }
    }
  }

  /**
   * Handler cuando se pierde conexión
   */
  handleOffline() {
    console.log('📡 Conexión perdida - modo offline activado');
    this.isOnline = false;
  }

  /**
   * Avisar cuando una sincronización TERMINA.
   *
   * POR QUÉ HACE FALTA. Al volver la conexión arrancan dos cosas a la vez:
   * este servicio manda lo pendiente (`handleOnline`) y la pantalla de
   * Facturación pide lo mismo. La segunda encuentra `syncInProgress` puesto,
   * vuelve con las manos vacías y relee la cola ANTES de que la primera
   * termine. Visto el 2026-10-11: la factura ya estaba creada en el servidor
   * y la pantalla la seguía mostrando "pendiente de envío", con un botón
   * Reintentar que contestaba "Factura pendiente no encontrada"; y la que el
   * servidor había rechazado no mostraba el motivo. La pantalla ya no
   * adivina cuándo terminó: se le avisa.
   *
   * Devuelve la función para dejar de escuchar.
   */
  alSincronizar(oyente) {
    this.oyentesSincronizacion.add(oyente);
    return () => this.oyentesSincronizacion.delete(oyente);
  }

  avisarSincronizacion(tipo, resultado) {
    for (const oyente of this.oyentesSincronizacion || []) {
      try { oyente({ tipo, resultado }); } catch (error) { console.error('Error avisando la sincronización:', error); }
    }
  }

  /**
   * Verificar si hay conexión
   */
  isConnected() {
    return this.isOnline;
  }

  /**
   * ========== MÉTODOS PARA EDICIÓN DE FACTURAS ==========
   */

  /**
   * Buscar facturas (desde API si hay internet, desde cache si no)
   */
  async buscarFacturas(criterio) {
    try {
      console.log('🔍 Buscando facturas...', { online: this.isOnline, criterio });

      if (this.isOnline) {
        try {
          const params = { estado: 'todas', limite: 100 };
          if (criterio.numero) {
            params.buscar = criterio.numero;
          } else if (criterio.cliente) {
            params.buscar = criterio.cliente;
          } else if (criterio.periodo) {
            // El mes completo. La semana la filtra la pantalla, que es la que
            // sabe cómo las agrupa.
            const { ano, mes } = criterio.periodo;
            const ultimo = new Date(ano, mes, 0).getDate();
            params.desde = `${ano}-${String(mes).padStart(2, '0')}-01`;
            params.hasta = `${ano}-${String(mes).padStart(2, '0')}-${ultimo}`;
          } else {
            throw new Error('Criterio de búsqueda no válido');
          }

          const response = await api.get('/facturacion/facturas', { params });
          const facturas = (response.data?.data ?? []).map(facturaConsultada);
          if (facturas.length > 0) await indexedDBService.saveFacturasCache(facturas);
          return facturas;
        } catch (error) {
          console.warn('⚠️ Error buscando, se busca en el cache:', error.message);
        }
      }

      // Sin conexión: lo que haya quedado guardado.
      if (criterio.numero) return await indexedDBService.searchFacturasByNumber(criterio.numero);
      if (criterio.cliente) return await indexedDBService.searchFacturasByClient(criterio.cliente);
      return await indexedDBService.getFacturasCache();
    } catch (error) {
      console.error('❌ Error buscando facturas:', error);
      throw error;
    }
  }

  /**
   * Obtener una factura específica por ID
   */
  async getFacturaById(facturaId) {
    try {
      console.log('📋 Obteniendo factura:', facturaId);

      const esLocal = typeof facturaId === 'string' && facturaId.startsWith('local-');
      if (esLocal) return await indexedDBService.getFacturaById(facturaId);

      if (this.isOnline) {
        try {
          const response = await api.get(`/facturacion/facturas/${facturaId}`);
          const factura = facturaConsultada(response.data?.data);
          if (factura) {
            await indexedDBService.saveFacturasCache([factura]);
            return factura;
          }
        } catch (error) {
          console.warn('⚠️ Error obteniendo la factura, se busca en el cache:', error.message);
        }
      }

      return await indexedDBService.getFacturaById(facturaId);
    } catch (error) {
      console.error('❌ Error obteniendo factura:', error);
      throw error;
    }
  }

  /**
   * Editar factura.
   * Con internet se guarda en el momento; sin internet queda en la tablet y
   * se manda después.
   *
   * SOLO SE EDITA UNA FACTURA MARCADA `esPropia`. La marca dice que el id es
   * el NUESTRO. La copia de facturas de la tablet no se borró al dejar
   * Alegra, así que puede quedar alguna de antes, con el id de allá: mandar
   * ese número a nuestra ruta no daría un error, editaría OTRA factura, la
   * que por casualidad tenga ese número acá. No se adivina: se rechaza y se
   * pide abrirla de nuevo desde la lista. La ruta que editaba en Alegra se
   * retiró el 2026-10-04.
   */
  async editarFactura(facturaId, datosEdicion, facturaVista = null, { esPropia = false } = {}) {
    if (!esPropia) throw new Error(EDICION_DE_COPIA_VIEJA);

    try {
      console.log('✏️ Editando factura...', {
        online: this.isOnline,
        facturaId,
        propia: esPropia,
        cambios: Object.keys(datosEdicion)
      });

      if (this.isOnline) {
        try {
          const response = await api.put(`/facturacion/facturas/${facturaId}`, datosEdicion);

          if (response.data.success) {
            console.log('✅ Factura editada online:', facturaId);

            // Actualizar cache con la nueva versión
            const editada = await this.copiaFacturaConfirmada(response.data.data, facturaVista);
            if (editada) {
              const facturaOnline = {
                ...editada,
                cliente: editada.cliente?.id ? editada.cliente : facturaVista?.cliente || editada.cliente,
                pendienteSincronizar: false,
                pendienteEdicion: false
              };
              await indexedDBService.saveFacturasCache([facturaOnline]);
            }

            return {
              success: true,
              online: true,
              data: editada,
              message: 'Factura editada'
            };
          }
        } catch (error) {
          const motivo = error.response?.data?.message || error.message;

          // El servidor dijo que no y dijo por qué (tiene cobros, es
          // electrónica, está anulada…). Guardarla "para después" la
          // reintentaría para siempre con la misma respuesta, y a quien
          // edita se le diría que quedó guardada. Misma regla que al crear.
          if (this.esRechazo(error)) throw new Error(motivo);

          console.warn('⚠️ No se pudo enviar la edición, se guarda en la tablet:', motivo);
        }
      }

      // Modo offline: guardar edición localmente
      // Se guarda también de dónde salió: la marca impide que una copia
      // histórica se reintente con su id de Alegra en el espacio propio.
      const localId = await indexedDBService.saveEdicionPendiente(facturaId, datosEdicion, esPropia);

      if (facturaVista) {
        await this.guardarFacturaLocalEnCache({
          ...facturaVista,
          id: facturaVista.id || facturaId,
          pendienteEdicion: true,
          origen: 'edicion',
          fecha: facturaVista.fecha || hoyEnCostaRica()
        });
      }

      console.log('💾 Edición guardada localmente:', localId);

      return {
        success: true,
        online: false,
        localId: localId,
        message: 'Edición guardada localmente. Se sincronizará cuando haya conexión.'
      };

    } catch (error) {
      console.error('❌ Error editando factura:', error);
      throw error;
    }
  }

  /**
   * Actualizar factura pendiente antes de sincronizar (modo offline)
   */
  async actualizarFacturaPendiente(localId, facturaData, facturaVista = null) {
    try {
      const numeroLocal = typeof localId === 'string' && localId.startsWith('local-')
        ? parseInt(localId.replace('local-', ''), 10)
        : Number(localId);

      if (Number.isNaN(numeroLocal)) {
        throw new Error('ID local inválido');
      }

      await indexedDBService.updateFacturaPendiente(numeroLocal, facturaData);

      if (facturaVista) {
        await this.guardarFacturaLocalEnCache({
          ...facturaVista,
          id: `local-${numeroLocal}`,
          localId: numeroLocal,
          pendienteSincronizar: true,
          origen: 'creacion'
        });
      }

      return {
        success: true,
        online: false,
        localId: numeroLocal,
        message: 'Factura pendiente actualizada localmente'
      };
    } catch (error) {
      console.error('❌ Error actualizando factura pendiente:', error);
      throw error;
    }
  }

  /**
   * Enviar inmediatamente una factura pendiente (si hay internet)
   */
  async enviarFacturaPendiente(localId, facturaData, facturaVista = null) {
    // Se calcula ANTES del try porque el catch de abajo lo nombra al armar el
    // aviso de "Alegra no permite reenviar". Declarado adentro, `const` es de
    // bloque y en el catch no existe: en vez del mensaje que dice qué hacer
    // —usar Reimpresión o una nota de crédito— saltaba un ReferenceError,
    // justo en el camino de error, que es donde menos sirve un segundo fallo.
    const numeroLocal = typeof localId === 'string' && localId.startsWith('local-')
      ? parseInt(localId.replace('local-', ''), 10)
      : Number(localId);

    try {
      if (Number.isNaN(numeroLocal)) {
        throw new Error('ID local inválido');
      }

      console.log(`🌐 Enviando factura pendiente ${numeroLocal} al servidor propio...`);

      // La clave se lee del registro guardado, no se recalcula: es la misma
      // que usaron los intentos anteriores, y eso es lo que le permite al
      // servidor reconocer que ya la recibió en vez de crear otra factura.
      const pendientes = await indexedDBService.getFacturasPendientes();
      const guardada = pendientes.find(f => f.localId === numeroLocal);

      const response = await api.post('/facturacion/facturas', {
        ...facturaData,
        claveIdempotencia: guardada?.claveIdempotencia || null
      });

      if (response.data.success) {
        // Se guarda la respuesta propia con número, cliente y líneas.
        const creada = await this.copiaFacturaConfirmada(response.data.data,
          await indexedDBService.getFacturaById(`local-${numeroLocal}`) || facturaVista);

        const facturaOnline = {
          ...creada,
          cliente: creada.cliente?.id ? creada.cliente : facturaVista?.cliente || creada.cliente,
          pendienteSincronizar: false,
          pendienteEdicion: false,
          esLocal: false
        };
        await indexedDBService.saveFacturasCache([facturaOnline]);
        await indexedDBService.markFacturaSincronizada(numeroLocal, creada.id);
        await indexedDBService.deleteFacturaCache(`local-${numeroLocal}`);

        console.log(`✅ Factura pendiente ${numeroLocal} enviada con id propio ${creada.id}`);

        return {
          success: true,
          online: true,
          data: creada,
          message: 'Factura enviada'
        };
      }

      throw new Error(response.data.message || 'Error enviando factura pendiente');
    } catch (error) {
      throw new Error(this.motivoDelFallo(error));
    }
  }

  /**
   * Sincronizar ediciones pendientes con el servidor propio
   */
  async sincronizarEdicionesPendientes() {
    if (this.syncInProgress) {
      console.log('⏳ Sincronización ya en progreso...');
      return { success: false, sincronizadas: 0, mensaje: 'Sincronización en progreso' };
    }

    let resumen = null;
    try {
      this.syncInProgress = true;
      console.log('🔄 Iniciando sincronización de ediciones pendientes...');

      const edicionesPendientes = await indexedDBService.getEdicionesPendientes();

      if (edicionesPendientes.length === 0) {
        console.log('✅ No hay ediciones pendientes de sincronizar');
        return { success: true, sincronizadas: 0 };
      }

      console.log(`📋 ${edicionesPendientes.length} ediciones pendientes de sincronizar`);

      const resultados = {
        exitosas: [],
        fallidas: []
      };

      for (const edicion of edicionesPendientes) {
        // Una edición sin la marca se hizo sobre una factura de Alegra, con el
        // id de allá. NO SE MANDA: en nuestra ruta ese número es otra
        // factura. Tampoco se borra — queda en la lista con su motivo, para
        // que quien la hizo la rehaga sobre la factura correcta.
        if (!edicion.esPropia) {
          await indexedDBService.markEdicionError(edicion.localId, EDICION_DE_COPIA_VIEJA);
          resultados.fallidas.push({
            localId: edicion.localId,
            facturaId: edicion.facturaId,
            error: EDICION_DE_COPIA_VIEJA
          });
          continue;
        }

        try {
          const response = await api.put(`/facturacion/facturas/${edicion.facturaId}`, edicion.datosEdicion);

          if (response.data.success) {
            // Guardar el documento propio actualizado para editar sin señal.
            const editada = await this.copiaFacturaConfirmada(response.data.data);
            if (editada) {
              await indexedDBService.saveFacturasCache([editada]);
            }
            await indexedDBService.markEdicionSincronizada(edicion.localId);

            resultados.exitosas.push({
              localId: edicion.localId,
              facturaId: edicion.facturaId
            });

            console.log(`✅ Edición ${edicion.localId} sincronizada (Factura: ${edicion.facturaId})`);
          }
        } catch (error) {
          // La sesión venció: no es un problema de esta edición (ver arriba).
          if (error?.response?.status === 401) {
            resultados.sinSesion = true;
            console.warn('🔒 La sesión venció: las ediciones pendientes quedan como estaban');
            break;
          }

          const motivo = error.response?.data?.message || error.message;

          // No se descarta sola, ni cuando el servidor la rechaza: queda en
          // la lista con el motivo y el botón de descartar. Es el trabajo de
          // alguien, y borrarlo sin avisar lo dejaría creyendo que se guardó.
          await indexedDBService.markEdicionError(edicion.localId, motivo);

          resultados.fallidas.push({
            localId: edicion.localId,
            facturaId: edicion.facturaId,
            error: motivo
          });

          console.error(`❌ Error sincronizando edición ${edicion.localId}:`, motivo);
        }
      }

      console.log('🎯 Sincronización de ediciones completada:', {
        exitosas: resultados.exitosas.length,
        fallidas: resultados.fallidas.length
      });

      resumen = {
        success: true,
        sincronizadas: resultados.exitosas.length,
        fallidas: resultados.fallidas.length,
        // true si se cortó porque la sesión venció: lo que faltaba sigue pendiente.
        sinSesion: Boolean(resultados.sinSesion),
        detalles: resultados
      };
      return resumen;

    } catch (error) {
      console.error('❌ Error en sincronización de ediciones:', error);
      throw error;
    } finally {
      this.syncInProgress = false;
      this.avisarSincronizacion('ediciones', resumen);
    }
  }

  /**
   * Obtener ediciones pendientes
   */
  async getEdicionesPendientes() {
    try {
      const pendientes = await indexedDBService.getEdicionesPendientes();
      return pendientes;
    } catch (error) {
      console.error('❌ Error obteniendo ediciones pendientes:', error);
      throw error;
    }
  }

  async eliminarEdicionPendiente(localId, facturaId = null) {
    await indexedDBService.deleteEdicionPendiente(localId);

    if (facturaId) {
      const factura = await indexedDBService.getFacturaById(facturaId);
      if (factura) {
        factura.pendienteEdicion = false;
        await indexedDBService.saveFacturasCache([factura]);
      }
    }
  }

  /**
   * Descartar una factura que quedó pendiente de envío (no sincronizada con el servidor).
   * Elimina el registro de la cola de sincronización y su copia en el cache local
   * de edición, para que deje de aparecer como "Pendiente de envío".
   */
  async eliminarFacturaPendiente(localId) {
    await indexedDBService.deleteFactura(localId);
    await indexedDBService.deleteFacturaCache(`local-${localId}`);
  }

  async guardarFacturaLocalEnCache(facturaVista) {
    if (!facturaVista) return;

    try {
      const numeroTemporal = facturaVista.numero || facturaVista.numeroTemporal || `LOCAL-${Date.now()}`;
      const facturaCache = {
        ...facturaVista,
        id: facturaVista.id || numeroTemporal,
        localId: facturaVista.localId || null,
        numero: numeroTemporal,
        cliente: facturaVista.cliente || null,
        lineas: facturaVista.lineas || [],
        fecha: facturaVista.fecha || hoyEnCostaRica(),
        estado: facturaVista.estado || 'borrador',
        esPropia: Boolean(facturaVista.esPropia),
        pendienteSincronizar: Boolean(facturaVista.pendienteSincronizar),
        pendienteEdicion: Boolean(facturaVista.pendienteEdicion),
        updatedAtLocal: Date.now()
      };

      await indexedDBService.saveFacturasCache([facturaCache]);
    } catch (error) {
      console.error('❌ Error guardando factura en cache local:', error);
    }
  }

  /**
   * Obtener facturas precargadas del cache (para edición offline)
   */
  async getFacturasPrecargadas() {
    try {
      const facturas = await indexedDBService.getFacturasCache();
      
      // Filtrar duplicados históricos por ID (casteado a String)
      const vistos = new Set();
      const facturasUnicas = [];
      
      for (const f of facturas) {
        if (!f || !f.id) continue;
        const key = String(f.id);
        if (!vistos.has(key)) {
          vistos.add(key);
          facturasUnicas.push(f);
        }
      }

      // En orden de llegada: la última que entró, arriba (ver ordenDeLlegada).
      return ordenDeLlegada(facturasUnicas);
    } catch (error) {
      console.error('❌ Error obteniendo facturas precargadas:', error);
      throw error;
    }
  }
}

// Singleton
const facturacionService = new FacturacionService();

export default facturacionService;
