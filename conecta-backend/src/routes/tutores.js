const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware');

// 1. Obtener todo el catálogo de tutores (Público)
router.get('/', async (req, res) => {
  try {
    const consulta = `
      SELECT 
        u.id AS usuario_id,
        t.id AS tutor_id,
        u.nombre, 
        t.especialidad, 
        t.tarifa_hora,
        t.documentos_validados
      FROM Usuarios u
      LEFT JOIN Tutores t ON u.id = t.usuario_id
      WHERE u.rol = 'tutor'
    `;
    const tutores = await pool.query(consulta);
    res.json(tutores.rows);
  } catch (error) {
    console.error('Error al obtener el catálogo de tutores:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Obtener el perfil profesional del tutor autenticado
router.get('/mi-perfil', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Acceso exclusivo para tutores.' });
  }

  try {
    const resultado = await pool.query(
      'SELECT id, especialidad, tarifa_hora, documentos_validados FROM Tutores WHERE usuario_id = $1',
      [req.usuario.id]
    );
    res.json(resultado.rows[0] || null);
  } catch (error) {
    console.error('Error al obtener perfil profesional:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 3. Crear o actualizar el perfil profesional del tutor (UPSERT)
router.put('/mi-perfil', authMiddleware, async (req, res) => {
  if (req.usuario.rol !== 'tutor') {
    return res.status(403).json({ error: 'Solo los tutores pueden editar su perfil profesional.' });
  }

  const { especialidad, tarifa_hora } = req.body;

  if (!especialidad || !tarifa_hora || Number(tarifa_hora) <= 0) {
    return res.status(400).json({ error: 'Debes ingresar una especialidad y una tarifa válida.' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO Tutores (usuario_id, especialidad, tarifa_hora)
       VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id)
       DO UPDATE SET especialidad = EXCLUDED.especialidad, tarifa_hora = EXCLUDED.tarifa_hora
       RETURNING *`,
      [req.usuario.id, especialidad.trim(), Number(tarifa_hora)]
    );

    res.json({
      mensaje: 'Perfil profesional actualizado con éxito.',
      tutor: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar perfil profesional:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 4. Obtener el detalle de un tutor específico por su tutor_id (Público)
router.get('/:tutorId', async (req, res) => {
  const { tutorId } = req.params;
  try {
    const consulta = `
      SELECT 
        u.id AS usuario_id,
        t.id AS tutor_id,
        u.nombre, 
        t.especialidad, 
        t.tarifa_hora,
        t.documentos_validados
      FROM Tutores t
      INNER JOIN Usuarios u ON u.id = t.usuario_id
      WHERE t.id = $1
    `;
    const resultado = await pool.query(consulta, [tutorId]);
    
    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Tutor no encontrado' });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error('Error al obtener tutor:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;