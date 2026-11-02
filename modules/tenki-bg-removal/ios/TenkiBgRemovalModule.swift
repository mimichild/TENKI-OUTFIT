import CoreImage
import ExpoModulesCore
import UIKit
import Vision

final class NoSubjectException: Exception {
  override var code: String { "ERR_NO_SUBJECT" }
  override var reason: String { "No foreground subject found in the photo" }
}

final class UnavailableException: Exception {
  override var code: String { "ERR_UNAVAILABLE" }
  override var reason: String { "Background removal requires iOS 17 or later" }
}

final class LoadImageException: GenericException<String> {
  override var code: String { "ERR_LOAD_IMAGE" }
  override var reason: String { "Could not load image at \(param)" }
}

final class SegmentationException: GenericException<String> {
  override var code: String { "ERR_SEGMENTATION" }
  override var reason: String { "Background removal failed: \(param)" }
}

public class TenkiBgRemovalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TenkiBgRemoval")

    AsyncFunction("isAvailableAsync") { () -> Bool in
      if #available(iOS 17.0, *) { return true }
      return false
    }

    AsyncFunction("removeBackgroundAsync") { (uri: String, maxSize: Int) throws -> [String: Any] in
      guard #available(iOS 17.0, *) else { throw UnavailableException() }
      let image = try Self.loadNormalized(uri: uri, maxSize: CGFloat(max(maxSize, 1)))
      let png = try Self.cutout(image)
      guard let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.9) else {
        throw SegmentationException("JPEG encoding failed")
      }
      let cutoutUrl = try Self.write(png, ext: "png")
      let originalUrl = try Self.write(jpeg, ext: "jpg")
      return [
        "uri": cutoutUrl.absoluteString, "originalUri": originalUrl.absoluteString,
        "width": image.width, "height": image.height,
      ]
    }
    .runOnQueue(.global(qos: .userInitiated))
  }

  /// 讀檔、依 EXIF 轉正、縮到長邊 maxSize（不放大），輸出 CGImage
  private static func loadNormalized(uri: String, maxSize: CGFloat) throws -> CGImage {
    let path = URL(string: uri)?.isFileURL == true ? URL(string: uri)!.path : uri
    guard let source = UIImage(contentsOfFile: path) else { throw LoadImageException(uri) }

    let size = source.size
    let scale = min(1, maxSize / max(size.width, size.height))
    let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())

    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let normalized = UIGraphicsImageRenderer(size: target, format: format).image { _ in
      source.draw(in: CGRect(origin: .zero, size: target))
    }
    guard let cg = normalized.cgImage else { throw LoadImageException(uri) }
    return cg
  }

  @available(iOS 17.0, *)
  private static func cutout(_ image: CGImage) throws -> Data {
    let request = VNGenerateForegroundInstanceMaskRequest()
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
      try handler.perform([request])
    } catch {
      throw SegmentationException(error.localizedDescription)
    }
    guard let observation = request.results?.first, !observation.allInstances.isEmpty else {
      throw NoSubjectException()
    }

    let buffer: CVPixelBuffer
    do {
      // 不裁切：輸出與輸入同尺寸，手動修改遮罩時才能和原圖對齊
      buffer = try observation.generateMaskedImage(
        ofInstances: observation.allInstances, from: handler, croppedToInstancesExtent: false)
    } catch {
      throw SegmentationException(error.localizedDescription)
    }

    let ciImage = CIImage(cvPixelBuffer: buffer)
    let context = CIContext()
    guard let srgb = CGColorSpace(name: CGColorSpace.sRGB),
          let png = context.pngRepresentation(of: ciImage, format: .RGBA8, colorSpace: srgb)
    else {
      throw SegmentationException("PNG encoding failed")
    }
    return png
  }

  private static func write(_ data: Data, ext: String) throws -> URL {
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("bg-removal", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
      let url = dir.appendingPathComponent("\(UUID().uuidString).\(ext)")
      try data.write(to: url, options: .atomic)
      return url
    } catch {
      throw SegmentationException(error.localizedDescription)
    }
  }
}
