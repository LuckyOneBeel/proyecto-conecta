const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

const SUMSUB_BASE_URL = 'https://api.sumsub.com';

// Cliente firmado con HMAC-SHA256 según especificación oficial de Sumsub
async function llamarApiSumsub(metodo, ruta, cuerpo = null) {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;

  if (!appToken || !secretKey) {
    throw new Error('Faltan SUMSUB_APP_TOKEN o SUMSUB_SECRET_KEY en el archivo .env');
  }

  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyStr = cuerpo ? JSON.stringify(cuerpo) : '';

  const firma = crypto
    .createHmac('sha256', secretKey)
    .update(ts + metodo.toUpperCase() + ruta + bodyStr)
    .digest('hex');

  const headers = {
    Accept: 'application/json',
    'X-App-Token': appToken,
    'X-App-Access-Ts': ts,
    'X-App-Access-Sig': firma,
  };

  if (cuerpo) {
    headers['Content-Type'] = 'application/json';
  }

  const respuesta = await fetch(`${SUMSUB_BASE_URL}${ruta}`, {
    method: metodo,
    headers,
    body: bodyStr || undefined,
  });

  const texto = await respuesta.text();
  let data = null;
  try {
    data = texto ? JSON.parse(texto) : null;
  } catch {
    data = { raw: texto };
  }

  return { ok: respuesta.ok, status: respuesta.status, data };
}

// Crea o recupera un candidato en Sumsub Sandbox y emite un token temporal de WebSDK
async function prepararCandidatoYTokenSumsub({ tutorId, nombre, email }) {
  const levelName = process.env.SUMSUB_LEVEL_NAME || 'id-and-liveness';
  const externalUserId = `conecta-tutor-${tutorId}`;

  let applicantId = null;

  const crearRes = await llamarApiSumsub(
    'POST',
    `/resources/applicants?levelName=${encodeURIComponent(levelName)}`,
    {
      externalUserId,
      email,
      fixedInfo: {
        firstName: nombre,
      },
    }
  );

  if (crearRes.ok && crearRes.data?.id) {
    applicantId = crearRes.data.id;
  } else if (crearRes.status === 409) {
    // El candidato ya existe en Sumsub: lo recuperamos por su externalUserId
    const existenteRes = await llamarApiSumsub(
      'GET',
      `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`
    );
    if (existenteRes.ok && existenteRes.data?.id) {
      applicantId = existenteRes.data.id;
    } else {
      throw new Error(`No se pudo recuperar el candidato existente en Sumsub: ${JSON.stringify(existenteRes.data)}`);
    }
  } else {
    throw new Error(`Error al crear candidato en Sumsub (${crearRes.status}): ${JSON.stringify(crearRes.data)}`);
  }

  const tokenRes = await llamarApiSumsub(
    'POST',
    `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=600`
  );

  if (!tokenRes.ok || !tokenRes.data?.token) {
    throw new Error(`Error al generar token WebSDK en Sumsub (${tokenRes.status}): ${JSON.stringify(tokenRes.data)}`);
  }

  return {
    applicantId,
    sdkToken: tokenRes.data.token,
    levelName,
  };
}

