# Por qué hay una fuente acá

Los PDF se arman con pdfkit, que trae Helvetica incorporada. Helvetica usa la
codificación WinAnsi y **no tiene el símbolo del colón (₡, U+20A1)**: en su
lugar imprime `¡`. El primer PDF de cotización salió con todos los montos
como `¡29.296`.

No se notó antes porque el otro PDF del sistema —la orden de compra al
proveedor— solo lleva cantidades, no montos.

DejaVu Sans sí tiene el glifo y su licencia permite redistribuirla (ver
LICENSE.txt). Se incluye en el repo y no se toma del sistema operativo a
propósito: en Render el contenedor no tiene las mismas fuentes que un Mac, y
el PDF saldría distinto —o roto— en producción.

pdfkit incrusta solo los glifos que se usan, así que el PDF resultante sigue
pesando lo mismo de siempre (~25 KB).
