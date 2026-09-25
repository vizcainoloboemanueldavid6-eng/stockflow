# Desplegar StockFlow: Neon + GitHub + Vercel

Guía paso a paso con los comandos exactos. Todo lo que se usa aquí tiene plan gratuito
(Neon Free, GitHub, Vercel Hobby). Los comandos funcionan en PowerShell y en Git Bash; cuando la
sintaxis cambia se muestran las dos versiones.

Hay dos caminos:

- **A. Vercel + Neon (recomendado):** los datos persisten. Pasos 1 a 6.
- **B. Demo sin base de datos (SQLite efímero):** un enlace público en cinco minutos, con los
  datos reiniciándose en cada arranque en frío. Paso 7.

---

## 0. Requisitos (una sola vez)

```bash
node -v                  # 20.19 o superior (22 o 24 recomendado)
git --version
npm install -g vercel    # CLI de Vercel (o usa "npx vercel@latest" en cada comando)
vercel login             # abre el navegador; inicia sesión con tu cuenta (puede ser la de GitHub)
```

Genera dos secretos y guárdalos en un lugar seguro (no los subas a Git):

```bash
node -e "console.log(require('crypto').randomBytes(33).toString('base64'))"   # AUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # CRON_SECRET
```

(Funcionan igual en PowerShell y en Git Bash. Alternativas: `npx auth secret` y
`openssl rand -base64 33`.)

---

## 1. Subir el código a GitHub

1. Crea un repositorio **vacío** en <https://github.com/new> llamado `stockflow` (sin README,
   sin .gitignore, sin licencia: el proyecto ya los trae).
2. Desde la carpeta del proyecto:

```bash
cd stockflow
git status                                   # debe decir "nothing to commit, working tree clean"
git remote add origin https://github.com/TU_USUARIO/stockflow.git
git push -u origin main
```

Si tienes GitHub CLI, los pasos 1 y 2 son un solo comando:

```bash
gh repo create stockflow --private --source . --remote origin --push
```

> `.env` está en `.gitignore`: tus secretos no se suben. Solo se sube `.env.example`.

---

## 2. Crear la base de datos gratis en Neon

Elige **una** de estas dos formas.

### Opción 2a: desde Vercel Marketplace (la más corta)

Primero vincula el proyecto (paso 3) y luego:

```bash
vercel integration add neon
```

El asistente crea la base de datos en tu cuenta de Vercel (plan Free), la conecta al proyecto y
añade las variables `DATABASE_URL` (conexión con pooler) y `DATABASE_URL_UNPOOLED` (conexión
directa) a los entornos Production, Preview y Development. Compruébalo con:

```bash
vercel env ls
```

Si prefieres el navegador: Vercel → tu proyecto → **Storage** → **Create Database** → **Neon** →
Free → Connect.

### Opción 2b: con la consola o la CLI de Neon

Consola web: <https://console.neon.tech> → **New project** → nombre `stockflow`, Postgres 16,
región cercana a tus usuarios (por ejemplo `AWS US East (N. Virginia)`) → **Create**. En
**Connect** copia dos cadenas de conexión:

- con **Connection pooling** activado (el host contiene `-pooler`) → será `DATABASE_URL`;
- con **Connection pooling** desactivado → será `DATABASE_URL_UNPOOLED`.

Con la CLI (`neonctl`):

```bash
npx neonctl auth                                          # abre el navegador
npx neonctl projects create --name stockflow --region-id aws-us-east-1
npx neonctl projects list                                 # copia el "id" del proyecto
npx neonctl connection-string --project-id ID_DEL_PROYECTO --pooled   # -> DATABASE_URL
npx neonctl connection-string --project-id ID_DEL_PROYECTO            # -> DATABASE_URL_UNPOOLED
```

Ambas cadenas deben terminar en `?sslmode=require` (Neon lo incluye). Tienen este aspecto:

```
postgresql://neondb_owner:CLAVE@ep-xxxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require
postgresql://neondb_owner:CLAVE@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

---

## 3. Crear y vincular el proyecto en Vercel

```bash
vercel link              # "Set up and link?" -> Yes; elige tu cuenta; "Link to existing project?" -> No;
                         # nombre: stockflow; directorio: ./  (Vercel detecta Next.js)
