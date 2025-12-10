/**
 * User Model
 * Gerencia usuários do sistema
 */

import { query } from '../config/database.js';

const User = {
  /**
   * Cria um novo usuário
   * @param {Object} data - { email, name }
   * @returns {Promise<{id: number, email: string, name: string}>}
   */
  async create({ email, name }) {
    try {
      const result = await query(
        `INSERT INTO users (email, name)
         VALUES ($1, $2)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [email, name]
      );
      return result.rows[0];
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      throw error;
    }
  },

  /**
   * Busca usuário por ID
   * @param {number} id
   */
  async findById(id) {
    const result = await query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Busca usuário por email
   * @param {string} email
   */
  async findByEmail(email) {
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  },

  /**
   * Lista todos os usuários
   */
  async findAll() {
    const result = await query(
      'SELECT * FROM users ORDER BY created_at DESC',
      []
    );
    return result.rows;
  },

  /**
   * Atualiza usuário
   * @param {number} id
   * @param {Object} data - { name }
   */
  async update(id, { name }) {
    const result = await query(
      `UPDATE users SET name = $1 WHERE id = $2 RETURNING *`,
      [name, id]
    );
    return result.rows[0];
  },

  /**
   * Deleta usuário
   * @param {number} id
   */
  async delete(id) {
    const result = await query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rowCount > 0;
  }
};

export default User;

