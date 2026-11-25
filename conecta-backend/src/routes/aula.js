const express = require('express');
const router = express.Router();
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

// Obtener acceso y token de videollamada para una reserva confirmada
router.get('/acceso/:reservaId', authMiddleware, async (req, res) => {
  const { reservaId } = req.params;

  try {
    const consulta = `
      SELECT
        r.id AS reserva_id,
        r.estudiante_id,
        r.estado AS estado_reserva,
        t.usuario_id AS tutor_usuario_id,
        u_est.nombre AS nombre_estudiante,
        u_tut.nombre AS nombre_tutor,
        t.especialidad,
        d.fecha,
        d.hora_inicio,
        d.hora_fin
      FROM Reservas r
      INNER JOIN Tutores t ON r.tutor_id = t.id
      INNER JOIN Usuarios u_est ON r.estudiante_id = u_est.id
      INNER JOIN Usuarios u_tut ON t.usuario_id = u_tut.id
      INNER JOIN Disponibilidad d ON r.disponibilidad_id = d.id
      WHERE r.id = $1
    `;

    const resultado = await pool.query(consulta, [reservaId]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const reserva = resultado.rows[0];
    const esEstudiante = reserva.estudiante_id === req.usuario.id;
    const esTutor = reserva.tutor_usuario_id === req.usuario.id;

    // Control de acceso: nadie externo a la clase puede entrar a la sala
    if (!esEstudiante && !esTutor) {
      return res.status(403).json({ error: 'No tienes permiso para ingresar a esta aula virtual.' });
    }

    // Regla de negocio: el aula solo se habilita tras confirmar el pago
    if (reserva.estado_reserva !== 'confirmada') {
      return res.status(403).json({
        error: 'El aula virtual solo se habilita para reservas confirmadas y pagadas.',
      });
    }

    const canal = `conecta-clase-${reserva.reserva_id}`;
    const uid = Number(req.usuario.id);
    const modo = process.env.AGORA_MODO || 'simulado';

    let agoraConfig = {
      modo,
      appId: null,
      token: null,
      canal,
      uid,
    };

    if (modo === 'real') {
      const appId = process.env.AGORA_APP_ID;
      const appCertificate = process.env.AGORA_APP_CERTIFICATE;

      if (!appId || !appCertificate) {
        return res.status(500).json({
          error: 'Faltan AGORA_APP_ID o AGORA_APP_CERTIFICATE en el servidor.',
        });
      }

      // Token temporal válido por 2 horas (7200 segundos)
      const duracionSegundos = 7200;
      const rtcToken = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        canal,
        uid,
        RtcRole.PUBLISHER,
        duracionSegundos,
        duracionSegundos
      );

      agoraConfig = {
        modo: 'real',
        appId,
        token: rtcToken,
        canal,
        uid,
      };
    }

    res.json({
      clase: {
        reserva_id: reserva.reserva_id,
        especialidad: reserva.especialidad,
        nombre_estudiante: reserva.nombre_estudiante,
        nombre_tutor: reserva.nombre_tutor,
        fecha: reserva.fecha,
        hora_inicio: reserva.hora_inicio,
        hora_fin: reserva.hora_fin,
        mi_rol: esTutor ? 'tutor' : 'estudiante',
      },
      agora: agoraConfig,
    });
  } catch (error) {
    console.error('Error al generar acceso al aula virtual:', error);
    res.status(500).json({ error: 'Error interno al preparar el aula virtual.' });
  }
});

module.exports = router;