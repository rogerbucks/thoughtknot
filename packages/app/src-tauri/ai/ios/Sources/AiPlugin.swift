// The AI plug-in's door for the app's Rust side (src/lib.rs): keys in the Keychain (AiKeys.swift), a request the person
// sent (Requests.swift), and Apple's on-device model (OnDevice.swift).
import SwiftRs
import Tauri
import UIKit
import WebKit

class NamedArgs: Decodable {
  let name: String
}

class KeepArgs: Decodable {
  let name: String
  let key: String
}

class RequestArgs: Decodable {
  let url: String
  let method: String
  let headers: [String: String]
  let body: String
}

class AskArgs: Decodable {
  let instructions: String
  let prompt: String
}

struct Here: Encodable {
  let host: Bool
  let onDevice: String
}

struct Has: Encodable {
  let has: Bool
}

struct Found: Encodable {
  let key: String?
}

struct Reply: Encodable {
  let status: Int
  let text: String
}

struct Answer: Encodable {
  let text: String
}

class AiPlugin: Plugin {
  @objc public func here(_ invoke: Invoke) {
    invoke.resolve(Here(host: true, onDevice: OnDevice.availability()))
  }

  @objc public func keySet(_ invoke: Invoke) throws {
    let a = try invoke.parseArgs(KeepArgs.self)
    do {
      try AiKeys.keep(name: a.name, key: a.key)
      invoke.resolve()
    } catch {
      invoke.reject("the Keychain could not keep the key: \(error)")
    }
  }

  @objc public func keyHas(_ invoke: Invoke) throws {
    let a = try invoke.parseArgs(NamedArgs.self)
    do {
      invoke.resolve(Has(has: try AiKeys.has(name: a.name)))
    } catch {
      invoke.reject("the Keychain could not be read: \(error)")
    }
  }

  @objc public func keyGet(_ invoke: Invoke) throws {
    let a = try invoke.parseArgs(NamedArgs.self)
    do {
      invoke.resolve(Found(key: try AiKeys.key(name: a.name)))
    } catch {
      invoke.reject("the Keychain could not give the key: \(error)")
    }
  }

  @objc public func keyForget(_ invoke: Invoke) throws {
    let a = try invoke.parseArgs(NamedArgs.self)
    do {
      try AiKeys.forget(name: a.name)
      invoke.resolve()
    } catch {
      invoke.reject("the Keychain could not forget the key: \(error)")
    }
  }

  @objc public func request(_ invoke: Invoke) throws {
    let a = try invoke.parseArgs(RequestArgs.self)
    Requests.send(url: a.url, method: a.method, headers: a.headers, body: a.body) { result in
      switch result {
      case .success(let (status, text)): invoke.resolve(Reply(status: status, text: text))
      case .failure(let error): invoke.reject("\(error)")
      }
    }
  }

  @objc public func ask(_ invoke: Invoke) throws {
    let a = try invoke.parseArgs(AskArgs.self)
    Task {
      do {
        invoke.resolve(Answer(text: try await OnDevice.respond(instructions: a.instructions, prompt: a.prompt)))
      } catch {
        invoke.reject("\(error)")
      }
    }
  }
}

@_cdecl("init_plugin_ai")
func initPlugin() -> Plugin {
  return AiPlugin()
}
