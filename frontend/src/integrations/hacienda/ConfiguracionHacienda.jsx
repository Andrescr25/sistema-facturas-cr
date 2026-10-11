import { useEffect, useState } from "react";
import { ShieldCheck, Upload, RefreshCw } from "lucide-react";
import {
  configuracion,
  guardar,
  listar,
  probar,
  operar,
  descargar,
  mensajeError,
} from "./api";
import NumeracionHacienda from "./NumeracionHacienda";

const CAMPOS = [
  [
    "actividad_economica",
    "Actividad económica del emisor (como la da Hacienda, ej. 4752.1)",
  ],
  ["proveedor_sistemas", "Identificación del proveedor del sistema"],
  ["provincia_codigo", "Código de provincia"],
  ["canton_codigo", "Código de cantón"],
  ["distrito_codigo", "Código de distrito"],
  ["sucursal", "Sucursal (3 dígitos)"],
  ["terminal", "Terminal (5 dígitos)"],
];
const INPUT =
  "mt-1 w-full rounded-lg border border-neutro-200 px-3 py-2 text-sm";
export default function ConfiguracionHacienda() {
  const [ambiente, setAmbiente] = useState("pruebas"),
    [datos, setDatos] = useState({}),
    [estado, setEstado] = useState(null);
  const [archivo, setArchivo] = useState(null),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState(""),
    [mensaje, setMensaje] = useState(""),
    [comprobantes, setComprobantes] = useState([]);
  const [versionArchivo, setVersionArchivo] = useState(0);
  useEffect(() => {
    let viva = true;
    setEstado(null);
    setDatos({});
    setArchivo(null);
    setComprobantes([]);
    setError("");
    setMensaje("");
    setVersionArchivo((v) => v + 1);
    Promise.all([configuracion(ambiente), listar(ambiente)])
      .then(([c, l]) => {
        if (!viva) return;
        setEstado(c);
        setDatos({ ...c.datos, habilitada: c.habilitada });
        setComprobantes(l);
      })
      .catch((e) => {
        if (viva) setError(mensajeError(e));
      });
    return () => {
      viva = false;
    };
  }, [ambiente]);
  const cambiar = (k, v) => setDatos((d) => ({ ...d, [k]: v }));
  async function accion(fn) {
    setOcupado(true);
    setError("");
    setMensaje("");
    try {
      await fn();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }
  async function guardarFormulario(e) {
    e.preventDefault();
    await accion(async () => {
      const c = await guardar(ambiente, datos, archivo);
      setEstado(c);
      setDatos({ ...c.datos, habilitada: c.habilitada });
      setArchivo(null);
      setVersionArchivo((v) => v + 1);
      setMensaje(
        "Configuración guardada. Las contraseñas y el certificado permanecen privados.",
      );
    });
  }
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-neutro-200 bg-white p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck size={22} /> Hacienda · versión 4.4
        </h2>
        <p className="mt-2 text-sm text-neutro-600">
          Cargá las credenciales del API de comprobantes electrónicos y la llave
          criptográfica de la empresa. Cada ambiente tiene su propia
          configuración.
        </p>
        <label className="mt-4 block text-sm font-semibold">
          Ambiente
          <select
            className={INPUT}
            value={ambiente}
            disabled={ocupado}
            onChange={(e) => setAmbiente(e.target.value)}
          >
            <option value="pruebas">Pruebas de Hacienda</option>
            <option value="produccion">Producción</option>
          </select>
        </label>
        {ambiente === "pruebas" && (
          <p className="mt-3 rounded-lg bg-primario-50 p-3 text-sm">
            Los comprobantes de prueba no cambian el estado fiscal de tus ventas
            reales.
          </p>
        )}
        {ambiente === "produccion" && (
          <p className="mt-3 rounded-lg bg-alerta-50 p-3 text-sm">
            Habilitá este ambiente después de comprobar la aceptación en pruebas
            y preparar el corte. La copia de desarrollo conserva su bloqueo de
            envíos reales.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-peligro-700">
            {error}
          </p>
        )}
        {mensaje && (
          <p role="status" className="mt-3 text-sm text-exito-700">
            {mensaje}
          </p>
        )}
        {estado && (
          <>
            <p className="rounded-lg bg-neutro-50 p-3 text-sm">
              En las pestañas Impuestos y Métodos de pago, completá también sus
              códigos de Hacienda antes de emitir.
            </p>
            <form
              onSubmit={guardarFormulario}
              className="mt-5 space-y-5"
              autoComplete="off"
            >
              <fieldset
                disabled={ocupado}
                className="grid gap-4 sm:grid-cols-2"
              >
                <legend className="mb-3 font-semibold">
                  Datos para emitir
                </legend>
                {CAMPOS.map(([k, t]) => (
                  <label key={k} className="text-sm">
                    {t}
                    <input
                      className={INPUT}
                      value={datos[k] || ""}
                      onChange={(e) => cambiar(k, e.target.value)}
                      maxLength={40}
                    />
                  </label>
                ))}
              </fieldset>
              <fieldset
                disabled={ocupado}
                className="grid gap-4 sm:grid-cols-2"
              >
                <legend className="mb-3 font-semibold">
                  Acceso y certificado
                </legend>
                <label className="text-sm">
                  Usuario del API
                  <input
                    className={INPUT}
                    value={datos.usuario || ""}
                    onChange={(e) => cambiar("usuario", e.target.value)}
                    autoComplete="off"
                    placeholder={
                      estado.tieneCredenciales
                        ? "Dejar vacío para conservar lo guardado"
                        : ""
                    }
                  />
                </label>
                <label className="text-sm">
                  Contraseña del API
                  <input
                    className={INPUT}
                    type="password"
                    value={datos.clave || ""}
                    onChange={(e) => cambiar("clave", e.target.value)}
                    autoComplete="new-password"
                    placeholder={
                      estado.tieneCredenciales
                        ? "Dejar vacío para conservar lo guardado"
                        : ""
                    }
                  />
                </label>
                <label className="text-sm">
                  <span className="flex gap-2">
                    <Upload size={16} /> Certificado .p12
                  </span>
                  <input
                    key={versionArchivo}
                    type="file"
                    accept=".p12"
                    className={INPUT}
                    onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  />
                </label>
                <label className="text-sm">
                  PIN del certificado
                  <input
                    className={INPUT}
                    type="password"
                    value={datos.pin || ""}
                    onChange={(e) => cambiar("pin", e.target.value)}
                    autoComplete="new-password"
                    placeholder={
                      estado.certificado
                        ? "Dejar vacío para conservar lo guardado"
                        : ""
                    }
                  />
                </label>
              </fieldset>
              {estado.certificado && (
                <p className="break-all text-sm text-neutro-600">
                  Certificado cargado. Vence:{" "}
                  {new Date(estado.certificado.vence).toLocaleDateString(
                    "es-CR",
                  )}
                  . Huella: {estado.certificado.huella}
                </p>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(datos.habilitada)}
                  disabled={ocupado}
                  onChange={(e) => cambiar("habilitada", e.target.checked)}
                />{" "}
                Habilitar emisión en{" "}
                {ambiente === "pruebas" ? "pruebas" : "producción"}
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  className="btn btn-primary"
                  disabled={ocupado}
                  type="submit"
                >
                  Guardar configuración
                </button>
                <button
                  className="btn btn-outline"
                  disabled={ocupado}
                  type="button"
                  onClick={() =>
                    accion(async () => {
                      await probar(ambiente);
                      setMensaje(
                        "Conexión autenticada con Hacienda. Falta comprobar la aceptación de un XML firmado.",
                      );
                    })
                  }
                >
                  Probar conexión
                </button>
              </div>
            </form>
          </>
        )}
      </div>
      {/* Con qué número sale el próximo comprobante. Se relee al guardar la
          configuración: la serie depende de la sucursal y la terminal. */}
      {estado && <NumeracionHacienda key={`${ambiente}-${estado.revision}`} ambiente={ambiente} />}
      <div className="rounded-2xl border border-neutro-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-bold">
            Comprobantes de {ambiente === "pruebas" ? "prueba" : "producción"}
          </h3>
          <button
            className="btn btn-outline"
            disabled={ocupado}
            onClick={() =>
              accion(async () => setComprobantes(await listar(ambiente)))
            }
          >
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
        <p className="mt-2 text-sm text-neutro-600">
          Prepará las ventas desde su factura y las respuestas a proveedores
          desde Compras. Recibido significa que Hacienda lo recibió; la
          aceptación se confirma con su respuesta.
        </p>
        {!comprobantes.length && (
          <p className="mt-4 text-sm text-neutro-500">
            Todavía no hay comprobantes en este ambiente.
          </p>
        )}
        {comprobantes.map((c) => (
          <div
            key={c.id}
            className="mt-4 rounded-xl border border-neutro-100 p-3 text-sm"
          >
            <p className="font-semibold">
              {c.origen === "compra"
                ? "Respuesta al proveedor"
                : c.origen === "nota_credito"
                  ? "Nota de crédito"
                  : "Venta"}{" "}
              · {c.consecutivo}
            </p>
            <p className="mt-1 break-all">Clave: {c.clave}</p>
            <p className="mt-1">Estado: {c.estado}</p>
            {c.mensaje && <p className="mt-1">{c.mensaje}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                disabled={ocupado}
                className="btn btn-outline"
                onClick={() =>
                  accion(async () => {
                    await operar(c, "consultar");
                    setComprobantes(await listar(ambiente));
                  })
                }
              >
                Consultar estado
              </button>
              <button
                disabled={ocupado}
                className="btn btn-outline"
                onClick={() => accion(() => descargar(c))}
              >
                XML firmado
              </button>
              {c.tieneRespuesta && (
                <button
                  disabled={ocupado}
                  className="btn btn-outline"
                  onClick={() => accion(() => descargar(c, true))}
                >
                  Respuesta de Hacienda
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
