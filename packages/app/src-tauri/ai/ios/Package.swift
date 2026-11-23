// swift-tools-version:5.3
// The AI plug-in's iPhone and iPad code: keys in the Keychain, the requests the person sends, and Apple's on-device
// model where the phone has one.
import PackageDescription

let package = Package(
  name: "tauri-plugin-ai",
  platforms: [
    .iOS(.v13)
  ],
  products: [
    .library(name: "tauri-plugin-ai", type: .static, targets: ["tauri-plugin-ai"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(name: "tauri-plugin-ai", dependencies: [.byName(name: "Tauri")], path: "Sources")
  ]
)
