# Secure E-commerce Backend API (Express + GraphQL + PostgreSQL + JWT)

A high-performance, robust, and secure backend e-commerce service developed with **Node.js**, **Express.js**, **PostgreSQL**, and **GraphQL (Apollo Server 4)**. 

## Features
- **Database Schema**: Structured PostgreSQL schema with `users`, `products`, `orders`, and many-to-many `order_items` tables with constraints and referential integrity.
- **GraphQL API**: Fully featured queries and mutations for catalogue browsing, profiles, and checkouts.
- **JWT Authentication & RBAC**: Safe password hashing via `bcrypt` and JSON Web Token (JWT) authorization. Role-Based Access Control distinguishes regular `user` and `admin` operations.
- **Race-Condition Safe Transactions**: Orders are created using atomic PostgreSQL transactions. Product prices are calculated server-side, stock levels are checked and decremented atomically, and `FOR UPDATE` query locking is implemented to prevent overselling.

---

## Technical Stack
- **Runtime**: Node.js (ES Modules)
- **Web Server**: Express.js
- **GraphQL Engine**: Apollo Server 4 (integrated as Express middleware)
- **Database Driver**: `pg` (node-postgres Connection Pool)
- **Cryptography**: `bcryptjs` (password hashing), `jsonwebtoken` (JWT tokens)
- **Environment Management**: `dotenv`

---

## Directory Structure
```
├── schema.sql                 # SQL tables script
├── db-setup.js                # Database builder & seeder (Admin + Starter inventory)
├── package.json               # Scripts & dependencies
├── .env                       # Local connection variables
├── .env.example               # Environmental variables template
└── src/
    ├── index.js               # Express app and Apollo Server configuration
    ├── config/
    │   └── db.js              # PostgreSQL client connection pool wrapper
    ├── middleware/
    │   └── auth.js            # JWT payload encryption/decryption middleware
    └── graphql/
        ├── schema.js          # GraphQL Type Definitions (SDL)
        └── resolvers.js       # Core Query/Mutation endpoints & relation resolvers
```

---

## Database Setup

Since PostgreSQL is not currently active on your local machine, you can set up the database in **two ways**:

### Option A: Use a Free Cloud PostgreSQL Instance (Recommended & Instant)
1. Go to [Neon Console](https://neon.tech/) or [Supabase](https://supabase.com/) and create a free project.
2. Copy your PostgreSQL connection string (looks like `postgres://username:password@ep-xyz-123.us-east-2.aws.neon.tech/neondb?sslmode=require`).
3. Open the `.env` file in the project root:
   ```env
   DATABASE_URL=your_copied_connection_string
   ```
4. Run the automated table creation and seeding script:
   ```bash
   npm run db:setup
   ```

### Option B: Install PostgreSQL Locally
1. Run the following command in PowerShell/Command Prompt (requires administrator confirmation):
   ```bash
   winget install PostgreSQL.PostgreSQL
   ```
2. Follow the prompt to install PostgreSQL and set up the default `postgres` password.
3. Update `.env` with your password:
   ```env
   DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/saarang_ecommerce
   ```
4. Run the automated table creation and seeding script:
   ```bash
   npm run db:setup
   ```

---

## Running the Server
After successfully setting up the database connection and running the setup command, start the developer server:
```bash
# Starts the server using nodemon for live-reload
npm run dev
```

The terminal will confirm:
```
=============================================================
🚀 E-commerce Backend Server is running!
🔗 GraphQL Endpoint: http://localhost:4000/graphql
🩺 Health Check:      http://localhost:4000/health
=============================================================
```

---

## GraphQL API Documentation & Testing Examples

Open `http://localhost:4000/graphql` in your browser to open the interactive Apollo Server Sandbox / GraphQL Playground.

### 1. User Registration (Mutation)
Creates a new customer. (Pass `isAdmin: true` if you wish to register a new administrator account).

```graphql
mutation RegisterUser {
  register(username: "sarah_connor", password: "securepassword123") {
    token
    user {
      id
      username
      role
      createdAt
    }
  }
}
```

### 2. User Login (Mutation)
Authenticates a user and returns a JWT token. Copy the **token** string from the response to authorize subsequent mutations.

```graphql
mutation LoginUser {
  login(username: "john_doe", password: "userpassword") {
    token
    user {
      id
      username
      role
    }
  }
}
```

> **Note on Authorization Headers:** 
> To run authenticated mutations, click **"Connection Settings"** or go to the bottom of the Apollo Sandbox screen, find the **"HTTP Headers"** tab, and add:
> ```json
> {
>   "Authorization": "Bearer YOUR_JWT_TOKEN_HERE"
> }
> ```

---

### 3. Product Catalogue Queries

#### Get All Products
Accessible by anyone (no authentication required).
```graphql
query GetAllProducts {
  products {
    id
    name
    description
    price
    stock
    createdAt
  }
}
```

#### Get Single Product by ID
```graphql
query GetProductDetail {
  product(id: "1") {
    id
    name
    description
    price
    stock
  }
}
```

---

### 4. Admin Product Management (Mutations - Requires Admin Token)
*Use the token returned from registering/logging in with the administrator account (`admin` / `adminpassword` or an account registered with `isAdmin: true`).*

#### Create a Product
```graphql
mutation CreateNewProduct {
  createProduct(
    name: "Ultra Curved Gaming Monitor"
    description: "34-inch 1440p 165Hz mini-LED gaming screen."
    price: 499.99
    stock: 12
  ) {
    id
    name
    price
    stock
  }
}
```

#### Update a Product
Allows dynamic, partial updates.
```graphql
mutation UpdateProductDetails {
  updateProduct(
    id: "1"
    price: 1399.00
    stock: 20
  ) {
    id
    name
    price
    stock
  }
}
```

#### Delete a Product
```graphql
mutation RemoveProduct {
  deleteProduct(id: "4")
}
```

---

### 5. Order Management

#### Place an Order (Mutation - Requires Authenticated Token)
This executes a secure multi-table database transaction. It verifies inventory stock, computes cost, inserts the order, adds order item details, and decrements catalog stock atomically.
```graphql
mutation CheckoutOrder {
  createOrder(
    items: [
      { productId: "1", quantity: 2 },
      { productId: "2", quantity: 1 }
    ]
  ) {
    id
    totalPrice
    status
    createdAt
  }
}
```

#### Get All Orders (Query - Requires Authenticated Token)
*If logged in as `admin`, lists all orders placed on the system. If logged in as `user`, lists only their own order history.*
```graphql
query FetchOrders {
  orders {
    id
    totalPrice
    status
    createdAt
    user {
      username
      role
    }
    items {
      id
      quantity
      price
      product {
        name
        description
      }
    }
  }
}
```

#### Get Single Order by ID (Query - Requires Authenticated Token)
*Owners and Administrators can retrieve detailed deep-nested items.*
```graphql
query GetOrderDetails {
  order(id: "1") {
    id
    totalPrice
    status
    user {
      username
    }
    items {
      id
      quantity
      price
      product {
        name
        price
      }
    }
  }
}
```
