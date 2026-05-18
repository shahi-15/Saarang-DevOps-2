import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';

import { typeDefs } from './graphql/schema.js';
import { resolvers } from './graphql/resolvers.js';
import { getUserFromToken } from './middleware/auth.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 4000;

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);

  // Configure Apollo Server 4
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: true, // Explicitly enable schema introspection in production/Render!
    plugins: [
      // Proper graceful shutdown plugin for the HTTP server
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Explicitly enable embedded Sandbox GraphQL Playground even in production/Render!
      ApolloServerPluginLandingPageLocalDefault({ embed: true })
    ],
    // Clean, robust formatting for error outputs in sandbox
    formatError: (formattedError, error) => {
      console.error('[GraphQL Error]:', error);
      return {
        message: formattedError.message,
        code: formattedError.extensions?.code || 'INTERNAL_SERVER_ERROR',
        path: formattedError.path
      };
    }
  });

  // Start Apollo Server
  await server.start();

  // Apply Express middlewares
  app.use(
    '/graphql',
    cors(),
    express.json(),
    expressMiddleware(server, {
      context: async ({ req }) => {
        // Retrieve authorization header and populate context
        const authHeader = req.headers.authorization || '';
        const user = getUserFromToken(authHeader);
        return { user };
      }
    })
  );

  // Redirect root to /graphql for easy Apollo Playground access
  app.get('/', (req, res) => {
    res.redirect('/graphql');
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date() });
  });

  // Start the listener
  await new Promise((resolve) => httpServer.listen({ port: PORT }, resolve));
  console.log('\n=============================================================');
  console.log(`🚀 E-commerce Backend Server is running!`);
  console.log(`🔗 GraphQL Endpoint: http://localhost:${PORT}/graphql`);
  console.log(`🩺 Health Check:      http://localhost:${PORT}/health`);
  console.log('=============================================================\n');
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
