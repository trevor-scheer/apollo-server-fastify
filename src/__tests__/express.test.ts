import { ApolloServer, ApolloServerOptions, BaseContext } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import type {
  CreateServerForIntegrationTestsOptions,
  CreateServerForIntegrationTestsResult
} from '@apollo/server/testSuite';
import { defineIntegrationTestSuite } from '@apollo/server/testSuite';
import { json } from 'body-parser';
import cors from 'cors';
import express from 'express';
import type { Server } from 'http';
import http from 'http';
import type { AddressInfo } from 'net';
import { format } from 'url';

defineIntegrationTestSuite(async function (
  serverOptions: ApolloServerOptions<BaseContext>,
  testOptions?: CreateServerForIntegrationTestsOptions,
): Promise<CreateServerForIntegrationTestsResult> {
  const app = express();
  const httpServer = http.createServer(app);
  const server = new ApolloServer({
    ...serverOptions,
    plugins: [
      ...(serverOptions.plugins ?? []),
      ApolloServerPluginDrainHttpServer({
        httpServer,
      }),
    ],
  });

  await server.start();

  app.use(
    cors(),
    json(),
    expressMiddleware(server, {
      context: testOptions?.context,
    }),
  );
  await new Promise<void>((resolve) => {
    httpServer.listen({ port: 0 }, resolve);
  });
  return { server, url: urlForHttpServer(httpServer) };
});

export function urlForHttpServer(httpServer: Server): string {
  const { address, port } = httpServer.address() as AddressInfo;

  // Convert IPs which mean "any address" (IPv4 or IPv6) into localhost
  // corresponding loopback ip. Note that the url field we're setting is
  // primarily for consumption by our test suite. If this heuristic is wrong for
  // your use case, explicitly specify a frontend host (in the `host` option
  // when listening).
  const hostname = address === '' || address === '::' ? 'localhost' : address;

  return format({
    protocol: 'http',
    hostname,
    port,
    pathname: '/',
  });
}