// A request the person sent to a model they set up (ES§19, app_ai_host). The window made it and showed it, and the
// Rust side checked its address and method first (src/lib.rs, `refused`). Here it is sent as given, with no cookies,
// no cache and nothing kept, and stopped after 120 seconds or 8 MiB of answer. A model the person runs is reached by
// its name on their own network, such as a Tailscale name (ai_private_is_own).
//
// This file holds no Tauri code.
import Foundation

enum RequestError: Error, CustomStringConvertible {
  case address
  case tooLong
  case noAnswer
  var description: String {
    switch self {
    case .address: return "the address could not be read"
    case .tooLong: return "the answer was over 8 MiB"
    case .noAnswer: return "no answer came back"
    }
  }
}

enum Requests {
  static let answerMost = 8 * 1024 * 1024
  static let seconds: TimeInterval = 120

  /// A session that keeps nothing: no cookies, no cache, no credentials.
  static let session: URLSession = {
    let c = URLSessionConfiguration.ephemeral
    c.httpCookieStorage = nil
    c.urlCache = nil
    c.urlCredentialStorage = nil
    c.timeoutIntervalForRequest = seconds
    c.timeoutIntervalForResource = seconds
    return URLSession(configuration: c)
  }()

  static func send(
    url: String, method: String, headers: [String: String], body: String,
    done: @escaping (Result<(Int, String), Error>) -> Void
  ) {
    guard let to = URL(string: url) else { return done(.failure(RequestError.address)) }
    var r = URLRequest(url: to)
    r.httpMethod = method
    for (name, value) in headers { r.setValue(value, forHTTPHeaderField: name) }
    if method == "POST" { r.httpBody = Data(body.utf8) }
    session.dataTask(with: r) { data, response, error in
      if let error = error { return done(.failure(error)) }
      guard let http = response as? HTTPURLResponse else { return done(.failure(RequestError.noAnswer)) }
      let bytes = data ?? Data()
      if bytes.count > answerMost { return done(.failure(RequestError.tooLong)) }
      done(.success((http.statusCode, String(decoding: bytes, as: UTF8.self))))
    }.resume()
  }
}
