import { gql } from 'graphql-tag';

// We use gql template literal to define the GraphQL type definitions.
export const typeDefs = gql`
  type Product {
    id: ID!
    name: String!
    description: String
    price: Float!
    stock: Int!
    createdAt: String!
  }

  type Order {
    id: ID!
    userId: ID!
    user: User!
    totalPrice: Float!
    status: String!
    items: [OrderItem!]!
    createdAt: String!
  }

  type OrderItem {
    id: ID!
    product: Product!
    quantity: Int!
    price: Float!
  }

  type User {
    id: ID!
    username: String!
    role: String!
    createdAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  input OrderItemInput {
    productId: ID!
    quantity: Int!
  }

  type Query {
    # Product queries
    products: [Product!]!
    product(id: ID!): Product

    # Order queries
    orders: [Order!]!
    order(id: ID!): Order
    
    # User profile query
    me: User
  }

  type Mutation {
    # Authentication mutations
    register(username: String!, password: String!, isAdmin: Boolean): AuthPayload!
    login(username: String!, password: String!): AuthPayload!

    # Product mutations (Admin only)
    createProduct(name: String!, description: String, price: Float!, stock: Int!): Product!
    updateProduct(id: ID!, name: String, description: String, price: Float, stock: Int): Product!
    deleteProduct(id: ID!): ID!

    # Order mutations (Authenticated users)
    createOrder(items: [OrderItemInput!]!): Order!
  }
`;
