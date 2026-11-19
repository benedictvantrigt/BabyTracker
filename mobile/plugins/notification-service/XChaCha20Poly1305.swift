import CryptoKit
import Foundation

/// XChaCha20-Poly1305 decryption on top of CryptoKit's ChaChaPoly (IETF, 12-byte nonce):
/// HChaCha20 derives a subkey from the key and the first 16 nonce bytes; the last 8 nonce
/// bytes, after four zero bytes, are the ChaChaPoly nonce. Same output as @noble/ciphers.
enum XChaCha20Poly1305 {
  static let nonceBytes = 24
  static let tagBytes = 16

  /// `sealed` is nonce (24 bytes) || ciphertext || tag (16 bytes). Nil when it does not open.
  static func open(_ sealed: Data, key: Data, aad: Data) -> Data? {
    let bytes = [UInt8](sealed)
    guard key.count == 32, bytes.count >= nonceBytes + tagBytes else { return nil }
    let nonce = Array(bytes[0..<nonceBytes])
    let ciphertext = Data(bytes[nonceBytes..<(bytes.count - tagBytes)])
    let tag = Data(bytes[(bytes.count - tagBytes)...])
    let subkey = hChaCha20(key: [UInt8](key), nonce: Array(nonce[0..<16]))
    do {
      let box = try ChaChaPoly.SealedBox(
        nonce: ChaChaPoly.Nonce(data: [UInt8](repeating: 0, count: 4) + nonce[16..<24]),
        ciphertext: ciphertext,
        tag: tag
      )
      return try ChaChaPoly.open(box, using: SymmetricKey(data: subkey), authenticating: aad)
    } catch {
      return nil
    }
  }

  static func hChaCha20(key: [UInt8], nonce: [UInt8]) -> [UInt8] {
    func word(_ b: [UInt8], _ i: Int) -> UInt32 {
      UInt32(b[i]) | UInt32(b[i + 1]) << 8 | UInt32(b[i + 2]) << 16 | UInt32(b[i + 3]) << 24
    }
    var s: [UInt32] = [0x6170_7865, 0x3320_646e, 0x7962_2d32, 0x6b20_6574]
    for i in 0..<8 { s.append(word(key, i * 4)) }
    for i in 0..<4 { s.append(word(nonce, i * 4)) }

    func rotl(_ v: UInt32, _ n: UInt32) -> UInt32 { (v << n) | (v >> (32 - n)) }
    func quarter(_ a: Int, _ b: Int, _ c: Int, _ d: Int) {
      s[a] = s[a] &+ s[b]; s[d] = rotl(s[d] ^ s[a], 16)
      s[c] = s[c] &+ s[d]; s[b] = rotl(s[b] ^ s[c], 12)
      s[a] = s[a] &+ s[b]; s[d] = rotl(s[d] ^ s[a], 8)
      s[c] = s[c] &+ s[d]; s[b] = rotl(s[b] ^ s[c], 7)
    }
    for _ in 0..<10 {
      quarter(0, 4, 8, 12); quarter(1, 5, 9, 13); quarter(2, 6, 10, 14); quarter(3, 7, 11, 15)
      quarter(0, 5, 10, 15); quarter(1, 6, 11, 12); quarter(2, 7, 8, 13); quarter(3, 4, 9, 14)
    }
    var out: [UInt8] = []
    for w in Array(s[0..<4]) + Array(s[12..<16]) {
      out += [UInt8(w & 0xff), UInt8(w >> 8 & 0xff), UInt8(w >> 16 & 0xff), UInt8(w >> 24 & 0xff)]
    }
    return out
  }
}
