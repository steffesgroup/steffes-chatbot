import { ContainerResponse, CosmosClient } from '@azure/cosmos';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

export class ChatLogger {
  containerResponsePromise: Promise<ContainerResponse>;
  constructor() {
    const deferred = createDeferred<ContainerResponse>();
    this.containerResponsePromise = deferred.promise;
    (async () => {
      const endpoint = process.env['COSMOS_ENDPOINT'];
      const key = process.env['COSMOS_KEY'];

      try {
        const client = new CosmosClient({ endpoint, key });

        const { database } = await client.databases.createIfNotExists({
          id: 'dev-2025-04-29',
        });

        database.containers
          .createIfNotExists({
            id: 'Chatbot',
          })
          .then((containerResponse) => {
            deferred.resolve(containerResponse);
          })
          .catch((error) => {
            deferred.reject(error);
          });
      } catch (error) {
        console.error(error);
      }
    })();
  }
}
