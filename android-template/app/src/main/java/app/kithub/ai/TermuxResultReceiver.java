package app.kithub.ai;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;

/** Receives the result Termux sends back through the PendingIntent of TermuxRuntimePlugin.exec. */
public class TermuxResultReceiver extends BroadcastReceiver {
  private static final String RESULT_KEY = "result";
  private static final String RESULT_KEY_LONG = "com.termux.app.extra.TERMUX_SERVICE.EXTRA_PLUGIN_RESULT_BUNDLE";

  private static String str(Bundle b, String key) {
    String v = b == null ? null : b.getString(key);
    return v == null ? "" : v;
  }

  @Override
  public void onReceive(Context context, Intent intent) {
    if (intent == null) return;
    String id = intent.getStringExtra("pothubExecId");
    if (id == null) return;
    PluginCall call = TermuxRuntimePlugin.take(id);
    if (call == null) return; // timed out already, or PotHub was restarted; job output is still recoverable from Termux files

    // Termux returns stdout/stderr/exitCode inside a Bundle extra named "result", not as top-level extras.
    Bundle result = intent.getBundleExtra(RESULT_KEY);
    if (result == null) result = intent.getBundleExtra(RESULT_KEY_LONG);

    JSObject out = new JSObject();
    out.put("executionId", id);
    out.put("completed", true);
    if (result == null) {
      out.put("stdout", "");
      out.put("stderr", "");
      out.put("exitCode", -1);
      out.put("err", 1);
      out.put("errmsg", "Termux returned no result bundle. Update Termux to 0.109 or newer.");
    } else {
      out.put("stdout", str(result, "stdout"));
      out.put("stderr", str(result, "stderr"));
      out.put("exitCode", result.getInt("exitCode", -1));
      out.put("err", result.getInt("err", -1));
      out.put("errmsg", str(result, "errmsg"));
      out.put("stdoutOriginalLength", str(result, "stdout_original_length"));
    }
    call.resolve(out);
  }
}
