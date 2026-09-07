const c = require('compact-encoding')
const ReadyResource = require('ready-resource')
const inspector = require('inspector/promises')
const safetyCatch = require('safety-catch')
const { isBare } = require('which-runtime')
const DhtInspectorError = require('./errors')
const NotificationMuxer = require('./notification-muxer')
const { resolveStruct } = require('../spec/hyperschema')

const POST_REQUEST = resolveStruct('@inspector/post-request')
const SESSION = Symbol('inspector session')
const DEFAULT_ALLOW_METHODS = [
  'HeapProfiler.takeHeapSnapshot',
  'Profiler.enable',
  'Profiler.start',
  'Profiler.stop'
]
const DEFAULT_ALLOW_EVENTS = ['HeapProfiler.addHeapSnapshotChunk']

module.exports = class HyperdhtInspectorServer {
  /**
   * @param {import('protomux-rpc-router')} router
   * @param {{ allowMethods?: string[], allowEvents?: string[] }} [options]
   */
  constructor(
    router,
    { allowMethods = DEFAULT_ALLOW_METHODS, allowEvents = DEFAULT_ALLOW_EVENTS } = {}
  ) {
    this.stats = {
      attempted: 0,
      failed: 0,
      success: 0
    }

    this.router = router
    this.allowMethods = allowMethods
    this.allowEvents = allowEvents
    this.router.method(
      'inspector:post',
      {
        requestEncoding: POST_REQUEST,
        responseEncoding: c.json
      },
      (request, { connection }) => this._post(connection[SESSION], request)
    )
  }

  /**
   *
   * @param {import('stream').Duplex} connection
   */
  handleConnection(connection) {
    const inspectorSession = new InspectorSession(connection, this.allowEvents)
    connection[SESSION] = inspectorSession

    connection.once('close', () => {
      inspectorSession.close().catch(safetyCatch)
    })

    this.router.handleConnection(connection, Buffer.from('hyperdht-inspector-rpc'))
  }

  async _post(session, request) {
    this.stats.attempted++

    try {
      if (!this.allowMethods.includes(request.method)) {
        throw DhtInspectorError.METHOD_NOT_ALLOWED(request.method)
      }

      await session.ready()

      // SECURITY: Params are intentionally omitted: initial use cases do not need
      // them, and omitting them simplifies security. Consult the author and
      // cybersecurity before enabling params.
      const result = await session.session.post(request.method)

      this.stats.success++
      return result === undefined ? null : result
    } catch (error) {
      this.stats.failed++
      throw error
    }
  }
}

class InspectorSession extends ReadyResource {
  constructor(connection, allowEvents) {
    super()

    this.connection = connection
    this.allowEvents = allowEvents
    this.muxer = null
    this.session = null
  }

  async _open() {
    this.muxer = new NotificationMuxer(this.connection)
    await this.muxer.channel.fullyOpened()

    try {
      const session = new inspector.Session()
      session.on('inspectorNotification', (message) => {
        if (this.allowEvents.includes(message.method)) {
          this.muxer.sendNotification(message)
        }
      })

      this.session = session
      session.connect()
    } catch (error) {
      // destroying the connection here triggers cleanup via 'close' listener
      this.connection.destroy(error)
      throw error
    }
  }

  _close() {
    const muxer = this.muxer
    const session = this.session

    this.muxer = null
    this.session = null

    try {
      if (session !== null) {
        if (isBare) {
          session.destroy()
        } else {
          session.disconnect()
        }
      }
    } finally {
      if (muxer !== null && !muxer.channel.closed) {
        muxer.close()
      }
    }
  }
}
