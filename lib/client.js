const c = require('compact-encoding')
const ReadyResource = require('ready-resource')
const Protomux = require('protomux')
const ProtomuxRPC = require('protomux-rpc')
const safetyCatch = require('safety-catch')
const DhtInspectorError = require('./errors')
const NotificationMuxer = require('./notification-muxer')
const { resolveStruct } = require('../spec/hyperschema')

const POST_REQUEST = resolveStruct('@inspector/post-request')

module.exports = class HyperdhtInspectorClient extends ReadyResource {
  /**
   * @param {import('hyperdht')} dht
   * @param {Buffer} serverPublicKey
   */
  constructor(dht, serverPublicKey) {
    super()

    this.dht = dht
    this.serverPublicKey = serverPublicKey

    this._stream = null
    this._rpc = null
    this._muxer = null
  }

  async _open() {
    this._stream = this.dht.connect(this.serverPublicKey)
    this._stream.on('error', safetyCatch)
    await this._stream.opened

    const mux = Protomux.from(this._stream)
    this._rpc = new ProtomuxRPC(mux, {
      id: Buffer.from('hyperdht-inspector-rpc')
    })
    NotificationMuxer.pair(mux, () => {
      this._muxer = new NotificationMuxer(mux, {
        onnotification: (notification) => this._onNotification(notification)
      })
    })
  }

  _close() {
    if (this._rpc) {
      this._rpc.destroy(DhtInspectorError.SESSION_CLOSED())
      this._rpc = null
    }

    if (this._muxer) {
      this._muxer.close()
      this._muxer = null
    }

    if (this._stream) {
      this._stream.destroy()
      this._stream = null
    }
  }

  /**
   * Send a Chrome DevTools Protocol request.
   *
   * SECURITY: Params are intentionally omitted: initial use cases do not need
   * them, and omitting them simplifies security. Consult the author and
   * cybersecurity before enabling params.
   *
   * @param {string} method
   * @returns {Promise<any>}
   */
  async post(method) {
    await this.ready()

    if (this.closed || this.closing || this._rpc === null || this._rpc.closed) {
      throw DhtInspectorError.SESSION_CLOSED()
    }

    return this._rpc.request(
      'inspector:post',
      { method },
      {
        requestEncoding: POST_REQUEST,
        responseEncoding: c.json
      }
    )
  }

  _onNotification(notification) {
    this.emit(notification.method, notification)
    this.emit('inspectorNotification', notification)
  }
}
