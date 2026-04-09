import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true }));
app.use(express.json({ limit: '5mb' }));

// ─── Helpers ───
const toSnake = (s) => s.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
const toCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

const rowToCamel = (row) => {
  if (!row) return null;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const ck = toCamel(k);
    if (k === 'docs_entregados') {
      try { out[ck] = JSON.parse(v || '[]'); } catch { out[ck] = []; }
    } else if (typeof v === 'number' && (k === 'pagado' || k === 'entrevista_realizada' || k === 'from_form' || k.endsWith('_completa'))) {
      out[ck] = Boolean(v);
    } else {
      out[ck] = v;
    }
  }
  if (out.fromForm !== undefined) out._fromForm = out.fromForm;
  if (out.formId !== undefined) out._formId = out.formId;
  return out;
};

const camelToRow = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_') && k !== '_formId' && k !== '_fromForm') continue;
    let dk = k === '_formId' ? 'form_id' : k === '_fromForm' ? 'from_form' : toSnake(k);
    if (dk === 'docs_entregados') out[dk] = JSON.stringify(v || []);
    else if (typeof v === 'boolean') out[dk] = v ? 1 : 0;
    else out[dk] = v ?? null;
  }
  return out;
};

function genId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}

// ─── API Routes ───

// List
app.get('/api/solicitudes', (req, res) => {
  const { programa, estado, search } = req.query;
  let sql = 'SELECT * FROM solicitudes WHERE 1=1';
  const p = [];
  if (programa) { sql += ' AND programa = ?'; p.push(programa); }
  if (estado) { sql += ' AND resultado_admision = ?'; p.push(estado); }
  if (search) { sql += ' AND (apellidos LIKE ? OR nombres LIKE ? OR nro_doc LIKE ?)'; const t = `%${search}%`; p.push(t, t, t); }
  sql += ' ORDER BY created_at DESC';
  res.json(db.prepare(sql).all(...p).map(rowToCamel));
});

// Get one
app.get('/api/solicitudes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrada' });
  res.json(rowToCamel(row));
});

// Create
app.post('/api/solicitudes', (req, res) => {
  const data = camelToRow(req.body);
  if (!data.id) data.id = genId();
  if (!data.nro_doc || !data.apellidos || !data.nombres || !data.programa)
    return res.status(400).json({ error: 'Campos obligatorios faltantes' });
  const cols = Object.keys(data);
  try {
    db.prepare(`INSERT INTO solicitudes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(data));
    res.status(201).json(rowToCamel(db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(data.id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Update
app.put('/api/solicitudes/:id', (req, res) => {
  if (!db.prepare('SELECT id FROM solicitudes WHERE id = ?').get(req.params.id))
    return res.status(404).json({ error: 'No encontrada' });
  const data = camelToRow(req.body);
  delete data.id; delete data.created_at;
  data.updated_at = new Date().toISOString();
  const sets = Object.keys(data).map(k => `${k} = ?`).join(', ');
  try {
    db.prepare(`UPDATE solicitudes SET ${sets} WHERE id = ?`).run(...Object.values(data), req.params.id);
    res.json(rowToCamel(db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(req.params.id)));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete
app.delete('/api/solicitudes/:id', (req, res) => {
  const r = db.prepare('DELETE FROM solicitudes WHERE id = ?').run(req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'No encontrada' });
  res.json({ ok: true });
});

// Sync from form (deduplicates)
app.post('/api/solicitudes/sync', (req, res) => {
  const submissions = Array.isArray(req.body) ? req.body : [req.body];
  let inserted = 0, skipped = 0;
  const chkForm = db.prepare('SELECT id FROM solicitudes WHERE form_id = ?');
  const chkDup = db.prepare('SELECT id FROM solicitudes WHERE tipo_doc = ? AND nro_doc = ? AND programa = ?');

  for (const sub of submissions) {
    try {
      if (sub._formId && chkForm.get(sub._formId)) { skipped++; continue; }
      if (sub.nroDoc && chkDup.get(sub.tipoDoc || 'DNI', sub.nroDoc, sub.programa)) { skipped++; continue; }
      const data = mapFormToDb(sub);
      const cols = Object.keys(data);
      db.prepare(`INSERT INTO solicitudes (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(data));
      inserted++;
    } catch (e) { console.error('Sync err:', e.message); skipped++; }
  }
  res.json({ inserted, skipped, total: submissions.length });
});

