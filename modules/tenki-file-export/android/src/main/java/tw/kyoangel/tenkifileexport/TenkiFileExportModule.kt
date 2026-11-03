package tw.kyoangel.tenkifileexport

import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream

/**
 * expo-file-system 的 copy 不能寫進「選資料夾」(SAF) 取得的 content:// 檔案，
 * File.write 又要把整個檔案讀進 JS；備份 zip 可能上百 MB，所以在原生端用串流複製。
 */
class TenkiFileExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TenkiFileExport")

    // 在背景執行緒執行
    AsyncFunction("copyToContentUriAsync") { fromUri: String, toUri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val from = File(Uri.parse(fromUri).path ?: throw CodedException("ERR_READ", "Invalid source $fromUri", null))
      if (!from.isFile) throw CodedException("ERR_READ", "Source not found", null)
      try {
        FileInputStream(from).use { input ->
          val output = context.contentResolver.openOutputStream(Uri.parse(toUri), "wt")
            ?: throw CodedException("ERR_WRITE", "Could not open destination", null)
          output.use { input.copyTo(it, 64 * 1024) }
        }
      } catch (e: CodedException) {
        throw e
      } catch (e: Exception) {
        throw CodedException("ERR_WRITE", "Could not write file: ${e.message}", e)
      }
    }
  }
}
