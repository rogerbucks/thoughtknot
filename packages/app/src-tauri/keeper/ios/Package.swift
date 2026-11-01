// swift-tools-version:5.3
// The keeper's iPhone and iPad code: the vault key, in the Keychain for this device only.
import PackageDescription

let package = Package(
  name: "tauri-plugin-keeper",
  platforms: [
    .iOS(.v13)
  ],
  products: [
    .library(name: "tauri-plugin-keeper", type: .static, targets: ["tauri-plugin-keeper"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(name: "tauri-plugin-keeper", dependencies: [.byName(name: "Tauri")], path: "Sources")
  ]
)
