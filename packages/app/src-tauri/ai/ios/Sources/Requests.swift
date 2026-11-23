// A request the person sent to a model they set up (ES§19, app_ai_host). The window made it and showed it, and the
// Rust side checked its address and method first (src/lib.rs, `refused`). Here it is sent as given, with no cookies,
// no cache and nothing kept, and stopped after 120 seconds or 8 MiB of answer. A model the person runs is reached by
// its name on their own network, such as a Tailscale name (ai_private_is_own).
//
// The window never holds a key. Where one goes, a header names it by a mark (`KeyFill`), and the key is written in here,
// from the Keychain, only for the address it was kept for. A redirect is never followed: the request goes to the
// address the person saw, or nowhere.
//
// This file holds no Tauri code.
import Foundation

enum RequestError: Error, CustomStringConvertible, Equatable {
  case address
  case tooLong
  case noAnswer
  case redirected(Int)
  case noKey(String)
  case keyElsewhere(String)
  case keyInBody(String)
  var description: String {
    switch self {
    case .address: return "the address could not be read"
    case .tooLong: return "the answer was over 8 MiB"
    case .noAnswer: return "no answer came back"
    case .redirected(let status):
      return "the address answered \(status), sending the request elsewhere: nothing was sent on"
    case .noKey(let name): return "no key is kept in this iPhone’s Keychain for \(name)"
    case .keyElsewhere(let name):
      return "the key for \(name) was kept for another address: keep it again for this one"
    case .keyInBody(let name): return "what would be sent holds the key for \(name), so nothing was sent"
    }
  }
}

/// A header names a key by a mark the window writes: `{{keychain:NAME}}`. Here the mark becomes the key, from the
/// Keychain, and only when the request goes to the address the key was kept for.
enum KeyFill {
  static let open = "{{keychain:"
  static let close = "}}"

  /// The request's address as a key is bound to it: its scheme, host and port, in lower case. Nil when it has no host.
  static func origin(of address: String) -> String? {
    guard let c = URLComponents(string: address), let scheme = c.scheme?.lowercased(),
      let host = c.host?.lowercased(), !host.isEmpty
    else { return nil }
    return c.port.map { "\(scheme)://\(host):\($0)" } ?? "\(scheme)://\(host)"
  }

  /// The headers with each marked key written in. `find` gives a kept key and the address it was kept for.
  static func fill(
    url: String, headers: [String: String], body: String,
    find: (String) throws -> (origin: String, key: String)?
  ) throws -> [String: String] {
    var out = headers
    for (name, value) in headers {
      var filled = value
      while let start = filled.range(of: open) {
        guard let end = filled.range(of: close, range: start.upperBound..<filled.endIndex) else {
          throw RequestError.noKey(String(filled[start.upperBound...]))
        }
        let keyName = String(filled[start.upperBound..<end.lowerBound])
        guard let kept = try find(keyName) else { throw RequestError.noKey(keyName) }
        guard let to = origin(of: url), to == kept.origin else { throw RequestError.keyElsewhere(keyName) }
        // the model's key is never sent as text: the Keychain's copy is the only one the window cannot see
        if kept.key.count >= 8 && body.contains(kept.key) { throw RequestError.keyInBody(keyName) }
        filled.replaceSubrange(start.lowerBound..<end.upperBound, with: kept.key)
      }
      out[name] = filled
    }
    return out
  }
}

/// Stops every redirect: the 3xx itself comes back, and is said to be one.
final class NoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}

enum Requests {
  static let answerMost = 8 * 1024 * 1024
  static let seconds: TimeInterval = 120

  /// A session that keeps nothing: no cookies, no cache, no credentials, and no redirect followed.
  static let session: URLSession = {
    let c = URLSessionConfiguration.ephemeral
    c.httpCookieStorage = nil
    c.urlCache = nil
    c.urlCredentialStorage = nil
    c.timeoutIntervalForRequest = seconds
    c.timeoutIntervalForResource = seconds
    return URLSession(configuration: c, delegate: NoRedirects(), delegateQueue: nil)
  }()

  static func send(
    url: String, method: String, headers: [String: String], body: String,
    done: @escaping (Result<(Int, String), Error>) -> Void
  ) {
    guard let to = URL(string: url) else { return done(.failure(RequestError.address)) }
    let filled: [String: String]
    do {
      filled = try KeyFill.fill(url: url, headers: headers, body: body, find: { try AiKeys.kept(name: $0) })
    } catch {
      return done(.failure(error))
    }
    var r = URLRequest(url: to)
    r.httpMethod = method
    for (name, value) in filled { r.setValue(value, forHTTPHeaderField: name) }
    if method == "POST" { r.httpBody = Data(body.utf8) }
    session.dataTask(with: r) { data, response, error in
      if let error = error { return done(.failure(error)) }
      guard let http = response as? HTTPURLResponse else { return done(.failure(RequestError.noAnswer)) }
      if (300..<400).contains(http.statusCode) { return done(.failure(RequestError.redirected(http.statusCode))) }
      let bytes = data ?? Data()
      if bytes.count > answerMost { return done(.failure(RequestError.tooLong)) }
      done(.success((http.statusCode, String(decoding: bytes, as: UTF8.self))))
    }.resume()
  }
}
