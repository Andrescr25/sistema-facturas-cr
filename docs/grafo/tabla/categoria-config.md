---
id: tabla/categoria-config
tipo: tabla
titulo: Orden y nombre visible de las categorías de Alegra
estado: vigente
archivos:
  - backend/migrations/add_orden_categorias.sql
  - backend/src/modules/catalogo/categorias.service.js
  - backend/tests/categorias.test.js
aristas:
  relacionado: [tabla/subcategoria, decision/orden-canonico-compartido]
medido: 2026-09-23
---

`categoria_config (categoria PK, nombre_visible, orden, actualizado_en)`.
Las categorías de Alegra son planas y no tienen tabla acá; esta guarda solo
lo que es NUESTRO sobre ellas, colgado del nombre real.

- La categoría real de Alegra nunca cambia por esto: `nombre_visible` es lo
  que se pinta; todo lo que cruza por categoría usa el nombre real.
- `orden` es NULABLE a propósito: renombrar una categoría que nunca se movió
  crea su fila sin orden, y NULL se trata como "todavía no se acomodó". Con
  un default de 0 el renombre la mandaría al principio de todas.
