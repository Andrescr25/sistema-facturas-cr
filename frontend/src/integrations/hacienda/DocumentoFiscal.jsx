import { useState, useEffect } from "react";
import { ShieldCheck } from "lucide-react";
import Modal from "../../components/ui/Modal";
import {
  preparar,
  operar,
  descargar,
  mensajeError,
  datosDocumento,
  subirOriginal,
} from "./api";

const INPUT =
  "mt-1 w-full rounded-lg border border-neutro-200 px-3 py-2 text-sm";
/**
 * Responder ante Hacienda el comprobante de un proveedor (aceptarlo o
 * rechazarlo), desde una compra ya registrada.
 *
 * SOLO COMPRAS (2026-10-11). Este modal también emitía facturas y notas de
 * crédito: ambiente, tipo, código de referencia y tres botones en orden. Las
 * ventas ya no pasan por acá —se emiten de un clic desde la factura y desde
 * la tarjeta de la nota (hooks/useEmisionFactura.js)—, así que esas partes se
 * quitaron en vez de dejarlas sin uso.
 */
export default function DocumentoFiscal({
  origen = "compra",
  documento,
  onCambio,
  desdeBuzon = false,
}) {
  const [abierto, setAbierto] = useState(false),
    [ambiente, setAmbiente] = useState("pruebas"),
    [c, setC] = useState(null);
  const [datos, setDatos] = useState({}),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState("");
  const [detalle, setDetalle] = useState(documento),
    [xmlOriginal, setXmlOriginal] = useState(null);
  useEffect(() => {
    setAbierto(false);
    setC(null);
    setDetalle(documento);
    setDatos({});
    setXmlOriginal(null);
    setError("");
  }, [documento.id, origen]);
  const actualizar = (k, v) => setDatos((d) => ({ ...d, [k]: v }));
  async function accion(fn) {
    setOcupado(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setOcupado(false);
    }
  }
  const definitivo = c && ["aceptada", "rechazada"].includes(c.estado);
  return (
    <>
      <button
        className="btn btn-outline flex items-center gap-2"
        onClick={() => {
          setAbierto(true);
          accion(async () =>
            setDetalle(await datosDocumento(origen, documento.id, desdeBuzon)),
          );
        }}
      >
        <ShieldCheck size={16} />
        Respuesta a Hacienda
      </button>
      {abierto && (
        <Modal
          titulo="Responder comprobante del proveedor"
          ancho="xl"
          onCerrar={() => {
            if (!ocupado) setAbierto(false);
          }}
        >
          <div className="space-y-4 p-5 text-sm">
            <p>
              Documento:{" "}
              <strong>
                {documento.numero ||
                  documento.numeroConsecutivo ||
                  documento.id}
              </strong>
            </p>
            <label className="block">
              Ambiente
              <select
                className={INPUT}
                value={ambiente}
                disabled={ocupado}
                onChange={(e) => {
                  setAmbiente(e.target.value);
                  setC(null);
                  actualizar("sustituir", false);
                }}
              >
                <option value="pruebas">Pruebas de Hacienda</option>
                <option value="produccion">Producción</option>
              </select>
            </label>
            {ambiente === "pruebas" && (
              <p className="rounded-lg bg-primario-50 p-3">
                Esta prueba no cambia el estado fiscal de la venta ni usa
                consecutivos de producción.
              </p>
            )}
            {ambiente === "produccion" && (
              <p className="rounded-lg bg-alerta-50 p-3">
                Al preparar se reserva el número fiscal y se conserva el
                documento para emitirlo. Revisá los datos antes de preparar.
              </p>
            )}
            {!c && (
              <>
                {datos.sustituir && (
                  <p>
                    Se conservará el rechazo y se preparará un nuevo consecutivo
                    con referencia al comprobante rechazado.
                  </p>
                )}
                <>
                    {detalle.necesitaXml && (
                      <div className="rounded-lg border border-neutro-200 p-3">
                        <label className="block">
                          XML original del proveedor
                          <input
                            type="file"
                            accept=".xml"
                            className={INPUT}
                            onChange={(e) =>
                              setXmlOriginal(e.target.files?.[0] || null)
                            }
                          />
                        </label>
                        <button
                          disabled={ocupado || !xmlOriginal}
                          className="btn btn-outline mt-2"
                          onClick={() =>
                            accion(async () => {
                              await subirOriginal(detalle.id, xmlOriginal);
                              setDetalle(
                                await datosDocumento("compra", detalle.id),
                              );
                              setXmlOriginal(null);
                            })
                          }
                        >
                          Conservar XML original
                        </button>
                      </div>
                    )}
                    <label className="block">
                      Respuesta
                      <select
                        className={INPUT}
                        value={datos.mensaje || ""}
                        onChange={(e) => actualizar("mensaje", e.target.value)}
                      >
                        <option value="">Elegir respuesta</option>
                        <option value="1">Aceptación total</option>
                        <option value="2">Aceptación parcial</option>
                        <option value="3">Rechazo</option>
                      </select>
                    </label>
                    <label className="block">
                      Detalle de la respuesta
                      <input
                        className={INPUT}
                        value={datos.detalle || ""}
                        onChange={(e) => actualizar("detalle", e.target.value)}
                        maxLength={160}
                      />
                    </label>
                    <label className="block">
                      Condición del IVA
                      <select
                        className={INPUT}
                        value={datos.condicionImpuesto || ""}
                        onChange={(e) =>
                          actualizar("condicionImpuesto", e.target.value)
                        }
                      >
                        <option value="">Elegir condición</option>
                        <option value="01">Crédito general</option>
                        <option value="02">Crédito parcial</option>
                        <option value="03">Bienes de capital</option>
                        <option value="04">Gasto sin crédito</option>
                        <option value="05">Proporcionalidad</option>
                      </select>
                    </label>
                    <label className="block">
                      IVA a acreditar
                      <input
                        type="number"
                        min="0"
                        step="0.00001"
                        className={INPUT}
                        value={datos.impuestoAcreditar ?? ""}
                        onChange={(e) =>
                          actualizar("impuestoAcreditar", e.target.value)
                        }
                      />
                    </label>
                    <label className="block">
                      Gasto aplicable
                      <input
                        type="number"
                        min="0"
                        step="0.00001"
                        className={INPUT}
                        value={datos.gastoAplicable ?? ""}
                        onChange={(e) =>
                          actualizar("gastoAplicable", e.target.value)
                        }
                      />
                    </label>
                </>
                <button
                  disabled={ocupado || detalle.necesitaXml}
                  className="btn btn-primary"
                  onClick={() =>
                    accion(async () =>
                      setC(
                        await preparar(origen, detalle.id, {
                          ...datos,
                          ambiente,
                        }),
                      ),
                    )
                  }
                >
                  Preparar XML firmado
                </button>
              </>
            )}
            {c && (
              <div className="space-y-3">
                <p>
                  Estado: <strong>{c.estado}</strong>
                </p>
                <p className="break-all">Clave: {c.clave}</p>
                <p>Consecutivo: {c.consecutivo}</p>
                {c.mensaje && <p>{c.mensaje}</p>}
                {c.estado === "rechazada" && (
                  <button
                    className="btn btn-outline"
                    disabled={ocupado}
                    onClick={() => {
                      setC(null);
                      actualizar("sustituir", true);
                    }}
                  >
                    Preparar sustitución del rechazado
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  {!definitivo && (
                    <button
                      disabled={ocupado}
                      className="btn btn-primary"
                      onClick={() =>
                        accion(async () => {
                          setC(await operar(c, "enviar"));
                          onCambio?.();
                        })
                      }
                    >
                      {["incierta", "enviando"].includes(c.estado)
                        ? "Consultar antes de reenviar"
                        : "Enviar a Hacienda"}
                    </button>
                  )}
                  <button
                    disabled={ocupado}
                    className="btn btn-outline"
                    onClick={() =>
                      accion(async () => {
                        setC(await operar(c, "consultar"));
                        onCambio?.();
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
                    Descargar XML
                  </button>
                  {c.tieneRespuesta && (
                    <button
                      disabled={ocupado}
                      className="btn btn-outline"
                      onClick={() => accion(() => descargar(c, true))}
                    >
                      Descargar respuesta
                    </button>
                  )}
                </div>
              </div>
            )}
            {error && (
              <p role="alert" className="text-peligro-700">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