// 1. Consultar el estado KYC del tutor autenticado
router.get('/mi-estado', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Acceso exclusivo para tutores.' });
  }

  try {
    const resultado = await pool.query(
      `SELECT id AS tutor_id, especialidad, tarifa_hora, rut, estado_kyc,
              documentos_validados, sumsub_applicant_id, url_documento,
              observacion_kyc, fecha_solicitud_kyc,sumsub_veredicto
       FROM Tutores
       WHERE usuario_id = $1`,
      [req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.json({ perfil_incompleto: true, modo_sumsub: process.env.SUMSUB_MODO || 'simulado' });
    }

    res.json({
      perfil_incompleto: false,
      modo_sumsub: process.env.SUMSUB_MODO || 'simulado',
      ...resultado.rows[0],
    });
  } catch (error) {
    console.error('Error al consultar estado KYC:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// 2. Enviar solicitud de validación KYC (Tutor)
router.post('/solicitar', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Solo los tutores pueden solicitar verificación KYC.' });
  }

  const { rut, url_documento } = req.body;

  if (!rut || !url_documento) {
    return res.status(400).json({
      error: 'Debes ingresar tu RUT y el enlace o referencia de tu documento académico/identidad.',
    });
  }

  const rutLimpio = rut.trim().toUpperCase();
  const formatoRutValido = /^[0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9K]$/.test(rutLimpio);
  if (!formatoRutValido) {
    return res.status(400).json({
      error: 'Formato de RUT inválido. Ejemplo válido: 12.345.678-9 o 12345678-K.',
    });
  }

  try {
    const tutorRes = await pool.query(
      `SELECT t.id, t.estado_kyc, u.nombre, u.email
       FROM Tutores t
       INNER JOIN Usuarios u ON u.id = t.usuario_id
       WHERE t.usuario_id = $1`,
      [req.usuario.id]
    );

    if (tutorRes.rows.length === 0) {
      return res.status(400).json({
        error: 'Primero completa tu especialidad y tarifa en "Perfil y Horarios".',
      });
    }

    const tutor = tutorRes.rows[0];
    if (tutor.estado_kyc === 'aprobado') {
      return res.status(400).json({ error: 'Tu identidad ya se encuentra validada.' });
    }

    const modo = process.env.SUMSUB_MODO || 'simulado';
    let applicantId = `SUMSUB-SIM-${tutor.id}-${Date.now()}`;
    let sdkToken = null;

    if (modo === 'real') {
      const sumsubData = await prepararCandidatoYTokenSumsub({
        tutorId: tutor.id,
        nombre: tutor.nombre,
        email: tutor.email,
      });
      applicantId = sumsubData.applicantId;
      sdkToken = sumsubData.sdkToken;
    }

    const actualizado = await pool.query(
      `UPDATE Tutores
       SET rut = $1,
           url_documento = $2,
           sumsub_applicant_id = $3,
           estado_kyc = 'pendiente',
           documentos_validados = FALSE,
           observacion_kyc = NULL,
           fecha_solicitud_kyc = CURRENT_TIMESTAMP,
           sumsub_veredicto = NULL
       WHERE id = $4
       RETURNING id AS tutor_id, rut, estado_kyc, documentos_validados,
                 sumsub_applicant_id, url_documento, fecha_solicitud_kyc`,
      [rutLimpio, url_documento.trim(), applicantId, tutor.id]
    );

    res.json({
      modo,
      mensaje:
        modo === 'real'
          ? 'Candidato registrado en Sumsub Sandbox. Ya puedes completar tu verificación biométrica.'
          : 'Solicitud de verificación enviada. Un administrador revisará tus antecedentes.',
      kyc: actualizado.rows[0],
      sdkToken,
    });
  } catch (error) {
    console.error('Error al solicitar validación KYC:', error);
    res.status(502).json({
      error: 'No se pudo iniciar la verificación con Sumsub.',
      detalle: error.message,
    });
  }
});

// 3. Emitir o renovar token del WebSDK de Sumsub para el tutor autenticado
router.post('/sdk-token', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Acceso exclusivo para tutores.' });
  }

  if ((process.env.SUMSUB_MODO || 'simulado') !== 'real') {
    return res.status(400).json({ error: 'El servidor está en SUMSUB_MODO=simulado.' });
  }

  try {
    const tutorRes = await pool.query(
      `SELECT t.id, u.nombre, u.email
       FROM Tutores t
       INNER JOIN Usuarios u ON u.id = t.usuario_id
       WHERE t.usuario_id = $1`,
      [req.usuario.id]
    );

    if (tutorRes.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil de tutor no encontrado.' });
    }

    const tutor = tutorRes.rows[0];
    const sumsubData = await prepararCandidatoYTokenSumsub({
      tutorId: tutor.id,
      nombre: tutor.nombre,
      email: tutor.email,
    });

    await pool.query(
      'UPDATE Tutores SET sumsub_applicant_id = $1 WHERE id = $2',
      [sumsubData.applicantId, tutor.id]
    );

    res.json({
      applicantId: sumsubData.applicantId,
      sdkToken: sumsubData.sdkToken,
      levelName: sumsubData.levelName,
    });
  } catch (error) {
    console.error('Error al generar token WebSDK:', error);
    res.status(502).json({ error: 'Error al generar token de Sumsub.', detalle: error.message });
  }
});

