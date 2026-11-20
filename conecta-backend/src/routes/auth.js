const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
require('dotenv').config();

const router = express.Router();

// Ruta para registrar un nuevo usuario (Estudiante o Tutor)
router.post('/registro', async (req, res) => {
  const { nombre, email, password, rol } = req.body;

  try {
    // 1. Verificar si el email ya existe en la base de datos
    const usuarioExistente = await pool.query('SELECT * FROM Usuarios WHERE email = $1', [email]);
    if (usuarioExistente.rows.length > 0) {
      return res.status(400).json({ error: 'El email ya está registrado' });
    }

    // 2. Encriptar la contraseña usando Bcrypt
    const salt = await bcrypt.genSalt(10);
    const passwordEncriptada = await bcrypt.hash(password, salt);

    // 3. Insertar el nuevo usuario en la base de datos
    const nuevoUsuario = await pool.query(
      'INSERT INTO Usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4) RETURNING id, nombre, email, rol',
      [nombre, email, passwordEncriptada, rol]
    );

    res.status(201).json({ 
      mensaje: 'Usuario registrado exitosamente', 
      usuario: nuevoUsuario.rows[0] 
    });

  } catch (error) {
    console.error('Error en el registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Ruta para iniciar sesión (Login)
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Buscar al usuario por su email
    const usuario = await pool.query('SELECT * FROM Usuarios WHERE email = $1', [email]);
    
    // Si no encuentra el usuario, devuelve un error
    if (usuario.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const usuarioEncontrado = usuario.rows[0];

    // 2. Comparar la contraseña ingresada con el hash guardado en PostgreSQL
    const passwordValida = await bcrypt.compare(password, usuarioEncontrado.password);
    
    if (!passwordValida) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    // 3. Generar el Token JWT
    // Se incluye el ID, el nombre y el rol en el token para saber quién es el usuario
    const token = jwt.sign(
      { 
        id: usuarioEncontrado.id, 
        rol: usuarioEncontrado.rol,
        nombre: usuarioEncontrado.nombre 
      },
      process.env.JWT_SECRET, // Usa la clave secreta que configuraste en tu archivo .env
      { expiresIn: '24h' } // El token durará 24 horas
    );

    // 4. Enviar el token al frontend
    res.json({ 
      mensaje: 'Inicio de sesión exitoso', 
      token: token,
      usuario: {
        id: usuarioEncontrado.id,
        nombre: usuarioEncontrado.nombre,
        email: usuarioEncontrado.email,
        rol: usuarioEncontrado.rol
      }
    });

  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;