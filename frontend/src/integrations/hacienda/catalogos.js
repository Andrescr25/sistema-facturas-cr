// Códigos del anexo 4.4 vigente. La persona elige su correspondencia;
// una tarifa 0% puede tener distinto tratamiento fiscal.
const opciones = (filas) => [
  { valor: "", texto: "Sin configurar" },
  ...filas.map(([valor, texto]) => ({ valor, texto: valor + " · " + texto })),
];
export const TARIFAS = opciones([
  ["01", "0% con derecho a crédito"],
  ["02", "Reducida 1%"],
  ["03", "Reducida 2%"],
  ["04", "Reducida 4%"],
  ["05", "Transitorio 0% (notas)"],
  ["06", "Transitorio 4% (notas)"],
  ["07", "Transitorio 8% (notas)"],
  ["08", "General 13%"],
  ["09", "Reducida 0.5%"],
  ["10", "Exenta"],
  ["11", "0% sin derecho a crédito"],
]);
export const MEDIOS = opciones([
  ["01", "Efectivo"],
  ["02", "Tarjeta"],
  ["03", "Cheque"],
  ["04", "Transferencia o depósito bancario"],
  ["05", "Recaudado por terceros"],
  ["06", "SINPE Móvil"],
  ["07", "Plataforma digital"],
]);
