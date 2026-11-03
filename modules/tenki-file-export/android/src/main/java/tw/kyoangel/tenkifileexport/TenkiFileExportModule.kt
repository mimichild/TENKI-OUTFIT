package tw.kyoangel.tenkifileexport

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.OutputStream

/**
 * expo-file-system 的 copy 不能寫進「選資料夾」(SAF) 取得的 content:// 檔案，
 * File.write 又要把整個檔案讀進 JS；備份 zip 可能上百 MB，所以在原生端用串流複製。
 */
class TenkiFileExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("TenkiFileExport")

    // 在背景執行緒執行。失敗時刪掉目的地檔案（JS 端已用 createFile 建好），不在使用者的資料夾留下壞掉的備份
    AsyncFunction("copyToContentUriAsync") { fromUri: String, toUri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val dest = Uri.parse(toUri)
      try {
        val from = File(Uri.parse(fromUri).path ?: throw CodedException("ERR_READ", "Invalid source", null))
        if (!from.isFile) throw CodedException("ERR_READ", "Source not found", null)
        FileInputStream(from).use { input ->
          openOutput(context, dest).use { input.copyTo(it, 64 * 1024) }
        }
      } catch (e: Exception) {
        try {
          DocumentsContract.deleteDocument(context.contentResolver, dest)
        } catch (_: Exception) {
          // 刪不掉就算了，回報原本的錯誤
        }
        if (e is CodedException) throw e
        throw CodedException("ERR_WRITE", "Could not write file: ${e.message}", e)
      }
    }
  }

  /** 有些 DocumentsProvider 不支援 "wt"（截斷）；新建的檔案本來就是空的，退回 "w" */
  private fun openOutput(context: Context, uri: Uri): OutputStream {
    val stream = try {
      context.contentResolver.openOutputStream(uri, "wt")
    } catch (e: Exception) {
      context.contentResolver.openOutputStream(uri, "w")
    }
    return stream ?: throw CodedException("ERR_WRITE", "Could not open destination", null)
  }
}
