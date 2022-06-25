import { fastifyMiddleware } from '..';
import http, { Server } from 'http';
import Fastify from 'fastify';
import { defineIntegrationTestSuite } from '@apollo/server/testSuite';
import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import type { AddressInfo } from 'net';
import { format } from 'url';

describe('integration', () => {
  defineIntegrationTestSuite(async function (serverOptions, testOptions) {
    let httpServer: http.Server;
    const app = Fastify({
      serverFactory: (handler, _opts) => {
        const server = http.createServer((req, res) => {
          handler(req, res);
        });
        httpServer = server;
        return server;
      },
    });

    const server = new ApolloServer({
      ...serverOptions,
      plugins: [
        ...(serverOptions.plugins ?? []),
        ApolloServerPluginDrainHttpServer({
          httpServer: httpServer!,
        }),
      ],
    });

    await server.start();

    const middlewareSupport = await import('@fastify/middie');
    await app.register(middlewareSupport.default);

    app.use(
      // cors(),
      // json(),
      fastifyMiddleware(server, { context: testOptions?.context }),
    );
    await new Promise<void>((resolve) => {
      httpServer.listen({ port: 0 }, resolve);
    });
    return { server, url: urlForHttpServer(httpServer!) };
  });
});

function urlForHttpServer(httpServer: Server): string {
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