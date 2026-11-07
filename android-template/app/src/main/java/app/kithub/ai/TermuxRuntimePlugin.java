package app.kithub.ai;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Optional bridge to Termux:Tasker/Termux RUN_COMMAND. No shell execution is available in browsers. */
@CapacitorPlugin(name = "TermuxRuntime")
public class TermuxRuntimePlugin extends Plugin {
  static final ConcurrentHashMap<String, PluginCall> PENDING = new ConcurrentHashMap<>();
  private static final String TERMUX = "com.termux";
  private static final String RUN = "com.termux.RUN_COMMAND";

  @PluginMethod public void status(PluginCall call) {
    boolean installed = false;
    try { if (Build.VERSION.SDK_INT >= 33) getContext().getPackageManager().getPackageInfo(TERMUX, PackageManager.PackageInfoFlags.of(0)); else getContext().getPackageManager().getPackageInfo(TERMUX, 0); installed = true; }
    catch (Exception ignored) {}
    JSObject out = new JSObject(); out.put("supported", true); out.put("installed", installed); out.put("provider", "termux");
    out.put("message", installed ? "Termux is installed. Enable allow-external-apps in Termux and grant PotHub command permission." : "Install Termux from its official F-Droid or GitHub distribution."); call.resolve(out);
  }

  @PluginMethod public void run(PluginCall call) {
    String command = call.getString("command", "").trim();
    String cwd = call.getString("cwd", "").trim();
    boolean approved = call.getBoolean("approved", false);
    if (!approved) { call.reject("Command execution requires explicit user approval.", "APPROVAL_REQUIRED"); return; }
    if (command.isEmpty() || command.length() > 12000) { call.reject("Command is empty or exceeds the 12,000 character limit."); return; }
    if (command.indexOf('\0') >= 0) { call.reject("Invalid command."); return; }
    try {
      Intent intent = new Intent(RUN);
      intent.setPackage(TERMUX);
      intent.putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash");
      intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", new String[]{"-lc", command});
      if (!cwd.isEmpty()) intent.putExtra("com.termux.RUN_COMMAND_WORKDIR", cwd);
      intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND", false);
      intent.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", "0");
      String id = UUID.randomUUID().toString();
      intent.putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", TermuxResultReceiver.pendingIntent(getContext(), id));
      PENDING.put(id, call);
      try { getContext().startService(intent); }
      catch (Exception e) { PENDING.remove(id); call.reject("Termux could not start the command. Check Termux installation and allow-external-apps. " + e.getMessage(), "TERMUX_START_FAILED"); }
    } catch (Exception e) { call.reject("Could not prepare Termux command: " + e.getMessage()); }
  }

  @PluginMethod public void stop(PluginCall call) {
    // Foreground RUN_COMMAND invocations are managed by Termux. This method deliberately
    // reports the limitation instead of falsely claiming that a process was terminated.
    JSObject out = new JSObject(); out.put("stopped", false); out.put("supported", false);
    out.put("message", "Termux does not expose a reliable per-command kill handle through this callback mode. Stop the command in Termux, or use the cloud runner's process cancellation."); call.resolve(out);
  }
}