// Stats
app.get('/api/stats', (req, res) => {
  res.json({
    total: db.prepare('SELECT COUNT(*) as c FROM solicitudes').get().c,
    admitidos: db.prepare("SELECT COUNT(*) as c FROM solicitudes WHERE resultado_admision='Admitido'").get().c,
    pendientes: db.prepare("SELECT COUNT(*) as c FROM solicitudes WHERE resultado_admision='Pendiente'").get().c,
    noAdmitidos: db.prepare("SELECT COUNT(*) as c FROM solicitudes WHERE resultado_admision='No Admitido'").get().c,
    porPrograma: db.prepare('SELECT programa, COUNT(*) as count FROM solicitudes GROUP BY programa ORDER BY count DESC').all(),
    fromForm: db.prepare('SELECT COUNT(*) as c FROM solicitudes WHERE from_form=1').get().c,
  });
});

// ─── MATRÍCULA ───
app.get('/api/matriculas/:solicitudId', (req, res) => {
  const row = db.prepare('SELECT * FROM matriculas WHERE solicitud_id = ?').get(req.params.solicitudId);
  res.json(row || null);
});

app.post('/api/matriculas', (req, res) => {
  const { solicitudId, monto } = req.body;
  const id = genId();
  db.prepare('INSERT INTO matriculas (id, solicitud_id, monto) VALUES (?, ?, ?)').run(id, solicitudId, monto || 0);
  res.status(201).json(db.prepare('SELECT * FROM matriculas WHERE id = ?').get(id));
});

app.put('/api/matriculas/:id', (req, res) => {
  const { pagado, fechaPago, monto, observaciones } = req.body;
  db.prepare('UPDATE matriculas SET pagado=?, fecha_pago=?, monto=?, observaciones=? WHERE id=?')
    .run(pagado ? 1 : 0, fechaPago || null, monto || 0, observaciones || '', req.params.id);
  res.json(db.prepare('SELECT * FROM matriculas WHERE id = ?').get(req.params.id));
});

// ─── CUOTAS ───
app.get('/api/cuotas/:solicitudId', (req, res) => {
  const rows = db.prepare('SELECT * FROM cuotas WHERE solicitud_id = ? ORDER BY anio, mes').all(req.params.solicitudId);
  res.json(rows);
});

// Generate missing monthly cuotas up to current month
app.post('/api/cuotas/generate/:solicitudId', (req, res) => {
  const sol = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(req.params.solicitudId);
  if (!sol || sol.resultado_admision !== 'Admitido') return res.status(400).json({ error: 'Solo para admitidos' });

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  
  // Start from admission or beginning of year
  const startMonth = sol.periodo_ingreso === '2º Semestre' ? 7 : 3; // March or July
  const startYear = sol.anio_lectivo || currentYear;

  const existing = db.prepare('SELECT mes, anio FROM cuotas WHERE solicitud_id = ?').all(req.params.solicitudId);
  const existingSet = new Set(existing.map(e => `${e.anio}-${e.mes}`));

  let inserted = 0;
  let m = startMonth, y = startYear;
  while (y < currentYear || (y === currentYear && m <= currentMonth)) {
    if (m === 1 || m === 2) { m++; if (m > 12) { m = 1; y++; } continue; } // Skip Jan/Feb
    if (!existingSet.has(`${y}-${m}`)) {
      const id = genId();
      const venc = `${y}-${String(m).padStart(2, '0')}-10`;
      db.prepare('INSERT INTO cuotas (id, solicitud_id, mes, anio, monto, fecha_vencimiento) VALUES (?,?,?,?,?,?)')
        .run(id, req.params.solicitudId, m, y, 0, venc);
      inserted++;
    }
    m++;
    if (m > 12) { m = 1; y++; }
  }
  const rows = db.prepare('SELECT * FROM cuotas WHERE solicitud_id = ? ORDER BY anio, mes').all(req.params.solicitudId);
  res.json({ inserted, cuotas: rows });
});