vercel git connect       # conecta el repositorio de GitHub: cada push a main desplegará solo
```

`vercel.json` ya define el comando de build (`npm run build`) y el cron diario del reinicio de la
demo, así que no hace falta tocar la configuración del proyecto.

---

## 4. Variables de entorno en Vercel

`vercel env add` pide el valor por teclado. Para cada variable, repite el comando para
`production` y, si quieres despliegues de prueba, para `preview`.

```bash
vercel env add AUTH_SECRET production        # pega el secreto del paso 0
vercel env add CRON_SECRET production        # pega el otro secreto del paso 0
vercel env add APP_TIME_ZONE production      # por ejemplo: America/Bogota
```

Solo si creaste la base con la opción 2b (con la 2a ya existen):

```bash
vercel env add DATABASE_URL production            # cadena CON -pooler
vercel env add DATABASE_URL_UNPOOLED production   # cadena SIN -pooler
```

También puedes pasar el valor por tubería, sin escribirlo en el teclado:

```bash
# Git Bash
printf '%s' 'America/Bogota' | vercel env add APP_TIME_ZONE production
# PowerShell
'America/Bogota' | vercel env add APP_TIME_ZONE production
```

Resumen de variables (modo Neon):

| Variable                | Obligatoria    | Para qué                                                           |
| ----------------------- | -------------- | ------------------------------------------------------------------ |
| `DATABASE_URL`          | sí             | Conexión con pooler que usa la app                                  |
| `DATABASE_URL_UNPOOLED` | recomendada    | Conexión directa para las migraciones y la primera carga de datos   |
| `AUTH_SECRET`           | sí             | Firma las sesiones                                                 |
| `CRON_SECRET`           | para la demo   | Protege `/api/cron/reset-demo`                                     |
| `APP_TIME_ZONE`         | recomendada    | Qué es "hoy" en el dashboard (Vercel funciona en UTC)              |
| `ALLOW_REGISTRATION`    | no             | `false` cierra el registro público                                 |
| `DEMO_ENABLED`          | no             | `false` en un negocio real (ver abajo)                             |
| `SEED_ADMIN_PASSWORD`   | con demo apagada | Contraseña del admin creado en la primera carga                  |
| `SEED_STAFF_PASSWORD`   | con demo apagada | Contraseña del usuario Staff creado en la primera carga          |

No hace falta `AUTH_TRUST_HOST` ni `AUTH_URL` en Vercel (ni `TRUST_PROXY`: Vercel ya entrega la IP
real del visitante al límite de intentos de inicio de sesión).

**Para un negocio real** pon `DEMO_ENABLED=false` **y** `SEED_ADMIN_PASSWORD` y
`SEED_STAFF_PASSWORD` (contraseñas propias) **antes del primer despliegue**. Con la demo apagada:
no hay botón "Try the demo", el cron no reinicia nada, la carga inicial no crea la cuenta demo (y
borra una que exista), una cuenta con rol Demo no puede entrar aunque conozca la contraseña, y la
carga inicial se niega a ejecutarse (el build falla con un mensaje claro) si falta alguna de las dos
contraseñas, para no dejar las contraseñas publicadas en el README.

Con la demo encendida, las tres cuentas sembradas son **compartidas**: nadie, ni el admin, puede
borrarlas ni cambiarles el rol, la contraseña o el email, para que ningún visitante bloquee los
accesos publicados.

---

## 5. Migraciones y datos de ejemplo en Neon

**Automático:** en Vercel, `npm run build` ejecuta `prisma migrate deploy` y después carga los
datos de ejemplo **solo si la base no tiene usuarios** (usa `DATABASE_URL_UNPOOLED` si existe).
El primer despliegue deja la base lista; los siguientes nunca la sobrescriben.

**Manual (desde tu computador, opcional):** útil para comprobar la conexión antes de desplegar o
para volver a cargar los datos. Usa la cadena **directa** (sin `-pooler`):

```bash
# Git Bash
export DATABASE_URL="postgresql://neondb_owner:CLAVE@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npm run db:seed            # o: npm run db:reset-demo (borra también las cuentas extra)
```

```powershell
# PowerShell
$env:DATABASE_URL = "postgresql://neondb_owner:CLAVE@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require"
npx prisma migrate deploy
npm run db:seed
Remove-Item Env:DATABASE_URL   # vuelve a usar la base local de .env
```

Con la opción 2a puedes traer las variables de Vercel a un archivo local y usarlas igual:

```bash
vercel env pull .env.neon --environment=production   # .env.* está en .gitignore
```

> `npm run db:seed` reemplaza productos, movimientos, categorías y proveedores por los datos de
> ejemplo. No lo ejecutes contra una base con datos reales.

---

## 6. Desplegar

```bash
vercel --prod
```

Al terminar, la CLI muestra la URL (`https://stockflow-xxxx.vercel.app`). Entra con
`demo@stockflow.test` / `Demo#2026` o con el botón **Try the demo**.

Desde ahora, cada `git push` a `main` despliega a producción y cada rama genera un preview:

```bash
git add -A
git commit -m "feat: ..."
git push
```

Comprobar el cron del reinicio de la demo a mano:

```bash
curl -H "Authorization: Bearer TU_CRON_SECRET" https://stockflow-xxxx.vercel.app/api/cron/reset-demo
```

Ver los logs si algo falla:

```bash
vercel logs https://stockflow-xxxx.vercel.app
```

---

## 7. Alternativa: demo sin base de datos (SQLite efímero)

Sirve para tener un enlace público antes de crear Neon. Solo dos variables:

```bash
vercel link
vercel env add DATABASE_PROVIDER production    # escribe: sqlite
vercel env add AUTH_SECRET production
vercel --prod
```

El build crea y llena un archivo SQLite y lo incluye en cada función; cada instancia trabaja
sobre una copia en `/tmp`. Es una demo, no una base de datos: los cambios se pierden en cada
arranque en frío y dos visitantes pueden ver datos distintos (la app muestra un aviso). Las fechas
de los datos no envejecen: si el build se hizo otro día (o hace más de una hora), cada arranque en
frío vuelve a generar los datos para el momento actual antes de la primera consulta, así que la
gráfica de 30 días y los movimientos de hoy siempre tienen datos. Para pasar
a Neon: crea la base (paso 2), añade `DATABASE_URL` y `DATABASE_URL_UNPOOLED`, borra
`DATABASE_PROVIDER` y vuelve a desplegar:

```bash
vercel env rm DATABASE_PROVIDER production
vercel --prod
```
