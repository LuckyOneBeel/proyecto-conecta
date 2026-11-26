const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

// Función oficial de firma HMAC-SHA256 exigida por la API de Flow
function firmarParametrosFlow(params, secretKey) {
  const keysOrdenadas = Object.keys(params).sort();
  const cadenaParaFirmar = keysOrdenadas.map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha256', secretKey).update(cadenaParaFirmar).digest('hex');
}

// Cálculo automático de comisión de la plataforma (RF-09)
function calcularMontos(tarifaHora) {
  const tasaComision = Number(process.env.PORCENTAJE_COMISION || 0.15);
  const montoTotal = Math.round(Number(tarifaHora));
  const comisionRetenida = Math.round(montoTotal * tasaComision);
  const montoTutor = montoTotal - comisionRetenida;
  return { montoTotal, comisionRetenida, montoTutor, tasaComision };
}

// 1. Obtener detalle de una reserva y su estado de pago
router.get('/reserva/:reservaId', authMiddleware, async (req, res) => {
  const { reservaId } = req.params;

  try {
    const consulta = `
      SELECT 
        r.id AS reserva_id,
        r.estudiante_id,
        r.estado AS estado_reserva,
        r.fecha_creacion,
        u_tutor.nombre AS nombre_tutor,
        t.especialidad,
        t.tarifa_hora,
        d.fecha,
        d.hora_inicio,
        d.hora_fin,
        p.id AS pago_id,
        p.id_transaccion_flow,
        p.monto_total,
        p.comision_retenida,
        p.estado AS estado_pago,
        p.fecha_pago
      FROM Reservas r
      INNER JOIN Tutores t ON r.tutor_id = t.id
      INNER JOIN Usuarios u_tutor ON t.usuario_id = u_tutor.id
      INNER JOIN Disponibilidad d ON r.disponibilidad_id = d.id
      LEFT JOIN Pagos p ON p.reserva_id = r.id
      WHERE r.id = $1
    `;

    const resultado = await pool.query(consulta, [reservaId]);

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const reserva = resultado.rows[0];

    // Solo el estudiante dueño de la reserva o un admin puede ver su checkout
    if (req.usuario.rol !== 'admin' && reserva.estudiante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver esta orden de pago.' });
    }

    res.json(reserva);
  } catch (error) {
    console.error('Error al obtener detalle de pago:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// 2. Generar orden de pago (Flow Sandbox real o Modo Simulado) - RF-08 y RF-09
router.post('/crear-orden', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'estudiante') {
    return res.status(403).json({ error: 'Solo los estudiantes pueden pagar reservas.' });
  }

  const { reserva_id } = req.body;

  try {
    const reservaRes = await pool.query(
      `SELECT r.id, r.estudiante_id, r.estado, t.tarifa_hora, u_est.email AS email_estudiante, u_tut.nombre AS nombre_tutor
       FROM Reservas r
       INNER JOIN Tutores t ON r.tutor_id = t.id
       INNER JOIN Usuarios u_est ON r.estudiante_id = u_est.id
       INNER JOIN Usuarios u_tut ON t.usuario_id = u_tut.id
       WHERE r.id = $1`,
      [reserva_id]
    );

    if (reservaRes.rows.length === 0) {
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const reserva = reservaRes.rows[0];

    if (reserva.estudiante_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Esta reserva no te pertenece.' });
    }

    if (reserva.estado !== 'pendiente') {
      return res.status(400).json({ error: `La reserva ya se encuentra en estado "${reserva.estado}".` });
    }

    const { montoTotal, comisionRetenida, montoTutor } = calcularMontos(reserva.tarifa_hora);
    const modo = process.env.FLOW_MODO || 'simulado';

    // MODO REAL: Conecta directamente con la API Sandbox/Producción de Flow
    if (modo === 'real') {
      const params = {
        apiKey: process.env.FLOW_API_KEY,
        commerceOrder: `CONECTA-${reserva.id}-${Date.now()}`,
        subject: `Tutoría Conecta con ${reserva.nombre_tutor}`,
        currency: 'CLP',
        amount: montoTotal,
        email: reserva.email_estudiante,
        urlConfirmation: `${process.env.BACKEND_URL}/api/pagos/webhook-flow`,
        urlReturn: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/pagos/retorno-flow/${reserva_id}`,
      };

      params.s = firmarParametrosFlow(params, process.env.FLOW_SECRET_KEY);

      const flowRes = await fetch(`${process.env.FLOW_API_URL}/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });

      const flowData = await flowRes.json();

      if (!flowRes.ok || !flowData.token) {
        return res.status(502).json({ error: 'Error al comunicarse con Flow.', detalle: flowData });
      }

      const pagoGuardado = await pool.query(
        `INSERT INTO Pagos (reserva_id, id_transaccion_flow, monto_total, comision_retenida, estado)
         VALUES ($1, $2, $3, $4, 'pendiente')
         ON CONFLICT (reserva_id)
         DO UPDATE SET id_transaccion_flow = EXCLUDED.id_transaccion_flow, monto_total = EXCLUDED.monto_total, comision_retenida = EXCLUDED.comision_retenida, estado = 'pendiente'
         RETURNING *`,
        [reserva.id, flowData.token, montoTotal, comisionRetenida]
      );

      return res.json({
        modo: 'real',
        urlPago: `${flowData.url}?token=${flowData.token}`,
        pago: pagoGuardado.rows[0],
      });
    }

    // MODO SIMULADO LOCAL: Genera orden lista para probar Webpay/Flow sin salir de localhost
    const tokenSimulado = `FLOW-SIM-${reserva.id}-${Date.now()}`;

    const pagoGuardado = await pool.query(
      `INSERT INTO Pagos (reserva_id, id_transaccion_flow, monto_total, comision_retenida, estado)
       VALUES ($1, $2, $3, $4, 'pendiente')
       ON CONFLICT (reserva_id)
       DO UPDATE SET id_transaccion_flow = EXCLUDED.id_transaccion_flow, monto_total = EXCLUDED.monto_total, comision_retenida = EXCLUDED.comision_retenida, estado = 'pendiente'
       RETURNING *`,
      [reserva.id, tokenSimulado, montoTotal, comisionRetenida]
    );

    res.json({
      modo: 'simulado',
      tokenFlow: tokenSimulado,
      pago: pagoGuardado.rows[0],
      desglose: { montoTotal, comisionRetenida, montoTutor },
    });
  } catch (error) {
    console.error('Error al crear orden de pago:', error);
    res.status(500).json({ error: 'Error interno al generar la orden de pago.' });
  }
});

// 3. Confirmación simulada (emula el Webhook de Flow localmente con transacción ACID)
router.post('/confirmar-simulado', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'estudiante') {
    return res.status(403).json({ error: 'Acción solo permitida para estudiantes.' });
  }

  const { reserva_id, resultado } = req.body; // resultado: 'pagado' o 'fallido'

  if (!['pagado', 'fallido'].includes(resultado)) {
    return res.status(400).json({ error: 'Resultado inválido.' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const reservaRes = await client.query(
      'SELECT id, estudiante_id, disponibilidad_id, estado FROM Reservas WHERE id = $1 FOR UPDATE',
      [reserva_id]
    );

    if (reservaRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Reserva no encontrada.' });
    }

    const reserva = reservaRes.rows[0];
    if (reserva.estudiante_id !== req.usuario.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'No autorizado.' });
    }

    if (resultado === 'pagado') {
      const pagoRes = await client.query(
        `UPDATE Pagos SET estado = 'pagado', fecha_pago = CURRENT_TIMESTAMP
         WHERE reserva_id = $1 RETURNING *`,
        [reserva_id]
      );

      await client.query(
        "UPDATE Reservas SET estado = 'confirmada' WHERE id = $1",
        [reserva_id]
      );

      await client.query('COMMIT');
      return res.json({
        mensaje: 'Pago confirmado con éxito. Tu tutoría quedó agendada.',
        pago: pagoRes.rows[0],
        estado_reserva: 'confirmada',
      });
    } else {
      // Si el pago falla, cancelamos la reserva y liberamos el bloque del tutor
      const pagoRes = await client.query(
        "UPDATE Pagos SET estado = 'fallido' WHERE reserva_id = $1 RETURNING *",
        [reserva_id]
      );

      await client.query(
        "UPDATE Reservas SET estado = 'cancelada' WHERE id = $1",
        [reserva_id]
      );

      await client.query(
        "UPDATE Disponibilidad SET estado = 'libre' WHERE id = $1",
        [reserva.disponibilidad_id]
      );

      await client.query('COMMIT');
      return res.json({
        mensaje: 'El pago fue rechazado. La reserva fue cancelada y el horario volvió a quedar libre.',
        pago: pagoRes.rows[0],
        estado_reserva: 'cancelada',
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al confirmar pago simulado:', error);
    res.status(500).json({ error: 'Error interno al procesar la confirmación.' });
  } finally {
    client.release();
  }
});

// 4. Webhook real de Flow (recibe confirmación automática servidor-a-servidor)
router.post('/webhook-flow', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).send('Token faltante');

  try {
    const params = { apiKey: process.env.FLOW_API_KEY, token };
    params.s = firmarParametrosFlow(params, process.env.FLOW_SECRET_KEY);

    const query = new URLSearchParams(params).toString();
    const statusRes = await fetch(`${process.env.FLOW_API_URL}/payment/getStatus?${query}`);
    const statusData = await statusRes.json();

    // En Flow: status 2 = Pagada, 3 = Rechazada, 4 = Anulada
    if (statusData.status === 2) {
      const pagoUpdate = await pool.query(
        `UPDATE Pagos SET estado = 'pagado', fecha_pago = CURRENT_TIMESTAMP
         WHERE id_transaccion_flow = $1 RETURNING reserva_id`,
        [token]
      );

      if (pagoUpdate.rows.length > 0) {
        await pool.query(
          "UPDATE Reservas SET estado = 'confirmada' WHERE id = $1",
          [pagoUpdate.rows[0].reserva_id]
        );
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error en webhook Flow:', error);
    res.status(500).send('Error');
  }
});

// 5. Resumen financiero del Tutor (desglose cobro total vs comisión - US-08)
router.get('/resumen-tutor', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Acceso exclusivo para tutores.' });
  }

  try {
    const tutorRes = await pool.query('SELECT id FROM Tutores WHERE usuario_id = $1', [req.usuario.id]);
    if (tutorRes.rows.length === 0) {
      return res.json({ totales: { bruto: 0, comision: 0, neto: 0 }, movimientos: [] });
    }

    const tutorId = tutorRes.rows[0].id;

    const movimientosRes = await pool.query(
      `SELECT 
        p.id AS pago_id,
        p.id_transaccion_flow,
        p.monto_total,
        p.comision_retenida,
        (p.monto_total - p.comision_retenida) AS monto_neto,
        p.estado AS estado_pago,
        p.fecha_pago,
        u_est.nombre AS nombre_estudiante,
        d.fecha AS fecha_clase,
        d.hora_inicio,
        d.hora_fin
      FROM Pagos p
      INNER JOIN Reservas r ON p.reserva_id = r.id
      INNER JOIN Usuarios u_est ON r.estudiante_id = u_est.id
      INNER JOIN Disponibilidad d ON r.disponibilidad_id = d.id
      WHERE r.tutor_id = $1
      ORDER BY p.fecha_pago DESC NULLS LAST, p.id DESC`,
      [tutorId]
    );

    const pagados = movimientosRes.rows.filter((m) => m.estado_pago === 'pagado');
    const bruto = pagados.reduce((acc, m) => acc + Number(m.monto_total), 0);
    const comision = pagados.reduce((acc, m) => acc + Number(m.comision_retenida), 0);

    res.json({
      totales: {
        bruto,
        comision,
        neto: bruto - comision,
        clases_pagadas: pagados.length,
      },
      movimientos: movimientosRes.rows,
    });
  } catch (error) {
    console.error('Error al obtener resumen financiero:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});
// Ruta puente: recibe el POST de retorno de Flow y redirige por GET a Next.js (evita error 405)
router.all('/retorno-flow/:reservaId', (req, res) => {
  const { reservaId } = req.params;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  res.redirect(303, `${frontendUrl}/pago/${reservaId}?retorno=flow`);
});

module.exports = router;