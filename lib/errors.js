module.exports = class HyperdhtInspectorError extends Error {
  constructor(message, code, fn = HyperdhtInspectorError, { cause } = {}) {
    super(`${code}: ${message}`, { cause })
    this.code = code

    if (Error.captureStackTrace) Error.captureStackTrace(this, fn)
  }

  get name() {
    return 'HyperDhtInspectorError'
  }

  static SESSION_CLOSED() {
    return new HyperdhtInspectorError(
      'The inspector session is closed',
      'SESSION_CLOSED',
      HyperdhtInspectorError.SESSION_CLOSED
    )
  }

  static METHOD_NOT_ALLOWED(method) {
    return new HyperdhtInspectorError(
      `Inspector method is not allowed: ${method}`,
      'METHOD_NOT_ALLOWED',
      HyperdhtInspectorError.METHOD_NOT_ALLOWED
    )
  }
}
