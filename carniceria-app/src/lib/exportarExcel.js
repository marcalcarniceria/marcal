import * as XLSX from 'xlsx'

// `hojas`: [{ nombre, filas: [objeto plano, ...] }] -- cada fila es un
// objeto { "Nombre de columna": valor }, ya en el formato final que se
// quiere ver en Excel (sin IDs internos ni formato de la UI).
export function descargarExcel(nombreArchivo, hojas) {
  const libro = XLSX.utils.book_new()

  for (const hoja of hojas) {
    const datos = hoja.filas.length > 0 ? hoja.filas : [{}]
    const planilla = XLSX.utils.json_to_sheet(datos)
    // Los nombres de hoja de Excel no soportan más de 31 caracteres.
    XLSX.utils.book_append_sheet(libro, planilla, hoja.nombre.slice(0, 31))
  }

  XLSX.writeFile(libro, nombreArchivo)
}
