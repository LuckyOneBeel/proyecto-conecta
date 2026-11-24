const express = require('express');
const cors = require('cors');
const pool = require('./src/db');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Ruta principal
app.get('/', (req, res) => {
  res.send('Servidor Backend de Conecta funcionando 🚀');
});

// Ruta para probar que la base de datos se conectó bien
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ message: 'Conexión exitosa a PostgreSQL', time: result.rows[0].now });
  } catch (err) {
    console.error('Error en la conexión:', err);
    res.status(500).json({ error: 'Error conectando a la base de datos' });
  }
});

// Middlewares
app.use(cors());
app.use(express.json()); // Permite recibir datos en formato JSON desde el frontend
app.use(express.urlencoded({ extended: true }));

// Importar rutas
const authRoutes = require('./src/routes/auth');
const usuariosRoutes = require('./src/routes/usuarios');
const tutoresRoutes = require('./src/routes/tutores');
const agendamientoRoutes = require('./src/routes/agendamiento');
const pagosRoutes = require('./src/routes/pagos');
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/auth', authRoutes); // Todas las rutas de auth empezarán con /api/auth
app.use('/api/tutores', tutoresRoutes);
app.use('/api/agendamiento', agendamientoRoutes);
app.use('/api/pagos', pagosRoutes); // NUEVO

// Ruta principal
app.get('/', (req, res) => {
  res.send('Servidor Backend de Conecta funcionando 🚀');
});

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor de Conecta corriendo en el puerto ${port}`);
});

