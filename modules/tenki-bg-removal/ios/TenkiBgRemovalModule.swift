import CoreImage
import ImageIO
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

final class WriteException: GenericException<String> {
  override var code: String { "ERR_WRITE" }
  override var reason: String { "Could not write image: \(param)" }
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
      let image = try Self.loadNormalized(uri: uri, maxSize: max(maxSize, 1))
      let png = try Self.cutout(image)
      let jpeg = try Self.jpeg(image)
      let cutoutUrl = try Self.write(png, ext: "png")
      let originalUrl: URL
      do {
        originalUrl = try Self.write(jpeg, ext: "jpg")
      } catch {
        try? FileManager.default.removeItem(at: cutoutUrl)
        throw error
      }
      return [
        "uri": cutoutUrl.absoluteString, "originalUri": originalUrl.absoluteString,
        "width": image.width, "height": image.height,
      ]
    }
    .runOnQueue(.global(qos: .userInitiated))

    // 去背沒成功時用：只轉正、縮小、存 JPEG（不需要 iOS 17）
    AsyncFunction("normalizeAsync") { (uri: String, maxSize: Int) throws -> [String: Any] in
      let image = try Self.loadNormalized(uri: uri, maxSize: max(maxSize, 1))
      let url = try Self.write(try Self.jpeg(image), ext: "jpg")
      return ["uri": url.absoluteString, "width": image.width, "height": image.height]
    }
    .runOnQueue(.global(qos: .userInitiated))
  }

  /// 讀檔時直接解碼成縮圖（不先解碼原尺寸大圖）、依 EXIF 轉正，長邊最多 maxSize（不放大）
  private static func loadNormalized(uri: String, maxSize: Int) throws -> CGImage {
    let url = URL(string: uri).flatMap { $0.isFileURL ? $0 : nil } ?? URL(fileURLWithPath: uri)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let props = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let w = props[kCGImagePropertyPixelWidth] as? Int,
          let h = props[kCGImagePropertyPixelHeight] as? Int
    else { throw LoadImageException(uri) }

    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: min(maxSize, max(w, h)),
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
      throw LoadImageException(uri)
    }
    return image
  }

  private static func jpeg(_ image: CGImage) throws -> Data {
    guard let data = UIImage(cgImage: image).jpegData(compressionQuality: 0.9) else {
      throw WriteException("JPEG encoding failed")
    }
    return data
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
      throw WriteException(error.localizedDescription)
    }
  }
}
