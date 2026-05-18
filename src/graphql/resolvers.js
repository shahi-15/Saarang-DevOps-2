import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import db from '../config/db.js';
import { generateToken } from '../middleware/auth.js';

export const resolvers = {
  Query: {
    // Retrieve all products
    products: async () => {
      try {
        const res = await db.query('SELECT * FROM products ORDER BY id DESC');
        return res.rows.map(row => ({
          id: row.id,
          name: row.name,
          description: row.description,
          price: Number(row.price),
          stock: row.stock,
          createdAt: row.created_at.toISOString()
        }));
      } catch (err) {
        throw new GraphQLError('Failed to retrieve products: ' + err.message);
      }
    },

    // Retrieve a single product by ID
    product: async (_, { id }) => {
      try {
        const res = await db.query('SELECT * FROM products WHERE id = $1', [id]);
        if (res.rowCount === 0) {
          return null;
        }
        const row = res.rows[0];
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          price: Number(row.price),
          stock: row.stock,
          createdAt: row.created_at.toISOString()
        };
      } catch (err) {
        throw new GraphQLError('Failed to retrieve product: ' + err.message);
      }
    },

    // Retrieve all orders (Admin gets all, regular user gets only their orders)
    orders: async (_, __, context) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required to view orders.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      try {
        let queryText = '';
        let params = [];

        if (context.user.role === 'admin') {
          queryText = 'SELECT * FROM orders ORDER BY id DESC';
        } else {
          queryText = 'SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC';
          params = [context.user.id];
        }

        const res = await db.query(queryText, params);
        return res.rows.map(row => ({
          id: row.id,
          userId: row.user_id,
          totalPrice: Number(row.total_price),
          status: row.status,
          createdAt: row.created_at.toISOString()
        }));
      } catch (err) {
        throw new GraphQLError('Failed to retrieve orders: ' + err.message);
      }
    },

    // Retrieve a single order by ID (with authorization checks)
    order: async (_, { id }, context) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required to view this order.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      try {
        const res = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
        if (res.rowCount === 0) {
          return null;
        }
        const order = res.rows[0];

        // Authorization check: Must be admin or the owner of the order
        if (context.user.role !== 'admin' && order.user_id !== context.user.id) {
          throw new GraphQLError('Access denied. You do not own this order.', {
            extensions: { code: 'FORBIDDEN' }
          });
        }

        return {
          id: order.id,
          userId: order.user_id,
          totalPrice: Number(order.total_price),
          status: order.status,
          createdAt: order.created_at.toISOString()
        };
      } catch (err) {
        if (err.extensions) throw err;
        throw new GraphQLError('Failed to retrieve order: ' + err.message);
      }
    },

    // Get current authenticated user
    me: async (_, __, context) => {
      if (!context.user) return null;
      try {
        const res = await db.query('SELECT * FROM users WHERE id = $1', [context.user.id]);
        if (res.rowCount === 0) return null;
        const u = res.rows[0];
        return {
          id: u.id,
          username: u.username,
          role: u.role,
          createdAt: u.created_at.toISOString()
        };
      } catch (err) {
        throw new GraphQLError('Error fetching user: ' + err.message);
      }
    }
  },

  Mutation: {
    // Register a new user (can specify isAdmin to quickly set admin privilege)
    register: async (_, { username, password, isAdmin }) => {
      if (password.length < 6) {
        throw new GraphQLError('Password must be at least 6 characters long.', {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      try {
        // Check duplicate username
        const checkUser = await db.query('SELECT 1 FROM users WHERE username = $1', [username]);
        if (checkUser.rowCount > 0) {
          throw new GraphQLError('Username is already taken.', {
            extensions: { code: 'BAD_USER_INPUT' }
          });
        }

        const role = isAdmin === true ? 'admin' : 'user';
        const passwordHash = await bcrypt.hash(password, 10);

        const res = await db.query(
          `INSERT INTO users (username, password_hash, role) 
           VALUES ($1, $2, $3) 
           RETURNING *`,
          [username, passwordHash, role]
        );

        const newUser = res.rows[0];
        const token = generateToken(newUser);

        return {
          token,
          user: {
            id: newUser.id,
            username: newUser.username,
            role: newUser.role,
            createdAt: newUser.created_at.toISOString()
          }
        };
      } catch (err) {
        if (err.extensions) throw err;
        throw new GraphQLError('Registration failed: ' + err.message);
      }
    },

    // User/Admin Login
    login: async (_, { username, password }) => {
      try {
        const res = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        if (res.rowCount === 0) {
          throw new GraphQLError('Invalid username or password.', {
            extensions: { code: 'BAD_USER_INPUT' }
          });
        }

        const user = res.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!isMatch) {
          throw new GraphQLError('Invalid username or password.', {
            extensions: { code: 'BAD_USER_INPUT' }
          });
        }

        const token = generateToken(user);
        return {
          token,
          user: {
            id: user.id,
            username: user.username,
            role: user.role,
            createdAt: user.created_at.toISOString()
          }
        };
      } catch (err) {
        if (err.extensions) throw err;
        throw new GraphQLError('Login failed: ' + err.message);
      }
    },

    // Create a new product (Admin Only)
    createProduct: async (_, { name, description, price, stock }, context) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      if (context.user.role !== 'admin') {
        throw new GraphQLError('Forbidden: Admin access required to manage products.', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      if (price < 0 || stock < 0) {
        throw new GraphQLError('Price and Stock cannot be negative.', {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      try {
        const res = await db.query(
          `INSERT INTO products (name, description, price, stock) 
           VALUES ($1, $2, $3, $4) 
           RETURNING *`,
          [name, description, price, stock]
        );
        const prod = res.rows[0];
        return {
          id: prod.id,
          name: prod.name,
          description: prod.description,
          price: Number(prod.price),
          stock: prod.stock,
          createdAt: prod.created_at.toISOString()
        };
      } catch (err) {
        throw new GraphQLError('Failed to create product: ' + err.message);
      }
    },

    // Update an existing product (Admin Only)
    updateProduct: async (_, { id, name, description, price, stock }, context) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      if (context.user.role !== 'admin') {
        throw new GraphQLError('Forbidden: Admin access required to manage products.', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      try {
        // Fetch existing product
        const prodRes = await db.query('SELECT * FROM products WHERE id = $1', [id]);
        if (prodRes.rowCount === 0) {
          throw new GraphQLError('Product not found.', {
            extensions: { code: 'BAD_USER_INPUT' }
          });
        }
        
        const existing = prodRes.rows[0];

        const updatedName = name !== undefined ? name : existing.name;
        const updatedDesc = description !== undefined ? description : existing.description;
        const updatedPrice = price !== undefined ? price : existing.price;
        const updatedStock = stock !== undefined ? stock : existing.stock;

        if (Number(updatedPrice) < 0 || Number(updatedStock) < 0) {
          throw new GraphQLError('Price and Stock cannot be negative.', {
            extensions: { code: 'BAD_USER_INPUT' }
          });
        }

        const res = await db.query(
          `UPDATE products 
           SET name = $1, description = $2, price = $3, stock = $4 
           WHERE id = $5 
           RETURNING *`,
          [updatedName, updatedDesc, updatedPrice, updatedStock, id]
        );

        const prod = res.rows[0];
        return {
          id: prod.id,
          name: prod.name,
          description: prod.description,
          price: Number(prod.price),
          stock: prod.stock,
          createdAt: prod.created_at.toISOString()
        };

      } catch (err) {
        if (err.extensions) throw err;
        throw new GraphQLError('Failed to update product: ' + err.message);
      }
    },

    // Delete a product (Admin Only)
    deleteProduct: async (_, { id }, context) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      if (context.user.role !== 'admin') {
        throw new GraphQLError('Forbidden: Admin access required to manage products.', {
          extensions: { code: 'FORBIDDEN' }
        });
      }

      try {
        const res = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
        if (res.rowCount === 0) {
          throw new GraphQLError('Product not found.', {
            extensions: { code: 'BAD_USER_INPUT' }
          });
        }
        return res.rows[0].id;
      } catch (err) {
        if (err.extensions) throw err;
        // Postgres returns a key constraint error if the product is ordered (exists in order_items)
        if (err.code === '23503') {
          throw new GraphQLError('Cannot delete product because it is associated with existing orders. Stock can be set to 0 instead.', {
            extensions: { code: 'CONFLICT' }
          });
        }
        throw new GraphQLError('Failed to delete product: ' + err.message);
      }
    },

    // Place an Order (Authenticated Users)
    createOrder: async (_, { items }, context) => {
      if (!context.user) {
        throw new GraphQLError('Authentication required to place an order.', {
          extensions: { code: 'UNAUTHENTICATED' }
        });
      }

      if (!items || items.length === 0) {
        throw new GraphQLError('Orders must contain at least one item.', {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      }

      // Acquire dedicated database client to run an atomic transaction
      const client = await db.getClient();

      try {
        // Begin Transaction
        await client.query('BEGIN');

        let totalPrice = 0;
        const itemsToProcess = [];

        // Step A: Lock and check stock for all products to prevent race conditions
        for (const item of items) {
          const { productId, quantity } = item;

          if (quantity <= 0) {
            throw new Error(`Quantity for product ID ${productId} must be greater than zero.`);
          }

          // Fetch product using "FOR UPDATE" to serialize inventory decrements
          const prodRes = await client.query(
            'SELECT * FROM products WHERE id = $1 FOR UPDATE',
            [productId]
          );

          if (prodRes.rowCount === 0) {
            throw new Error(`Product with ID ${productId} does not exist in our catalog.`);
          }

          const product = prodRes.rows[0];

          if (product.stock < quantity) {
            throw new Error(`Insufficient stock for product "${product.name}". Requested: ${quantity}, Available: ${product.stock}`);
          }

          const itemCost = Number(product.price) * quantity;
          totalPrice += itemCost;

          itemsToProcess.push({
            productId,
            quantity,
            price: Number(product.price),
            currentStock: product.stock
          });
        }

        // Step B: Create parent Order
        const orderRes = await client.query(
          `INSERT INTO orders (user_id, total_price, status) 
           VALUES ($1, $2, $3) 
           RETURNING *`,
          [context.user.id, totalPrice, 'COMPLETED']
        );
        const order = orderRes.rows[0];

        // Step C: Create children Order Items & decrement product stocks
        for (const item of itemsToProcess) {
          // Insert order item row
          await client.query(
            `INSERT INTO order_items (order_id, product_id, quantity, price) 
             VALUES ($1, $2, $3, $4)`,
            [order.id, item.productId, item.quantity, item.price]
          );

          // Decrement stock in catalog
          const updatedStock = item.currentStock - item.quantity;
          await client.query(
            'UPDATE products SET stock = $1 WHERE id = $2',
            [updatedStock, item.productId]
          );
        }

        // Step D: Commit Transaction
        await client.query('COMMIT');

        return {
          id: order.id,
          userId: order.user_id,
          totalPrice: Number(order.total_price),
          status: order.status,
          createdAt: order.created_at.toISOString()
        };

      } catch (err) {
        // Rollback transaction to ensure data atomicity
        await client.query('ROLLBACK');
        throw new GraphQLError(err.message, {
          extensions: { code: 'BAD_USER_INPUT' }
        });
      } finally {
        // Return database connection client to the pool
        client.release();
      }
    }
  },

  // Resolve nested Order fields
  Order: {
    user: async (parent) => {
      try {
        const res = await db.query('SELECT * FROM users WHERE id = $1', [parent.userId]);
        if (res.rowCount === 0) return null;
        const u = res.rows[0];
        return {
          id: u.id,
          username: u.username,
          role: u.role,
          createdAt: u.created_at.toISOString()
        };
      } catch (err) {
        throw new GraphQLError('Failed to resolve Order.user relationship: ' + err.message);
      }
    },
    items: async (parent) => {
      try {
        const res = await db.query(
          'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC',
          [parent.id]
        );
        return res.rows.map(row => ({
          id: row.id,
          productId: row.product_id, // Passed along to the OrderItem.product resolver
          quantity: row.quantity,
          price: Number(row.price)
        }));
      } catch (err) {
        throw new GraphQLError('Failed to resolve Order.items relationship: ' + err.message);
      }
    }
  },

  // Resolve nested OrderItem fields
  OrderItem: {
    product: async (parent) => {
      try {
        const res = await db.query('SELECT * FROM products WHERE id = $1', [parent.productId]);
        if (res.rowCount === 0) return null;
        const row = res.rows[0];
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          price: Number(row.price),
          stock: row.stock,
          createdAt: row.created_at.toISOString()
        };
      } catch (err) {
        throw new GraphQLError('Failed to resolve OrderItem.product relationship: ' + err.message);
      }
    }
  }
};
