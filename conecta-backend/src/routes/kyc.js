const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

// 1. Consultar el estado KYC del tutor autenticado
router.get('/mi-estado', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Acceso exclusivo para tutores.' });
  }

  try {
    const resultado = await pool.query(
      `SELECT id AS tutor_id, especialidad, tarifa_hora, rut, estado_kyc,
              documentos_validados, sumsub_applicant_id, url_documento,
              observacion_kyc, fecha_solicitud_kyc
       FROM Tutores
       WHERE usuario_id = $1`,
      [req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.json({ perfil_incompleto: true });
    }

    res.json({ perfil_incompleto: false, ...resultado.rows[0] });
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

  // Validación básica de formato RUT chileno (ej: 12.345.678-9 o 12345678-K)
  const rutLimpio = rut.trim().toUpperCase();
  const formatoRutValido = /^[0-9]{1,2}\.?[0-9]{3}\.?[0-9]{3}-[0-9K]$/.test(rutLimpio);
  if (!formatoRutValido) {
    return res.status(400).json({
      error: 'Formato de RUT inválido. Ejemplo válido: 12.345.678-9 o 12345678-K.',
    });
  }

  try {
    const tutorRes = await pool.query(
      'SELECT id, estado_kyc FROM Tutores WHERE usuario_id = $1',
      [req.usuario.id]
    );

    if (tutorRes.rows.length === 0) {
      return res.status(400).json({
        error: 'Primero completa tu especialidad y tarifa en "Perfil y Horarios".',
      });
    }

    if (tutorRes.rows[0].estado_kyc === 'aprobado') {
      return res.status(400).json({ error: 'Tu identidad ya se encuentra validada.' });
    }

    const tutorId = tutorRes.rows[0].id;
    const modo = process.env.SUMSUB_MODO || 'simulado';
    const applicantId =
      modo === 'real'
        ? `SUMSUB-LIVE-${tutorId}-${Date.now()}`
        : `SUMSUB-SIM-${tutorId}-${Date.now()}`;

    const actualizado = await pool.query(
      `UPDATE Tutores
       SET rut = $1,
           url_documento = $2,
           sumsub_applicant_id = $3,
           estado_kyc = 'pendiente',
           documentos_validados = FALSE,
           observacion_kyc = NULL,
           fecha_solicitud_kyc = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id AS tutor_id, rut, estado_kyc, documentos_validados,
                 sumsub_applicant_id, url_documento, fecha_solicitud_kyc`,
      [rutLimpio, url_documento.trim(), applicantId, tutorId]
    );

    res.json({
      mensaje: 'Solicitud de verificación enviada. Un administrador revisará tus antecedentes.',
      kyc: actualizado.rows[0],
    });
  } catch (error) {
    console.error('Error al solicitar validación KYC:', error);
    res.status(500).json({ error: 'Error interno al registrar la solicitud KYC.' });
  }
});

// 3. Panel Admin: Listar tutores, solicitudes KYC y métricas generales
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
      pool.query(`SELECT COUNT(*)::int AS total_usuarios FROM Usuarios`),
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

// 4. Panel Admin: Aprobar o rechazar verificación KYC de un tutor
router.patch('/admin/resolver/:tutorId', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores.' });
  }

  const { tutorId } = req.params;
  const { decision, observacion } = req.body; // 'aprobado' o 'rechazado'

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