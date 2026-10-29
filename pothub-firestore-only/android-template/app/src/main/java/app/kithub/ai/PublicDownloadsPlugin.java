package app.kithub.ai;

import android.Manifest;
import android.content.ContentValues;
import android.content.pm.PackageManager;
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

@CapacitorPlugin(name = "PublicDownloads", permissions = {
    @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE })
})
public class PublicDownloadsPlugin extends Plugin {
  @PluginMethod public void save(PluginCall call) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
      requestPermissionForAlias("storage", call, "savePermissionCallback");
      return;
    }
    saveNow(call);
  }
  @PermissionCallback private void savePermissionCallback(PluginCall call) { saveNow(call); }
  private void saveNow(PluginCall call) {
    String filename = call.getString("filename", "pothub-file.txt");
    String mime = call.getString("mimeType", "application/octet-stream");
    String base64 = call.getString("data", "");
    byte[] bytes;
    try { bytes = Base64.decode(base64, Base64.DEFAULT); }
    catch (Exception e) { call.reject("File data was not valid base64."); return; }
    try {
      Uri uri;
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Pothub");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IllegalStateException("Android could not create a Downloads entry.");
        try (OutputStream out = getContext().getContentResolver().openOutputStream(uri)) {
          if (out == null) throw new IllegalStateException("Android could not open the Downloads file.");
          out.write(bytes);
        }
        values.clear(); values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        getContext().getContentResolver().update(uri, values, null, null);
        JSObject result = new JSObject(); result.put("uri", uri.toString()); result.put("location", "Downloads/Pothub/" + filename); result.put("size", bytes.length); call.resolve(result);
      } else {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Pothub");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Downloads is not writable; use Documents/Pothub fallback.");
        File file = new File(dir, filename);
        try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); }
        JSObject result = new JSObject(); result.put("uri", Uri.fromFile(file).toString()); result.put("location", "Downloads/Pothub/" + filename); result.put("size", bytes.length); call.resolve(result);
      }
    } catch (Exception e) { call.reject("Could not save to public Downloads: " + e.getMessage()); }
  }
}
