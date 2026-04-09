import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use /tmp on Render free tier, or ./data locally
const DB_DIR = process.env.NODE_ENV === 'production' ? '/tmp' : join(__dirname, '..', 'data');
const DB_PATH = join(DB_DIR, 'sigeu.db');

if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS solicitudes (
    id TEXT PRIMARY KEY,
    fecha TEXT,
    sede TEXT DEFAULT 'Av. Córdoba 374',
    tipo_doc TEXT DEFAULT 'DNI',
    nro_doc TEXT NOT NULL,
    cuil TEXT,
    pasaporte TEXT,
    apellidos TEXT NOT NULL,
    nombres TEXT NOT NULL,
    programa TEXT NOT NULL,
    dedicacion TEXT DEFAULT 'Full-Time',
    anio_lectivo INTEGER,
    plan TEXT,
    turno TEXT DEFAULT 'Mañana',
    vinculo TEXT DEFAULT 'A',
    periodo_ingreso TEXT DEFAULT '1º Semestre',
    nacionalidad TEXT DEFAULT 'Argentina',
    fecha_nacimiento TEXT,
    sexo TEXT,
    genero_autopercibido TEXT,
    pais_nacimiento TEXT DEFAULT 'Argentina',
    tel_particular TEXT,
    tel_transitorio TEXT,
    celular TEXT,
    email1 TEXT,
    email2 TEXT,
    email_laboral TEXT,
    dom_calle TEXT, dom_numero TEXT, dom_piso TEXT, dom_depto TEXT,
    dom_localidad TEXT, dom_cp TEXT, dom_provincia TEXT, dom_pais TEXT DEFAULT 'Argentina',
    dom_t_calle TEXT, dom_t_numero TEXT, dom_t_piso TEXT, dom_t_depto TEXT,
    dom_t_localidad TEXT, dom_t_cp TEXT, dom_t_provincia TEXT, dom_t_pais TEXT,
    fam1_parentesco TEXT, fam1_vive TEXT, fam1_apellidos TEXT, fam1_nombres TEXT,
    fam1_domicilio TEXT, fam1_ocupacion TEXT, fam1_educacion TEXT, fam1_ed_completa INTEGER DEFAULT 0,
    fam2_parentesco TEXT, fam2_vive TEXT, fam2_apellidos TEXT, fam2_nombres TEXT,
    fam2_domicilio TEXT, fam2_ocupacion TEXT, fam2_educacion TEXT, fam2_ed_completa INTEGER DEFAULT 0,
    edu_nivel TEXT, edu_carrera TEXT, edu_titulo TEXT, edu_establecimiento TEXT,
    edu_desde TEXT, edu_hasta TEXT,
    capacidad_ingles TEXT, actividades TEXT, observaciones TEXT, premios TEXT,
    rp_apellidos TEXT, rp_nombres TEXT, rp_tel_fijo TEXT, rp_celular TEXT, rp_email TEXT,
    resultado_admision TEXT DEFAULT 'Pendiente',
    metodo_admision TEXT, fecha_admision TEXT,
    calificacion_examen TEXT, calificacion_antecedentes TEXT, calificacion_entrevista TEXT,
    nota_global TEXT, nota_lecto_comprension TEXT, nota_matematica TEXT,
    obs_admision TEXT,
    fecha_entrevista TEXT, entrevista_realizada INTEGER DEFAULT 0,
    docs_entregados TEXT DEFAULT '[]',
    pagado INTEGER DEFAULT 0,
    from_form INTEGER DEFAULT 0,
    form_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_sol_programa ON solicitudes(programa);
  CREATE INDEX IF NOT EXISTS idx_sol_nro_doc ON solicitudes(nro_doc);
  CREATE INDEX IF NOT EXISTS idx_sol_estado ON solicitudes(resultado_admision);
  CREATE INDEX IF NOT EXISTS idx_sol_form_id ON solicitudes(form_id);
`);

export default db;