// 4. Sincronizar estado real desde Sumsub Sandbox hacia PostgreSQL (sin requerir webhook público)
router.post('/sincronizar', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Acceso exclusivo para tutores.' });
  }

  if ((process.env.SUMSUB_MODO || 'simulado') !== 'real') {
    return res.status(400).json({ error: 'La sincronización automática solo aplica en SUMSUB_MODO=real.' });
  }

  try {
    const tutorRes = await pool.query(
      'SELECT id, sumsub_applicant_id FROM Tutores WHERE usuario_id = $1',
      [req.usuario.id]
    );

    if (tutorRes.rows.length === 0 || !tutorRes.rows[0].sumsub_applicant_id) {
      return res.status(404).json({ error: 'Aún no tienes un ID de candidato registrado en Sumsub.' });
    }

    const { id: tutorId, sumsub_applicant_id: applicantId } = tutorRes.rows[0];
    const statusRes = await llamarApiSumsub('GET', `/resources/applicants/${applicantId}/status`);

    if (!statusRes.ok) {
      return res.status(502).json({
        error: 'No se pudo consultar el estado en Sumsub.',
        detalle: statusRes.data,
      });
    }

    const reviewStatus = statusRes.data?.reviewStatus;
    const reviewAnswer = statusRes.data?.reviewResult?.reviewAnswer;
    const comentario = statusRes.data?.reviewResult?.moderationComment || null;

    if (reviewStatus === 'completed' && reviewAnswer === 'GREEN') {
      const act = await pool.query(
        `UPDATE Tutores
         SET sumsub_veredicto = 'GREEN',
             estado_kyc = CASE WHEN estado_kyc = 'aprobado' THEN 'aprobado' ELSE 'pendiente' END,
             observacion_kyc = NULL
         WHERE id = $1
         RETURNING estado_kyc`,
        [tutorId]
      );
      return res.json({
        estado_kyc: act.rows[0].estado_kyc,
        sumsub_veredicto: 'GREEN',
        mensaje:
          act.rows[0].estado_kyc === 'aprobado'
            ? 'Tu identidad y antecedentes ya se encuentran validados.'
            : 'Biometría aprobada por Sumsub (GREEN). Tu expediente pasó a revisión final del administrador.',
      });
    }

    if (reviewStatus === 'completed' && reviewAnswer === 'RED') {
      await pool.query(
        `UPDATE Tutores
         SET sumsub_veredicto = 'RED',
             estado_kyc = 'rechazado',
             documentos_validados = FALSE,
             observacion_kyc = $1
         WHERE id = $2`,
        [comentario || 'Verificación biométrica rechazada por Sumsub.', tutorId]
      );
      return res.json({
        estado_kyc: 'rechazado',
        sumsub_veredicto: 'RED',
        mensaje: 'Sumsub rechazó la verificación biométrica. Revisa el motivo e intenta nuevamente.',
      });
    }
    res.json({
      estado_kyc: 'pendiente',
      reviewStatus,
      mensaje: `Verificación aún en proceso en Sumsub (estado: ${reviewStatus || 'pendiente'}).`,
    });
  } catch (error) {
    console.error('Error al sincronizar con Sumsub:', error);
    res.status(500).json({ error: 'Error al consultar el estado de verificación.' });
  }
});

