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
const DESCUENTOS = [
  ["01", "Regalía"],
  ["02", "Regalía con IVA cobrado al cliente"],
  ["03", "Bonificación"],
  ["04", "Volumen"],
  ["05", "Temporada"],
  ["06", "Promocional"],
  ["07", "Comercial"],
  ["08", "Frecuencia"],
  ["09", "Sostenido"],
  ["99", "Otro"],
];
export default function DocumentoFiscal({
  origen = "factura",
  documento,
  onCambio,
  desdeBuzon = false,
}) {
  const [abierto, setAbierto] = useState(false),
    [ambiente, setAmbiente] = useState("pruebas"),
    [c, setC] = useState(null);
  const [datos, setDatos] = useState({ tipo: "01", lineas: [] }),
    [ocupado, setOcupado] = useState(false),
    [error, setError] = useState("");
  const [detalle, setDetalle] = useState(documento),
    [xmlOriginal, setXmlOriginal] = useState(null);
  useEffect(() => {
    setAbierto(false);
    setC(null);
    setDetalle(documento);
    setDatos({ tipo: "01", lineas: [] });
    setXmlOriginal(null);
    setError("");
  }, [documento.id, origen]);
  const actualizar = (k, v) => setDatos((d) => ({ ...d, [k]: v }));
  const linea = (numero, k, v) =>
    setDatos((d) => ({
      ...d,
      lineas: [
        ...d.lineas.filter((l) => l.numeroLinea !== numero),
        {
          ...(d.lineas.find((l) => l.numeroLinea === numero) || {}),
          numeroLinea: numero,
          [k]: v,
        },
      ],
    }));
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
        {origen === "compra"
          ? "Respuesta a Hacienda"
          : "Emitir electrónicamente"}
      </button>
      {abierto && (
        <Modal
          titulo={
            origen === "compra"
              ? "Responder comprobante del proveedor"
              : "Emitir ante Hacienda"
          }
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
                {origen === "factura" && (
                  <>
                    <label className="block">
                      Comprobante
                      <select
                        className={INPUT}
                        value={datos.tipo}
                        onChange={(e) => actualizar("tipo", e.target.value)}
                      >
                        <option value="01">Factura electrónica</option>
                        <option value="04">Tiquete electrónico</option>
                      </select>
                    </label>
                    <label className="block">
                      Actividad del receptor (6 dígitos)
                      <input
                        className={INPUT}
                        value={
                          datos.actividadReceptor ||
                          detalle.actividadEconomica ||
                          documento.actividadEconomica ||
                          ""
                        }
                        onChange={(e) =>
                          actualizar("actividadReceptor", e.target.value)
                        }
                        maxLength={6}
                      />
                    </label>
                  </>
                )}
                {origen === "nota_credito" && (
                  <label className="block">
                    Código fiscal de referencia
                    <select
                      className={INPUT}
                      value={datos.codigoReferencia || ""}
                      onChange={(e) =>
                        actualizar("codigoReferencia", e.target.value)
                      }
                    >
                      <option value="">Elegir motivo</option>
                      <option value="01">Anula documento</option>
                      <option value="02">Corrige monto</option>
                      <option value="04">Referencia a otro documento</option>
                      <option value="06">Devolución de mercancía</option>
                      <option value="07">Sustituye comprobante</option>
                      <option value="09">Nota de crédito financiera</option>
                      <option value="12">
                        Crédito por exoneración posterior
                      </option>
                      <option value="13">Anula por error material</option>
                      <option value="14">
                        Corrige monto por error material
                      </option>
                      <option value="15">Sustituye por error material</option>
                      <option value="16">
                        Sustituye comprobante rechazado
                      </option>
                      <option value="99">Otros</option>
                    </select>
                  </label>
                )}
                {origen === "nota_credito" &&
                  datos.codigoReferencia === "99" && (
                    <label className="block">
                      Detalle de otra referencia
                      <input
                        className={INPUT}
                        value={datos.referenciaOtro || ""}
                        onChange={(e) =>
                          actualizar("referenciaOtro", e.target.value)
                        }
                        maxLength={100}
                      />
                    </label>
                  )}
                {datos.sustituir && (
                  <p>
                    Se conservará el rechazo y se preparará un nuevo consecutivo
                    con referencia al comprobante rechazado.
                  </p>
                )}
                {origen === "compra" && (
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
                )}
                {(detalle.lineas || [])
                  .filter(
                    (l) => Number(l.descuentoMonto) > 0 || l.esMedicamento,
                  )
                  .map((l, i) => {
                    const n = l.numeroLinea || i + 1,
                      d = datos.lineas.find((a) => a.numeroLinea === n) || {};
                    return (
                      <div
                        key={n}
                        className="rounded-lg border border-neutro-100 p-3"
                      >
                        <p className="font-semibold">
                          {n}. {l.nombre}
                        </p>
                        {Number(l.descuentoMonto) > 0 && (
                          <>
                            <label className="block mt-2">
                              Motivo del descuento
                              <select
                                className={INPUT}
                                value={d.codigoDescuento || ""}
                                onChange={(e) =>
                                  linea(n, "codigoDescuento", e.target.value)
                                }
                              >
                                <option value="">Elegir motivo</option>
                                {DESCUENTOS.map(([k, t]) => (
                                  <option key={k} value={k}>
                                    {t}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="block mt-2">
                              Descripción del descuento
                              <input
                                className={INPUT}
                                value={d.naturalezaDescuento || ""}
                                onChange={(e) =>
                                  linea(
                                    n,
                                    "naturalezaDescuento",
                                    e.target.value,
                                  )
                                }
                                maxLength={80}
                              />
                            </label>
                          </>
                        )}
                        {l.esMedicamento && (
                          <>
                            <label className="block mt-2">
                              Registro sanitario
                              <input
                                className={INPUT}
                                value={
                                  d.registroMedicamento ||
                                  l.registroSanitario ||
                                  ""
                                }
                                onChange={(e) =>
                                  linea(
                                    n,
                                    "registroMedicamento",
                                    e.target.value,
                                  )
                                }
                                maxLength={60}
                              />
                            </label>
                            <label className="block mt-2">
                              Forma farmacéutica
                              <input
                                className={INPUT}
                                value={d.formaFarmaceutica || ""}
                                onChange={(e) =>
                                  linea(n, "formaFarmaceutica", e.target.value)
                                }
                                maxLength={3}
                                placeholder="Código de 3 dígitos"
                              />
                            </label>
                          </>
                        )}
                      </div>
                    );
                  })}
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
