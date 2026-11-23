// Apple's on-device model, where the phone has one (ES§19, app_ai_on_device). It is the system's own language model,
// run on the iPhone or iPad itself: nothing sent to it leaves the device, so the app offers it first, marked private.
// It needs iOS 26 or later, a phone that can run Apple Intelligence, and Apple Intelligence turned on.
// Apple's Private Cloud Compute model is never used here: it runs on Apple's servers, not on the device.
//
// This file holds no Tauri code.
import Foundation
#if canImport(FoundationModels)
  import FoundationModels
#endif

enum OnDeviceError: Error, CustomStringConvertible {
  case none(String)
  var description: String {
    switch self {
    case .none(let why): return "the on-device model cannot be asked: \(why)"
    }
  }
}

enum OnDevice {
  /// `available`, or why not, in a word the window turns into words: `device-not-eligible`, `apple-intelligence-off`,
  /// `model-not-ready`, `unavailable`, or `none` where the system has no such model.
  static func availability() -> String {
    #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        switch SystemLanguageModel.default.availability {
        case .available: return "available"
        case .unavailable(.deviceNotEligible): return "device-not-eligible"
        case .unavailable(.appleIntelligenceNotEnabled): return "apple-intelligence-off"
        case .unavailable(.modelNotReady): return "model-not-ready"
        case .unavailable: return "unavailable"
        }
      }
    #endif
    return "none"
  }

  /// The model's answer to one request: the instructions first, then what the person sent.
  static func respond(instructions: String, prompt: String) async throws -> String {
    #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        guard case .available = SystemLanguageModel.default.availability else {
          throw OnDeviceError.none(availability())
        }
        let session = LanguageModelSession(model: SystemLanguageModel.default, instructions: instructions)
        return try await session.respond(to: prompt).content
      }
    #endif
    throw OnDeviceError.none("none")
  }
}