// 5. Panel Admin: Listar tutores, solicitudes KYC y métricas generales
router.get('/admin/solicitudes', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores.' });
  }

  try {
    const [tutoresRes, metricasUsuariosRes, metricasPagosRes] = await Promise.all([
      pool.query(`
        SELECT
          t.id AS tutor_id,
          u.id AS usuario_id,
          u.nombre,
          u.email,
          t.especialidad,
          t.tarifa_hora,
          t.rut,
          COALESCE(t.estado_kyc, 'no_iniciado') AS estado_kyc,
          t.documentos_validados,
          t.sumsub_applicant_id,
          t.url_documento,
          t.observacion_kyc,
          t.fecha_solicitud_kyc
          ,t.sumsub_veredicto
        FROM Tutores t
        INNER JOIN Usuarios u ON u.id = t.usuario_id
        ORDER BY
          CASE t.estado_kyc
            WHEN 'pendiente' THEN 1
            WHEN 'rechazado' THEN 2
            WHEN 'no_iniciado' THEN 3
            WHEN 'aprobado' THEN 4
            ELSE 5
          END,
          t.fecha_solicitud_kyc DESC NULLS LAST
      `),
      pool.query('SELECT COUNT(*)::int AS total_usuarios FROM Usuarios'),
      pool.query(`
        SELECT
          COALESCE(SUM(comision_retenida), 0) AS total_comisiones,
          COUNT(*)::int AS pagos_confirmados
        FROM Pagos
        WHERE estado = 'pagado'
      `),
    ]);

    const tutores = tutoresRes.rows;
    const pendientes = tutores.filter((t) => t.estado_kyc === 'pendiente').length;
    const validados = tutores.filter((t) => t.documentos_validados).length;

    res.json({
      kpis: {
        total_usuarios: metricasUsuariosRes.rows[0].total_usuarios,
        tutores_pendientes: pendientes,
        tutores_validados: validados,
        total_comisiones: Number(metricasPagosRes.rows[0].total_comisiones),
        pagos_confirmados: metricasPagosRes.rows[0].pagos_confirmados,
      },
      solicitudes: tutores,
    });
  } catch (error) {
    console.error('Error al cargar panel admin:', error);
    res.status(500).json({ error: 'Error interno al cargar solicitudes KYC.' });
  }
});

// 6. Panel Admin: Aprobar o rechazar verificación KYC de un tutor
router.patch('/admin/resolver/:tutorId', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores.' });
  }

  const { tutorId } = req.params;
  const { decision, observacion } = req.body;

  if (!['aprobado', 'rechazado'].includes(decision)) {
    return res.status(400).json({ error: 'Decisión inválida. Debe ser "aprobado" o "rechazado".' });
  }

  if (decision === 'rechazado' && (!observacion || !observacion.trim())) {
    return res.status(400).json({
      error: 'Debes indicar un motivo u observación al rechazar una verificación.',
    });
  }

  try {
    const validado = decision === 'aprobado';
    const resultado = await pool.query(
      `UPDATE Tutores
       SET estado_kyc = $1,
           documentos_validados = $2,
           observacion_kyc = $3
       WHERE id = $4
       RETURNING id AS tutor_id, estado_kyc, documentos_validados, observacion_kyc`,
      [decision, validado, observacion ? observacion.trim() : null, tutorId]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Tutor no encontrado.' });
    }

    res.json({
      mensaje: validado
        ? 'Tutor aprobado. Su insignia de Identidad Validada ya está visible en el catálogo.'
        : 'Solicitud rechazada. El tutor podrá ver la observación y reenviar sus datos.',
      tutor: resultado.rows[0],
    });
  } catch (error) {
    console.error('Error al resolver KYC:', error);
    res.status(500).json({ error: 'Error interno al actualizar el estado KYC.' });
  }
});

module.exports = router;