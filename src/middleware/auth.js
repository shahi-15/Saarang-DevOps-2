import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_saarang_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate a JWT token for an authenticated user
 * @param {Object} user - User record from DB
 * @returns {string} - JWT Token
 */
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Verify a token and extract the user payload
 * @param {string} authHeader - The Authorization header value (e.g., "Bearer <token>")
 * @returns {Object|null} - Decoded user payload or null if invalid
 */
export function getUserFromToken(authHeader) {
  if (!authHeader) {
    return null;
  }

  // Handle standard Bearer format
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };
  } catch (err) {
    // Return null on expired or malformed token so the GraphQL context doesn't crash,
    // allowing resolvers to handle authorization/unauthenticated errors gracefully.
    console.warn('[AUTH WARNING] Invalid/expired token provided:', err.message);
    return null;
  }
}
