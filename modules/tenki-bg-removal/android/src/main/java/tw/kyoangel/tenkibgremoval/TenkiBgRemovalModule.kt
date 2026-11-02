package tw.kyoangel.tenkibgremoval

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.util.UUID
import java.util.concurrent.ExecutionException
import kotlin.math.max

class TenkiBgRemovalModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("TenkiBgRemoval")

    AsyncFunction("isAvailableAsync") {
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }

    // AsyncFunction 在背景執行緒跑，可以同步等待 ML Kit 的 Task
    AsyncFunction("removeBackgroundAsync") { uri: String, maxSize: Int ->
      if (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) != ConnectionResult.SUCCESS) {
        throw CodedException("ERR_UNAVAILABLE", "Google Play services are not available", null)
      }
      val bitmap = loadNormalized(Uri.parse(uri), max(maxSize, 1))
      val foreground = segment(bitmap)
      val cutout = write(foreground, Bitmap.CompressFormat.PNG, "png")
      val original = write(bitmap, Bitmap.CompressFormat.JPEG, "jpg")
      mapOf(
        "uri" to Uri.fromFile(cutout).toString(),
        "originalUri" to Uri.fromFile(original).toString(),
        "width" to foreground.width,
        "height" to foreground.height,
      )
    }
  }

  private fun open(uri: Uri): InputStream =
    (if (uri.scheme == null) File(uri.toString()).inputStream() else context.contentResolver.openInputStream(uri))
      ?: throw CodedException("ERR_LOAD_IMAGE", "Could not open $uri", null)

  /** 讀檔、縮到長邊 maxSize（不放大）、依 EXIF 轉正 */
  private fun loadNormalized(uri: Uri, maxSize: Int): Bitmap {
    try {
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      open(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
      if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
        throw CodedException("ERR_LOAD_IMAGE", "Could not decode $uri", null)
      }

      var sample = 1
      while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= maxSize) sample *= 2
      val decoded = open(uri).use {
        BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
      } ?: throw CodedException("ERR_LOAD_IMAGE", "Could not decode $uri", null)

      val orientation = open(uri).use {
        ExifInterface(it).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
      }
      val matrix = Matrix()
      when (orientation) {
        ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
        ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
        ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
        ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
        ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
        ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.postRotate(90f); matrix.postScale(-1f, 1f) }
        ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.postRotate(270f); matrix.postScale(-1f, 1f) }
      }
      val scale = minOf(1f, maxSize.toFloat() / max(decoded.width, decoded.height))
      matrix.postScale(scale, scale)
      if (matrix.isIdentity) return decoded
      return Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, matrix, true).also {
        if (it !== decoded) decoded.recycle()
      }
    } catch (e: CodedException) {
      throw e
    } catch (e: Exception) {
      throw CodedException("ERR_LOAD_IMAGE", "Could not load $uri: ${e.message}", e)
    }
  }

  private fun segment(bitmap: Bitmap): Bitmap {
    val options = SubjectSegmenterOptions.Builder().enableForegroundBitmap().build()
    val segmenter = SubjectSegmentation.getClient(options)
    try {
      val result = Tasks.await(segmenter.process(InputImage.fromBitmap(bitmap, 0)))
      // foregroundBitmap 與輸入同尺寸、背景透明；找不到主體時為 null 或全透明
      return result.foregroundBitmap ?: throw CodedException("ERR_NO_SUBJECT", "No foreground subject found", null)
    } catch (e: ExecutionException) {
      throw CodedException("ERR_SEGMENTATION", "Background removal failed: ${e.cause?.message}", e.cause)
    } finally {
      segmenter.close()
    }
  }

  private fun write(bitmap: Bitmap, format: Bitmap.CompressFormat, ext: String): File {
    val dir = File(context.cacheDir, "bg-removal").apply { mkdirs() }
    val file = File(dir, "${UUID.randomUUID()}.$ext")
    FileOutputStream(file).use { bitmap.compress(format, if (format == Bitmap.CompressFormat.PNG) 100 else 90, it) }
    return file
  }
}
