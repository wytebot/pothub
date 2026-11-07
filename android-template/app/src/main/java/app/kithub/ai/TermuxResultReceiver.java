package app.kithub.ai;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

public class TermuxResultReceiver extends BroadcastReceiver {
  static PendingIntent pendingIntent(Context context, String id) {
    Intent result = new Intent(context, TermuxResultReceiver.class);
    result.setAction(context.getPackageName() + ".TERMUX_RESULT"); result.putExtra("id", id);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_MUTABLE : 0);
    return PendingIntent.getBroadcast(context, id.hashCode(), result, flags);
  }
  @Override public void onReceive(Context context, Intent intent) {
    String id = intent.getStringExtra("id"); if (id == null) return;
    PluginCall call = TermuxRuntimePlugin.PENDING.remove(id); if (call == null) return;
    JSObject out = new JSObject();
    out.put("stdout", intent.getStringExtra("stdout") == null ? "" : intent.getStringExtra("stdout"));
    out.put("stderr", intent.getStringExtra("stderr") == null ? "" : intent.getStringExtra("stderr"));
    out.put("exitCode", intent.hasExtra("exitCode") ? intent.getIntExtra("exitCode", -1) : -1);
    out.put("executionId", id); out.put("completed", true); call.resolve(out);
  }
}
