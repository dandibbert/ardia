import CryptoKit
import Foundation

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data((message + "\n").utf8))
  exit(1)
}

func decode(_ text: String) -> Data {
  guard let data = Data(base64Encoded: text.trimmingCharacters(in: .whitespacesAndNewlines)) else { fail("not base64") }
  return data
}

let args = CommandLine.arguments
guard args.count >= 3 else { fail("usage: ed25519.swift public <key-file> | verify <public-key> <signature> <file>") }

switch args[1] {
case "public":
  guard let text = try? String(contentsOfFile: args[2], encoding: .utf8) else { fail("can't read \(args[2])") }
  let key = decode(text)
  switch key.count {
  case 32:
    guard let privateKey = try? Curve25519.Signing.PrivateKey(rawRepresentation: key) else { fail("not an Ed25519 seed") }
    print(privateKey.publicKey.rawRepresentation.base64EncodedString())
  case 96:
    print(key.suffix(32).base64EncodedString())
  default:
    fail("a Sparkle private key is 32 or 96 bytes, this one is \(key.count)")
  }
case "verify":
  guard args.count == 5, let file = FileManager.default.contents(atPath: args[4]) else { fail("can't read the signed file") }
  guard let publicKey = try? Curve25519.Signing.PublicKey(rawRepresentation: decode(args[2])) else { fail("not an Ed25519 public key") }
  guard publicKey.isValidSignature(decode(args[3]), for: file) else { fail("the signature doesn't match the public key") }
  print("signature ok")
default:
  fail("unknown command \(args[1])")
}
