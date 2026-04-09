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

  -- Matrícula: pago único al ser admitido
  CREATE TABLE IF NOT EXISTS matriculas (
    id TEXT PRIMARY KEY,
    solicitud_id TEXT NOT NULL,
    monto REAL DEFAULT 0,
    pagado INTEGER DEFAULT 0,
    fecha_pago TEXT,
    observaciones TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE
  );

  -- Cuotas mensuales
  CREATE TABLE IF NOT EXISTS cuotas (
    id TEXT PRIMARY KEY,
    solicitud_id TEXT NOT NULL,
    mes INTEGER NOT NULL,
    anio INTEGER NOT NULL,
    monto REAL DEFAULT 0,
    pagado INTEGER DEFAULT 0,
    fecha_pago TEXT,
    fecha_vencimiento TEXT,
    observaciones TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_cuotas_sol ON cuotas(solicitud_id);

  -- Planes de estudio con materias predeterminadas
  CREATE TABLE IF NOT EXISTS plan_materias (
    id TEXT PRIMARY KEY,
    programa TEXT NOT NULL,
    codigo_materia TEXT NOT NULL,
    nombre_materia TEXT NOT NULL,
    anio_cursada INTEGER DEFAULT 1,
    cuatrimestre INTEGER DEFAULT 1,
    orden INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_plan_prog ON plan_materias(programa);

  -- Materias asignadas a alumnos
  CREATE TABLE IF NOT EXISTS alumno_materias (
    id TEXT PRIMARY KEY,
    solicitud_id TEXT NOT NULL,
    plan_materia_id TEXT NOT NULL,
    estado TEXT DEFAULT 'Pendiente',
    nota REAL,
    fecha_aprobacion TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_materia_id) REFERENCES plan_materias(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_almat_sol ON alumno_materias(solicitud_id);
`);

// ─── Seed plan de estudios si está vacío ───
const planCount = db.prepare('SELECT COUNT(*) as c FROM plan_materias').get().c;
if (planCount === 0) {
  const programas = ['ABOG','ACTU','BA','CCP','LIE','LIA','LIMA','LFIN','ININF N','LIND','LICP','LIRI','LIEN','LIAN'];
  const materias = [
    // Año 1
    { cod: 'MAT01', nombre: 'Introducción al Pensamiento Científico', anio: 1, cuat: 1 },
    { cod: 'MAT02', nombre: 'Matemática I', anio: 1, cuat: 1 },
    { cod: 'MAT03', nombre: 'Introducción a la Economía', anio: 1, cuat: 1 },
    { cod: 'MAT04', nombre: 'Historia Económica y Social', anio: 1, cuat: 1 },
    { cod: 'MAT05', nombre: 'Inglés I', anio: 1, cuat: 1 },
    { cod: 'MAT06', nombre: 'Matemática II', anio: 1, cuat: 2 },
    { cod: 'MAT07', nombre: 'Microeconomía I', anio: 1, cuat: 2 },
    { cod: 'MAT08', nombre: 'Contabilidad I', anio: 1, cuat: 2 },
    { cod: 'MAT09', nombre: 'Derecho Civil', anio: 1, cuat: 2 },
    { cod: 'MAT10', nombre: 'Inglés II', anio: 1, cuat: 2 },
    // Año 2
    { cod: 'MAT11', nombre: 'Estadística I', anio: 2, cuat: 1 },
    { cod: 'MAT12', nombre: 'Macroeconomía I', anio: 2, cuat: 1 },
    { cod: 'MAT13', nombre: 'Administración General', anio: 2, cuat: 1 },
    { cod: 'MAT14', nombre: 'Derecho Comercial', anio: 2, cuat: 1 },
    { cod: 'MAT15', nombre: 'Inglés III', anio: 2, cuat: 1 },
    { cod: 'MAT16', nombre: 'Estadística II', anio: 2, cuat: 2 },
    { cod: 'MAT17', nombre: 'Finanzas I', anio: 2, cuat: 2 },
    { cod: 'MAT18', nombre: 'Marketing I', anio: 2, cuat: 2 },
    { cod: 'MAT19', nombre: 'Sistemas de Información', anio: 2, cuat: 2 },
    { cod: 'MAT20', nombre: 'Inglés IV', anio: 2, cuat: 2 },
    // Año 3
    { cod: 'MAT21', nombre: 'Econometría', anio: 3, cuat: 1 },
    { cod: 'MAT22', nombre: 'Finanzas II', anio: 3, cuat: 1 },
    { cod: 'MAT23', nombre: 'Recursos Humanos', anio: 3, cuat: 1 },
    { cod: 'MAT24', nombre: 'Ética Profesional', anio: 3, cuat: 1 },
    { cod: 'MAT25', nombre: 'Materia Electiva I', anio: 3, cuat: 1 },
    { cod: 'MAT26', nombre: 'Economía Internacional', anio: 3, cuat: 2 },
    { cod: 'MAT27', nombre: 'Estrategia Empresarial', anio: 3, cuat: 2 },
    { cod: 'MAT28', nombre: 'Derecho Tributario', anio: 3, cuat: 2 },
    { cod: 'MAT29', nombre: 'Materia Electiva II', anio: 3, cuat: 2 },
    { cod: 'MAT30', nombre: 'Seminario de Tesis', anio: 3, cuat: 2 },
  ];

  const insert = db.prepare('INSERT INTO plan_materias (id, programa, codigo_materia, nombre_materia, anio_cursada, cuatrimestre, orden) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const seed = db.transaction(() => {
    let orden = 0;
    for (const prog of programas) {
      for (const m of materias) {
        const id = `${prog}-${m.cod}`;
        insert.run(id, prog, m.cod, m.nombre, m.anio, m.cuat, orden++);
      }
    }
  });
  seed();
  console.log(`  📚 Plan de estudios seeded: ${programas.length} programas × ${materias.length} materias`);
}

export default db;
