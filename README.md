# SIGEU — Sistema de Gestión Universitaria (UCEMA)

## Deploy en Render (paso a paso)

### Paso 1: Subir a GitHub
1. Creá un repositorio nuevo en GitHub (público o privado)
2. Subí toda esta carpeta al repo

### Paso 2: Deploy del Backend (Web Service)
1. En Render → "New" → "Web Service"
2. Conectá tu repo de GitHub
3. Configurá:
   - **Name**: `sigeu-backend`
   - **Root Directory**: `sigeu-backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Plan**: Free
4. En "Environment Variables" agregá:
   - `NODE_ENV` = `production`
5. Dale "Create Web Service"
6. Esperá a que buildee. Anotá la URL (ej: `https://sigeu-backend-xxxx.onrender.com`)

### Paso 3: Deploy del Formulario (Static Site)
1. En Render → "New" → "Static Site"
2. Conectá el mismo repo
3. Configurá:
   - **Name**: `sigeu-form`
   - **Root Directory**: `sigeu-form`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. En "Environment Variables" agregá:
   - `VITE_API_URL` = `https://sigeu-backend-xxxx.onrender.com` (la URL del paso 2)
5. Dale "Create Static Site"

### Paso 4: Probar
- Abrí la URL del Static Site → es el formulario público
- Abrí la URL del Web Service → es el panel SIGEU
- Completá el formulario → aparece en el SIGEU

### Notas
- El plan Free de Render duerme el servicio tras 15 min de inactividad. La primera visita tarda ~30 seg en despertar.
- SQLite se guarda en `/tmp` en el Free plan, así que los datos se borran en cada redeploy. Para persistencia real, podés agregar un Render Disk o migrar a PostgreSQL.
