/**
 * Genera el hash de contraseña para ADMIN_PASSWORD_HASH en .env
 * Uso: npx tsx scripts/hash-password.ts "tu-contraseña"
 */
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error('Uso: npx tsx scripts/hash-password.ts "tu-contraseña"');
  process.exit(1);
}

bcrypt.hash(password, 10).then((hash) => {
  // Next.js expande variables tipo $VAR en los .env (como dotenv-expand). Los
  // hashes de bcrypt están llenos de "$" (ej. $2a$10$...), así que sin escapar
  // cada uno con "\$" el valor se corrompe silenciosamente al cargarse y el
  // login falla con "Credenciales incorrectas" aunque el hash sea correcto.
  const escapedForEnv = hash.replace(/\$/g, "\\$");
  console.log("\nCopiá esta línea a tu .env (los \\$ son necesarios, no los saques):\n");
  console.log(`ADMIN_PASSWORD_HASH="${escapedForEnv}"\n`);
});