app.put('/api/cuotas/:id', (req, res) => {
  const { pagado, fechaPago, monto, observaciones } = req.body;
  db.prepare('UPDATE cuotas SET pagado=?, fecha_pago=?, monto=?, observaciones=? WHERE id=?')
    .run(pagado ? 1 : 0, fechaPago || null, monto || 0, observaciones || '', req.params.id);
  res.json(db.prepare('SELECT * FROM cuotas WHERE id = ?').get(req.params.id));
});

// ─── PLAN DE ESTUDIOS ───
app.get('/api/plan/:programa', (req, res) => {
  const rows = db.prepare('SELECT * FROM plan_materias WHERE programa = ? ORDER BY anio_cursada, cuatrimestre, orden').all(req.params.programa);
  res.json(rows);
});

app.get('/api/plan', (req, res) => {
  const rows = db.prepare('SELECT DISTINCT programa FROM plan_materias ORDER BY programa').all();
  res.json(rows.map(r => r.programa));
});

// ─── ALUMNO MATERIAS ───
app.get('/api/alumno-materias/:solicitudId', (req, res) => {
  const rows = db.prepare(`
    SELECT am.*, pm.codigo_materia, pm.nombre_materia, pm.anio_cursada, pm.cuatrimestre
    FROM alumno_materias am
    JOIN plan_materias pm ON am.plan_materia_id = pm.id
    WHERE am.solicitud_id = ?
    ORDER BY pm.anio_cursada, pm.cuatrimestre, pm.orden
  `).all(req.params.solicitudId);
  res.json(rows);
});

// Assign all plan materias to a student
app.post('/api/alumno-materias/assign/:solicitudId', (req, res) => {
  const sol = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(req.params.solicitudId);
  if (!sol) return res.status(404).json({ error: 'Solicitud no encontrada' });

  const planMaterias = db.prepare('SELECT * FROM plan_materias WHERE programa = ?').all(sol.programa);
  const existing = db.prepare('SELECT plan_materia_id FROM alumno_materias WHERE solicitud_id = ?').all(req.params.solicitudId);
  const existingSet = new Set(existing.map(e => e.plan_materia_id));

  let inserted = 0;
  for (const pm of planMaterias) {
    if (!existingSet.has(pm.id)) {
      db.prepare('INSERT INTO alumno_materias (id, solicitud_id, plan_materia_id) VALUES (?, ?, ?)')
        .run(genId(), req.params.solicitudId, pm.id);
      inserted++;
    }
  }

  const rows = db.prepare(`
    SELECT am.*, pm.codigo_materia, pm.nombre_materia, pm.anio_cursada, pm.cuatrimestre
    FROM alumno_materias am
    JOIN plan_materias pm ON am.plan_materia_id = pm.id
    WHERE am.solicitud_id = ?
    ORDER BY pm.anio_cursada, pm.cuatrimestre, pm.orden
  `).all(req.params.solicitudId);
  res.json({ inserted, materias: rows });
});

// Update materia status/grade
app.put('/api/alumno-materias/:id', (req, res) => {
  const { estado, nota, fechaAprobacion } = req.body;
  db.prepare('UPDATE alumno_materias SET estado=?, nota=?, fecha_aprobacion=? WHERE id=?')
    .run(estado || 'Pendiente', nota ?? null, fechaAprobacion || null, req.params.id);
  const row = db.prepare(`
    SELECT am.*, pm.codigo_materia, pm.nombre_materia, pm.anio_cursada, pm.cuatrimestre
    FROM alumno_materias am
    JOIN plan_materias pm ON am.plan_materia_id = pm.id
    WHERE am.id = ?
  `).get(req.params.id);
  res.json(row);
});

