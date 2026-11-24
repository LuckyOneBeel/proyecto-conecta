const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

// 1. Ver horarios disponibles de un tutor (Público)
router.get('/disponibilidad/:tutorId', async (req, res) => {
  const { tutorId } = req.params;
  try {
    const consulta = `
      SELECT id, fecha, hora_inicio, hora_fin, estado
      FROM Disponibilidad
      WHERE tutor_id = $1 AND estado = 'libre'
      ORDER BY fecha ASC, hora_inicio ASC
    `;
    const horarios = await pool.query(consulta, [tutorId]);
    res.json(horarios.rows);
  } catch (error) {
    console.error('Error al obtener disponibilidad:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Agregar un nuevo bloque horario (Solo Tutores autenticados - RF-06)
router.post('/disponibilidad', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Solo los tutores pueden configurar horarios.' });
  }

  const { fecha, hora_inicio, hora_fin } = req.body;

  try {
    // Buscar el ID de la tabla Tutores correspondiente a este usuario
    const tutorRes = await pool.query('SELECT id FROM Tutores WHERE usuario_id = $1', [req.usuario.id]);
    if (tutorRes.rows.length === 0) {
      return res.status(400).json({ error: 'Debes completar tu perfil de tutor antes de publicar horarios.' });
    }

    const tutorId = tutorRes.rows[0].id;

    const nuevoBloque = await pool.query(
      `INSERT INTO Disponibilidad (tutor_id, fecha, hora_inicio, hora_fin, estado)
       VALUES ($1, $2, $3, $4, 'libre') RETURNING *`,
      [tutorId, fecha, hora_inicio, hora_fin]
    );

    res.status(201).json({
      mensaje: 'Horario publicado con éxito',
      bloque: nuevoBloque.rows[0]
    });
  } catch (error) {
    console.error('Error al crear disponibilidad:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Reservar un bloque horario (Solo Estudiantes autenticados - RF-07 con transacción ACID)
router.post('/reservar', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'estudiante') {
    return res.status(403).json({ error: 'Solo los estudiantes pueden reservar tutorías.' });
  }

  const { disponibilidad_id } = req.body;
  const estudiante_id = req.usuario.id;
  const client = await pool.connect();

  try {
    // Iniciamos transacción ACID para evitar doble agendamiento
    await client.query('BEGIN');

    // Bloqueamos la fila temporalmente mientras verificamos su estado
    const bloqueRes = await client.query(
      'SELECT * FROM Disponibilidad WHERE id = $1 FOR UPDATE',
      [disponibilidad_id]
    );

    if (bloqueRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'El horario seleccionado no existe.' });
    }

    const bloque = bloqueRes.rows[0];
    if (bloque.estado !== 'libre') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Este horario ya fue reservado o bloqueado.' });
    }

    // Marcamos el bloque como reservado
    await client.query(
      "UPDATE Disponibilidad SET estado = 'reservada' WHERE id = $1",
      [disponibilidad_id]
    );

    // Creamos la reserva en estado 'pendiente' (esperando pago en Sprint 4)
    const reservaRes = await client.query(
      `INSERT INTO Reservas (estudiante_id, tutor_id, disponibilidad_id, estado)
       VALUES ($1, $2, $3, 'pendiente') RETURNING *`,
      [estudiante_id, bloque.tutor_id, disponibilidad_id]
    );

    await client.query('COMMIT');

    res.status(201).json({
      mensaje: 'Horario reservado con éxito. Orden de pago pendiente generada.',
      reserva: reservaRes.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al reservar clase:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar la reserva.' });
  } finally {
    client.release();
  }
});

// 4. Obtener todos los horarios del tutor autenticado (libres, bloqueados y reservados)
router.get('/mis-horarios', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Solo los tutores pueden gestionar sus horarios.' });
  }

  try {
    const tutorRes = await pool.query('SELECT id FROM Tutores WHERE usuario_id = $1', [req.usuario.id]);
    if (tutorRes.rows.length === 0) {
      return res.json([]);
    }

    const horarios = await pool.query(
      `SELECT id, fecha, hora_inicio, hora_fin, estado
       FROM Disponibilidad
       WHERE tutor_id = $1
       ORDER BY fecha ASC, hora_inicio ASC`,
      [tutorRes.rows[0].id]
    );

    res.json(horarios.rows);
  } catch (error) {
    console.error('Error al obtener horarios del tutor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 5. Bloquear o liberar un bloque horario propio (RF-06)
router.patch('/disponibilidad/:id/estado', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Solo los tutores pueden modificar sus horarios.' });
  }

  const { id } = req.params;
  const { estado } = req.body;

  if (!['libre', 'bloqueada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido. Solo se permite "libre" o "bloqueada".' });
  }

  try {
    const tutorRes = await pool.query('SELECT id FROM Tutores WHERE usuario_id = $1', [req.usuario.id]);
    if (tutorRes.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil de tutor no encontrado.' });
    }

    const actualizado = await pool.query(
      `UPDATE Disponibilidad
       SET estado = $1
       WHERE id = $2 AND tutor_id = $3 AND estado != 'reservada'
       RETURNING *`,
      [estado, id, tutorRes.rows[0].id]
    );

    if (actualizado.rows.length === 0) {
      return res.status(400).json({
        error: 'No se pudo actualizar el bloque (puede que ya esté reservado por un estudiante).'
      });
    }

    res.json({ mensaje: 'Estado del horario actualizado.', bloque: actualizado.rows[0] });
  } catch (error) {
    console.error('Error al cambiar estado del horario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 6. Obtener las clases agendadas del usuario autenticado (Estudiante o Tutor)
router.get('/mis-reservas', authMiddleware, async (req, res) => {
  try {
    if (req.usuario.rol === 'estudiante') {
      const consulta = `
        SELECT
          r.id AS reserva_id,
          r.estado AS estado_reserva,
          d.fecha,
          d.hora_inicio,
          d.hora_fin,
          u_tut.nombre AS contraparte_nombre,
          t.especialidad,
          t.tarifa_hora,
          p.estado AS estado_pago,
          p.monto_total
        FROM Reservas r
        INNER JOIN Tutores t ON r.tutor_id = t.id
        INNER JOIN Usuarios u_tut ON t.usuario_id = u_tut.id
        INNER JOIN Disponibilidad d ON r.disponibilidad_id = d.id
        LEFT JOIN Pagos p ON p.reserva_id = r.id
        WHERE r.estudiante_id = $1
        ORDER BY d.fecha DESC, d.hora_inicio DESC
      `;
      const resultado = await pool.query(consulta, [req.usuario.id]);
      return res.json(resultado.rows);
    }

    if (req.usuario.rol === 'tutor') {
      const tutorRes = await pool.query('SELECT id FROM Tutores WHERE usuario_id = $1', [req.usuario.id]);
      if (tutorRes.rows.length === 0) {
        return res.json([]);
      }

      const consulta = `
        SELECT
          r.id AS reserva_id,
          r.estado AS estado_reserva,
          d.fecha,
          d.hora_inicio,
          d.hora_fin,
          u_est.nombre AS contraparte_nombre,
          t.especialidad,
          t.tarifa_hora,
          p.estado AS estado_pago,
          p.monto_total
        FROM Reservas r
        INNER JOIN Tutores t ON r.tutor_id = t.id
        INNER JOIN Usuarios u_est ON r.estudiante_id = u_est.id
        INNER JOIN Disponibilidad d ON r.disponibilidad_id = d.id
        LEFT JOIN Pagos p ON p.reserva_id = r.id
        WHERE r.tutor_id = $1
        ORDER BY d.fecha DESC, d.hora_inicio DESC
      `;
      const resultado = await pool.query(consulta, [tutorRes.rows[0].id]);
      return res.json(resultado.rows);
    }

    res.json([]);
  } catch (error) {
    console.error('Error al obtener mis reservas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});
module.exports = router;