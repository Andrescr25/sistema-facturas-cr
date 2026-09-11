#!/usr/bin/env bash
# Refresca la copia local de producción para la rama independencia-alegra.
#
#   LEE producción con pg_dump (solo lectura) y REEMPLAZA la base del
#   contenedor local tachi-db-local. Nunca escribe en producción: el único
#   destino posible es ese contenedor.
#
#   Deja fuera las tablas de la API de WhatsApp (Evolution, nombres con
#   mayúscula inicial): no las usa el sistema y son conversaciones privadas.
#
#   Después vuelve a aplicar las migraciones de esta rama
#   (migrations/independencia/*.sql), que producción no tiene.
#
# Uso:  scripts/db-local/refrescar-copia.sh --si
set -euo pipefail


# comparar_conteos PROD LOCAL
#   Cada archivo trae líneas "tabla=filas". Sale con 1 si falta alguna tabla
#   de producción en la copia o si alguna tiene otro número de filas.
comparar_conteos() {
  awk -F= '
    NR == FNR { prod[$1] = $2; next }
    { local_[$1] = $2 }
    END {
      faltan = 0; distintas = 0; total = 0; tablas = 0
      for (t in prod) {
        tablas++; total += prod[t]
        if (!(t in local_)) { print "  falta en la copia: " t; faltan++ }
        else if (prod[t] != local_[t]) { print "  " t ": producción " prod[t] " · copia " local_[t]; distintas++ }
      }
      if (faltan || distintas) {
        print "✗ " faltan " tablas faltantes y " distintas " con otras filas (si producción recibió datos durante la copia, repetir)"
        exit 1
      }
      print "✓ Copia lista: " tablas " tablas con las mismas filas que producción (" total " filas)."
    }
  ' "$1" "$2"
}

CONTENEDOR=tachi-db-local
BASE=tachi
USUARIO=tachi

if [ "${1:-}" != "--si" ]; then
  echo "Esto BORRA la base local '$BASE' del contenedor $CONTENEDOR y la vuelve a llenar con producción."
  echo "Para seguir:  $0 --si"
  exit 1
fi

cd "$(dirname "$0")/../.."   # backend/

docker ps --format '{{.Names}}' | grep -qx "$CONTENEDOR" || { echo "El contenedor $CONTENEDOR no está corriendo."; exit 1; }

# Origen: la base de producción de .env (NO .env.aislado), por el pooler de
# sesión (puerto 5432): el de transacción (6543) no sirve para pg_dump.
PGURL="$(node -e "
  require('dotenv').config({ path: '.env', quiet: true });
  const u = new URL(process.env.DATABASE_URL);
  if (['localhost','127.0.0.1','::1','[::1]'].includes(u.hostname)) { process.stderr.write('.env apunta a una base local: no hay de dónde copiar\n'); process.exit(2); }
  u.port = '5432';
  u.searchParams.delete('pgbouncer');
  u.searchParams.delete('connection_limit');
  if (!u.searchParams.get('sslmode')) u.searchParams.set('sslmode', 'require');
  process.stdout.write(u.toString());
")"
export PGURL

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Listando tablas de WhatsApp para dejarlas fuera…"
EXCLUIR="$(docker run --rm -e PGURL postgres:17 sh -c 'psql "$PGURL" -tAc "SELECT string_agg(format(\$f\$--exclude-table=public.%I\$f\$, table_name), '"' '"') FROM information_schema.tables WHERE table_schema='"'public'"' AND table_name ~ '"'^[A-Z]'"'"')"

echo "→ Copiando producción (solo lectura)…"
# shellcheck disable=SC2086
docker run --rm -e PGURL -v "$TMP":/out postgres:17 \
  sh -c 'exec pg_dump -d "$PGURL" -Fc -n public --no-owner --no-privileges -f /out/copia.dump "$@"' sh $EXCLUIR

echo "→ Reemplazando la base local…"
docker exec "$CONTENEDOR" psql -U "$USUARIO" -d postgres -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS $BASE WITH (FORCE)" -c "CREATE DATABASE $BASE OWNER $USUARIO"
docker cp "$TMP/copia.dump" "$CONTENEDOR":/tmp/copia.dump
# El único error esperado es "schema public already exists".
docker exec "$CONTENEDOR" pg_restore -U "$USUARIO" -d "$BASE" --no-owner --no-privileges /tmp/copia.dump 2>"$TMP/restore.log" || true
docker exec "$CONTENEDOR" rm -f /tmp/copia.dump
INESPERADOS="$(grep 'error:' "$TMP/restore.log" | grep -vc 'schema "public" already exists' || true)"
if [ "$INESPERADOS" != "0" ]; then echo "pg_restore tuvo $INESPERADOS errores inesperados:"; grep 'error:' "$TMP/restore.log"; exit 1; fi

echo "→ Aplicando migraciones de la rama…"
for f in migrations/independencia/*.sql; do
  [ -e "$f" ] || continue
  echo "   $f"
  docker exec -i "$CONTENEDOR" psql -U "$USUARIO" -d "$BASE" -v ON_ERROR_STOP=1 -q < "$f"
done

echo "→ Comparando filas por tabla con producción…"
CONTEO="SELECT table_name||'='||(xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name !~ '^[A-Z]' ORDER BY 1"
docker run --rm -e PGURL -e CONTEO="$CONTEO" postgres:17 sh -c 'psql "$PGURL" -tAc "$CONTEO"' | sort > "$TMP/prod.txt"
docker exec "$CONTENEDOR" psql -U "$USUARIO" -d "$BASE" -tAc "$CONTEO" | sort > "$TMP/local.txt"
# Las tablas propias de la rama no existen en producción: se comparan solo
# las que tiene producción. Sin `join`, que en macOS no acepta la misma
# sintaxis que en Linux y fallaba sin comparar nada.
if ! RESULTADO="$(comparar_conteos "$TMP/prod.txt" "$TMP/local.txt")"; then
  echo "$RESULTADO"
  exit 1
fi
echo "$RESULTADO"
