# hyperdht-inspector

Use the inspector protocol over HyperDHT with Bare or Node.js

For the client CLI, see
[`hyperdht-inspector-cli`](https://github.com/holepunchto/hyperdht-inspector-cli)

## Install

```sh
npm install hyperdht-inspector
```

## Use

Create the server in the process that you want to inspect:

```js
const HyperDHT = require('hyperdht')
const ProtomuxRpcRouter = require('protomux-rpc-router')
const { Server } = require('hyperdht-inspector')

const dht = new HyperDHT()
const router = new ProtomuxRpcRouter()
const inspector = new Server(router)
const server = dht.createServer((stream) => inspector.handleConnection(stream))

await Promise.all([router.ready(), server.listen()])
console.log(server.publicKey)
```

For production use, add router middleware before you create `Server`. Use it to
authenticate the client peer key:

```js
const allowedClientKeys = [trustedClientPublicKey]

router.use({
  async onrequest({ connection }, next) {
    const allowed = allowedClientKeys.some((key) => key.equals(connection.remotePublicKey))
    if (!allowed) throw new Error('Unauthorized inspector client')

    return next()
  }
})
```

Connect a client and send Chrome DevTools Protocol requests:

```js
const HyperDHT = require('hyperdht')
const { Client } = require('hyperdht-inspector')

const dht = new HyperDHT()
const client = new Client(dht, serverPublicKey)

client.on('HeapProfiler.addHeapSnapshotChunk', ({ params }) => {
  console.log(params.chunk)
})

await client.post('HeapProfiler.takeHeapSnapshot')
await client.close()
await dht.destroy()
```

By default, the server allows these methods:

- `HeapProfiler.takeHeapSnapshot`
- `Profiler.enable`
- `Profiler.start`
- `Profiler.stop`

By default, the server sends only the `HeapProfiler.addHeapSnapshotChunk` event.
The CPU profile is returned by `Profiler.stop`.

Requests intentionally omit params. To allow more methods or events, set
`allowMethods` and `allowEvents`:

```js
const inspector = new Server(router, {
  allowMethods: ['Runtime.enable', 'Runtime.getIsolateId'],
  allowEvents: ['Runtime.consoleAPICalled']
})
```

The application owns the DHT nodes, router, server, and access control. Allow
only trusted client keys. Close all resources during shutdown.

## Test

RPC requests use the Hyperschema encoding defined in `build.js`. Regenerate
`spec/hyperschema` after changing the schema:

```sh
npm run build
```

Responses and notifications use JSON. The binary request encoding requires both
client and server to be updated together from the previous JSON request format.

```sh
npm test
npm run test:bare
```

## License

Apache-2.0
