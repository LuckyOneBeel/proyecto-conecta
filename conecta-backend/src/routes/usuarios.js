const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middlewares/authMiddleware'); // Importamos al guardia

// Ruta para ver el perfil del usuario (Requiere token)
router.get('/perfil', authMiddleware, async (req, res) => {
  try {
    // req.usuario.id viene directamente de lo que decodificó el guardia (el middleware)
    const usuarioId = req.usuario.id;

    // Buscamos los datos en la base de datos (sin devolver la contraseña)
    const consulta = await pool.query(
      'SELECT id, nombre, email, rol, fecha_registro FROM Usuarios WHERE id = $1',
      [usuarioId]
    );

    if (consulta.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    res.json(consulta.rows[0]);
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;