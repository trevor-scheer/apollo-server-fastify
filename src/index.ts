import type {
  ApolloServer,
  BaseContext,
  ContextFunction,
  HTTPGraphQLRequest
} from '@apollo/server';
import type { WithRequired } from '@apollo/utils.withrequired';
import type { IncomingMessageExtended } from '@fastify/middie';
import type http from 'http';
export interface FastifyContextFunctionArgument {
  request: http.IncomingMessage & IncomingMessageExtended;
  reply: http.ServerResponse;
}

type Handler = (request: http.IncomingMessage & IncomingMessageExtended, reply: http.ServerResponse) => void

export interface FastifyMiddlewareOptions<TContext extends BaseContext> {
  context?: ContextFunction<[FastifyContextFunctionArgument], TContext>;
}

export function fastifyMiddleware(
  server: ApolloServer<BaseContext>,
  options?: FastifyMiddlewareOptions<BaseContext>,
): Handler;
export function fastifyMiddleware<TContext extends BaseContext>(
  server: ApolloServer<TContext>,
  options: WithRequired<FastifyMiddlewareOptions<TContext>, 'context'>,
): Handler;
export function fastifyMiddleware<TContext extends BaseContext>(
  server: ApolloServer<TContext>,
  options?: FastifyMiddlewareOptions<TContext>,
): Handler {
  server.assertStarted('fastifyMiddleware()');

  // This `any` is safe because the overload above shows that context can
  // only be left out if you're using BaseContext as your context, and {} is a
  // valid BaseContext.
  const defaultContext: ContextFunction<
    [FastifyContextFunctionArgument],
    any
  > = async () => ({});

  const context: ContextFunction<[FastifyContextFunctionArgument], TContext> =
    options?.context ?? defaultContext;

  return (request, reply) => {
    if (!request.body) {
      // TODO: this is probably just an express-ism
      //
      // The json body-parser *always* sets req.body to {} if it's unset (even
      // if the Content-Type doesn't match), so if it isn't set, you probably
      // forgot to set up body-parser. (Note that this may change in the future
      // body-parser@2.)
      reply.statusCode = 500;
      reply.end(
        '`request.body` is not set; this probably means you forgot to set up the ' +
          '`body-parser` middleware before the Apollo Server middleware.',
      );
      return;
    }

    const headers = new Map<string, string>();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) {
        // Node/Express headers can be an array or a single value. We join
        // multi-valued headers with `, ` just like the Fetch API's `Headers`
        // does. We assume that keys are already lower-cased (as per the Node
        // docs on IncomingMessage.headers) and so we don't bother to lower-case
        // them or combine across multiple keys that would lower-case to the
        // same value.
        headers.set(key, Array.isArray(value) ? value.join(', ') : value);
      }
    }

    const httpGraphQLRequest: HTTPGraphQLRequest = {
      method: request.method?.toUpperCase() ?? "GET",
      headers,
      searchParams: request.query,
      body: request.body,
    };

    // Fastify will handle any error / promise rejection here with a 500
    server
      .executeHTTPGraphQLRequest({
        httpGraphQLRequest,
        context: () => context({ request, reply }),
      })
      .then((httpGraphQLResponse) => {
        if (httpGraphQLResponse.completeBody === null) {
          // TODO(AS4): Implement incremental delivery or improve error handling.
          throw Error('Incremental delivery not implemented');
        }

        for (const [key, value] of httpGraphQLResponse.headers) {
          reply.setHeader(key, value);
        }
        reply.statusCode = httpGraphQLResponse.statusCode || 200;
        reply.end(httpGraphQLResponse.completeBody);
      });
  };
}
