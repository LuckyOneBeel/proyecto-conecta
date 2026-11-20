const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
  // 1. Obtener el token de los encabezados (headers) de la petición
  const token = req.header('Authorization');

  // Si no hay token, se bloquea el acceso
  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Se requiere un token.' });
  }

  try {
    // 2. Limpiar la palabra "Bearer " que normalmente se envía junto al token
    const tokenLimpio = token.replace('Bearer ', '');

    // 3. Verificar si el token es válido usando tu clave secreta
    const usuarioVerificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
    
    // Si es válido, guardamos los datos del usuario en la petición y lo dejamos pasar
    req.usuario = usuarioVerificado;
    next(); 
  } catch (error) {
    res.status(400).json({ error: 'Token inválido o expirado' });
  }
};