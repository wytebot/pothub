package app.kithub.ai;

import android.Manifest;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PermissionState;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "PublicDownloads", permissions = {
    @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
})
public class PublicDownloadsPlugin extends Plugin {
  private static final class DownloadSession {
    String filename; String mime; Uri uri; File file; OutputStream stream; long size; boolean mediaStore;
  }
  private final Map<String, DownloadSession> sessions = new ConcurrentHashMap<>();

  @PluginMethod public void begin(PluginCall call) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
      requestPermissionForAlias("storage", call, "beginPermissionCallback"); return;
    }
    beginNow(call);
  }
  @PermissionCallback private void beginPermissionCallback(PluginCall call) { beginNow(call); }
  private void beginNow(PluginCall call) {
    String filename = safeFilename(call.getString("filename", "pothub-file.bin"));
    String mime = call.getString("mimeType", "application/octet-stream");
    DownloadSession session = new DownloadSession(); session.filename = filename; session.mime = mime;
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ContentValues values = new ContentValues(); values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename); values.put(MediaStore.MediaColumns.MIME_TYPE, mime); values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Pothub"); values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        session.uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (session.uri == null) throw new IllegalStateException("Android could not create a Downloads entry.");
        session.stream = getContext().getContentResolver().openOutputStream(session.uri); session.mediaStore = true;
      } else {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Pothub");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Downloads is not writable.");
        session.file = new File(dir, filename); session.stream = new FileOutputStream(session.file);
      }
      if (session.stream == null) throw new IllegalStateException("Android could not open the Downloads file.");
      String id = UUID.randomUUID().toString(); sessions.put(id, session); JSObject result = new JSObject(); result.put("id", id); result.put("location", "Downloads/Pothub/" + filename); call.resolve(result);
    } catch (Exception e) { cleanup(session); call.reject("Could not begin saving to Downloads: " + e.getMessage()); }
  }

  @PluginMethod public void append(PluginCall call) {
    String id = call.getString("id", ""), encoded = call.getString("data", ""); DownloadSession session = sessions.get(id);
    if (session == null) { call.reject("Download session expired. Start saving the file again."); return; }
    try { byte[] bytes = Base64.decode(encoded, Base64.DEFAULT); session.stream.write(bytes); session.size += bytes.length; JSObject result = new JSObject(); result.put("size", session.size); call.resolve(result); }
    catch (Exception e) { call.reject("Could not write the Downloads file: " + e.getMessage()); }
  }

  @PluginMethod public void finish(PluginCall call) {
    String id = call.getString("id", ""); DownloadSession session = sessions.remove(id);
    if (session == null) { call.reject("Download session expired. Start saving the file again."); return; }
    try {
      session.stream.flush(); session.stream.close();
      if (session.mediaStore) { ContentValues values = new ContentValues(); values.put(MediaStore.MediaColumns.IS_PENDING, 0); getContext().getContentResolver().update(session.uri, values, null, null); }
      JSObject result = new JSObject(); result.put("uri", session.mediaStore ? session.uri.toString() : Uri.fromFile(session.file).toString()); result.put("location", "Downloads/Pothub/" + session.filename); result.put("size", session.size); call.resolve(result);
    } catch (Exception e) { cleanup(session); call.reject("Could not finish the Downloads file: " + e.getMessage()); }
  }

  @PluginMethod public void abort(PluginCall call) { DownloadSession session = sessions.remove(call.getString("id", "")); if (session != null) cleanup(session); call.resolve(); }

  private String safeFilename(String value) { String name = value == null ? "pothub-file.bin" : value.replaceAll("[^A-Za-z0-9._-]", "_"); return name.isEmpty() ? "pothub-file.bin" : name.substring(0, Math.min(160, name.length())); }
  private void cleanup(DownloadSession session) { try { if (session.stream != null) session.stream.close(); } catch (Exception ignored) {} try { if (session.mediaStore && session.uri != null) getContext().getContentResolver().delete(session.uri, null, null); else if (session.file != null) session.file.delete(); } catch (Exception ignored) {} }
}