function mapFormToDb(f) {
  const id = f._formId || genId();
  return {
    id, fecha: f._submittedAt ? f._submittedAt.split('T')[0] : new Date().toISOString().split('T')[0],
    sede: 'Av. Córdoba 374', tipo_doc: f.tipoDoc || 'DNI', nro_doc: f.nroDoc || '',
    cuil: '', pasaporte: f.nroPasaporte || '',
    apellidos: f.apellido || '', nombres: f.nombre || '', programa: f.programa || '',
    dedicacion: 'Full-Time', anio_lectivo: parseInt(f.ingreso) || new Date().getFullYear(),
    plan: `${f.ingreso || new Date().getFullYear()}00`, turno: 'Mañana', vinculo: 'A',
    periodo_ingreso: f.semestre === '2do Semestre' ? '2º Semestre' : '1º Semestre',
    nacionalidad: f.nacionalidad || 'Argentina', fecha_nacimiento: f.fechaNacimiento || '',
    sexo: f.sexo || '', genero_autopercibido: f.generoAutopercibido || '',
    pais_nacimiento: f.nacionalidad || 'Argentina', tel_particular: '',
    tel_transitorio: f.tel2CodPais && f.tel2Numero ? `${f.tel2CodPais} ${f.tel2CodArea} ${f.tel2Numero}` : '',
    celular: f.telCodPais && f.telNumero ? `${f.telCodPais} ${f.telCodArea} ${f.telNumero}` : '',
    email1: f.email || '', email2: '', email_laboral: '',
    dom_calle: f.domCalle || '', dom_numero: f.domNumero || '', dom_piso: f.domPiso || '',
    dom_depto: f.domDepto || '', dom_localidad: f.domLocalidad || '', dom_cp: f.domCP || '',
    dom_provincia: f.domProvincia || '', dom_pais: f.domPais || 'Argentina',
    dom_t_calle: '', dom_t_numero: '', dom_t_piso: '', dom_t_depto: '',
    dom_t_localidad: '', dom_t_cp: '', dom_t_provincia: '', dom_t_pais: '',
    fam1_parentesco: f.fam1?.parentesco || '', fam1_vive: f.fam1?.vive || '',
    fam1_apellidos: f.fam1?.apellido || '', fam1_nombres: f.fam1?.nombre || '',
    fam1_domicilio: '', fam1_ocupacion: f.fam1?.ocupacion || '',
    fam1_educacion: f.fam1?.educacion || '', fam1_ed_completa: f.fam1?.completo ? 1 : 0,
    fam2_parentesco: f.fam2?.parentesco || '', fam2_vive: f.fam2?.vive || '',
    fam2_apellidos: f.fam2?.apellido || '', fam2_nombres: f.fam2?.nombre || '',
    fam2_domicilio: '', fam2_ocupacion: f.fam2?.ocupacion || '',
    fam2_educacion: f.fam2?.educacion || '', fam2_ed_completa: f.fam2?.completo ? 1 : 0,
    edu_nivel: 'Secundario', edu_carrera: '', edu_titulo: '',
    edu_establecimiento: f.colegioNombre || '', edu_desde: f.colegioDesde || '', edu_hasta: f.colegioHasta || '',
    capacidad_ingles: f.inglesNivel || '', actividades: f.actividades || '',
    observaciones: '', premios: f.premios || '',
    rp_apellidos: f.rpApellido || '', rp_nombres: f.rpNombre || '',
    rp_tel_fijo: f.rpTelOtro || '', rp_celular: f.rpTelCelular || '', rp_email: f.rpEmail || '',
    resultado_admision: 'Pendiente', metodo_admision: '', fecha_admision: '',
    calificacion_examen: '', calificacion_antecedentes: '', calificacion_entrevista: '',
    nota_global: '', nota_lecto_comprension: '', nota_matematica: '', obs_admision: '',
    fecha_entrevista: '', entrevista_realizada: 0, docs_entregados: '[]', pagado: 0,
    from_form: 1, form_id: f._formId || id,
  };
}

// ─── Serve SIGEU Frontend ───
// In production, serve the built HTML from public/
// The SIGEU React app is embedded as a single HTML file
app.use(express.static(join(__dirname, '..', 'public')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  🟢 SIGEU corriendo en http://localhost:${PORT}\n`);
});
