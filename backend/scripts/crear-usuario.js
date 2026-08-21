#!/usr/bin/env node
/**
 * Crea un usuario del sistema.
 *
 *   node scripts/crear-usuario.js <usuario> "<Nombre Completo>" <contraseña>
 *
 * La contraseña se pide por argumento y no se guarda en ningún lado: se
 * convierte en hash bcrypt y lo que se escribe en la base es el hash.
 *
 * OJO: la base local es la MISMA de producción (Supabase compartido con
 * Render). El usuario que se cree acá sirve para entrar en producción, así
 * que no conviene usar contraseñas de prueba.
 */

require('dotenv').config();
const { crearUsuario } = require('../src/modules/auth/auth.service');

async function main() {
  const [usuario, nombre, password] = process.argv.slice(2);

  if (!usuario || !nombre || !password) {
    console.error('Uso: node scripts/crear-usuario.js <usuario> "<Nombre Completo>" <contraseña>');
    console.error('Ejemplo: node scripts/crear-usuario.js jose "José Vargas" unaClaveLarga123');
    process.exit(1);
  }

  try {
    const creado = await crearUsuario({ usuario, nombre, password });
    console.log(`✅ Usuario creado: ${creado.usuario} (${creado.nombre})`);
    console.log('   Ya podés entrar al sistema con esas credenciales.');
    process.exit(0);
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exit(1);
  }
}

main();
