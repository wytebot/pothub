package app.kithub.ai;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONException;

/**
 * Low-level bridge to Termux's RUN_COMMAND service.
 *
 * This plugin only sends one background command and returns its result bundle. Live streaming, kill and
 * re-attach are built in JavaScript (src/lib/termux-core.js) on top of this primitive by running each job
 * as files inside Termux and polling them with short commands.
 */
@CapacitorPlugin(
  name = "TermuxRuntime",
  permissions = { @Permission(alias = "runCommand", strings = { "com.termux.permission.RUN_COMMAND" }) }
)
public class TermuxRuntimePlugin extends Plugin {
  private static final String TERMUX = "com.termux";
  private static final String RUN_SERVICE = "com.termux.app.RunCommandService";
  private static final String RUN_ACTION = "com.termux.RUN_COMMAND";
  private static final String DEFAULT_BASH = "/data/data/com.termux/files/usr/bin/bash";
  /** Linux limits one argv entry to 131,072 bytes; stay safely below it. */
  private static final int MAX_ARG_BYTES = 128000;
  /** Intent extras travel through Binder (about 1 MB per transaction); keep the whole request below that. */
  private static final int MAX_TOTAL_BYTES = 900000;

  private static final Handler MAIN = new Handler(Looper.getMainLooper());
  private static final ConcurrentHashMap<String, PluginCall> PENDING = new ConcurrentHashMap<>();
  private static final ConcurrentHashMap<String, Runnable> TIMEOUTS = new ConcurrentHashMap<>();
  private static final AtomicInteger REQUEST_CODES = new AtomicInteger(1000);

  /** Used by TermuxResultReceiver. Returns the waiting call (or null if it already timed out / was lost on restart). */
  static PluginCall take(String id) {
    Runnable timeout = TIMEOUTS.remove(id);
    if (timeout != null) MAIN.removeCallbacks(timeout);
    return PENDING.remove(id);
  }

  private PackageInfo termuxInfo() {
    try {
      PackageManager pm = getContext().getPackageManager();
      if (Build.VERSION.SDK_INT >= 33) return pm.getPackageInfo(TERMUX, PackageManager.PackageInfoFlags.of(0));
      return pm.getPackageInfo(TERMUX, 0);
    } catch (Exception ignored) {
      return null;
    }
  }

  private boolean permissionGranted() {
    return getPermissionState("runCommand") == PermissionState.GRANTED;
  }

  private JSObject statusObject() {
    PackageInfo info = termuxInfo();
    boolean installed = info != null;
    boolean granted = installed && permissionGranted();
    JSObject out = new JSObject();
    out.put("supported", true);
    out.put("installed", installed);
    out.put("permissionGranted", granted);
    out.put("version", installed && info.versionName != null ? info.versionName : "");
    out.put("provider", "termux");
    String message;
    if (!installed) message = "Install Termux from F-Droid or its GitHub releases.";
    else if (!granted) message = "Allow PotHub to run commands in Termux when Android asks.";
    else message = "Termux is ready. If commands time out, set allow-external-apps=true in ~/.termux/termux.properties and run termux-reload-settings.";
    out.put("message", message);
    return out;
  }

  @PluginMethod
  public void status(PluginCall call) {
    call.resolve(statusObject());
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (termuxInfo() == null) {
      call.reject("Termux is not installed.", "NOT_INSTALLED");
      return;
    }
    requestPermissionForAlias("runCommand", call, "permissionCallback");
  }

  @PermissionCallback
  private void permissionCallback(PluginCall call) {
    call.resolve(statusObject());
  }

  @PluginMethod
  public void openTermux(PluginCall call) {
    try {
      Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(TERMUX);
      if (launch == null) {
        call.reject("Termux is not installed.", "NOT_INSTALLED");
        return;
      }
      launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(launch);
      call.resolve();
    } catch (Exception e) {
      call.reject("Could not open Termux: " + e.getMessage(), "OPEN_FAILED");
    }
  }

  /**
   * Run one command through Termux.
   * Params: path (default bash), args (string[]), cwd, background (default true), timeoutMs (default 20000, 0 = wait forever),
   * approved (must be true; the UI asks the person first).
   * Result: { stdout, stderr, exitCode, err, errmsg, executionId }
   */
  @PluginMethod
  public void exec(PluginCall call) {
    if (!call.getBoolean("approved", false)) {
      call.reject("Command execution requires explicit user approval.", "APPROVAL_REQUIRED");
      return;
    }
    if (termuxInfo() == null) {
      call.reject("Termux is not installed.", "NOT_INSTALLED");
      return;
    }
    if (!permissionGranted()) {
      requestPermissionForAlias("runCommand", call, "execPermissionCallback");
      return;
    }
    startExec(call);
  }

  @PermissionCallback
  private void execPermissionCallback(PluginCall call) {
    if (!permissionGranted()) {
      call.reject("PotHub does not have permission to run commands in Termux. Grant it when Android asks, or in system settings.", "PERMISSION_DENIED");
      return;
    }
    startExec(call);
  }

  private void startExec(PluginCall call) {
    String path = call.getString("path", DEFAULT_BASH);
    if (path == null || path.trim().isEmpty()) path = DEFAULT_BASH;
    String cwd = call.getString("cwd", "");
    boolean background = call.getBoolean("background", true);
    Integer timeoutValue = call.getInt("timeoutMs", 20000);
    long timeoutMs = timeoutValue == null ? 20000 : timeoutValue.longValue();

    List<String> args = new ArrayList<>();
    JSArray raw = call.getArray("args");
    if (raw != null) {
      try {
        for (int i = 0; i < raw.length(); i++) args.add(raw.getString(i));
      } catch (JSONException e) {
        call.reject("Invalid arguments.", "BAD_ARGS");
        return;
      }
    }
    long total = path.length();
    for (String arg : args) {
      int bytes = arg.getBytes(StandardCharsets.UTF_8).length;
      if (arg.indexOf('\0') >= 0) {
        call.reject("Invalid argument.", "BAD_ARGS");
        return;
      }
      if (bytes > MAX_ARG_BYTES) {
        call.reject("One command argument is " + bytes + " bytes; Android allows about 128 KB per argument. Send large content in chunks.", "ARG_TOO_LARGE");
        return;
      }
      total += bytes;
    }
    if (total > MAX_TOTAL_BYTES) {
      call.reject("The request is too large for Android to deliver to Termux in one call.", "REQUEST_TOO_LARGE");
      return;
    }

    final String id = UUID.randomUUID().toString();
    try {
      Context context = getContext();
      Intent intent = new Intent();
      intent.setClassName(TERMUX, RUN_SERVICE);
      intent.setAction(RUN_ACTION);
      intent.putExtra("com.termux.RUN_COMMAND_PATH", path);
      intent.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", args.toArray(new String[0]));
      if (cwd != null && !cwd.trim().isEmpty()) intent.putExtra("com.termux.RUN_COMMAND_WORKDIR", cwd.trim());
      intent.putExtra("com.termux.RUN_COMMAND_BACKGROUND", background);
      if (!background) intent.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", "0");
      intent.putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", resultIntent(context, id));

      PENDING.put(id, call);
      if (timeoutMs > 0) {
        final long seconds = Math.max(1, timeoutMs / 1000);
        Runnable timeout = () -> {
          TIMEOUTS.remove(id);
          PluginCall waiting = PENDING.remove(id);
          if (waiting != null) {
            waiting.reject(
              "Termux did not respond within " + seconds + "s. Check that allow-external-apps=true is set in ~/.termux/termux.properties (then run termux-reload-settings) and that Termux is not battery-restricted.",
              "TERMUX_TIMEOUT"
            );
          }
        };
        TIMEOUTS.put(id, timeout);
        MAIN.postDelayed(timeout, timeoutMs);
      }
      try {
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
        else context.startService(intent);
      } catch (SecurityException e) {
        take(id);
        call.reject("Android blocked the request to Termux. Grant PotHub the 'Run commands in Termux' permission and set allow-external-apps=true in Termux. " + e.getMessage(), "PERMISSION_DENIED");
      } catch (Exception e) {
        take(id);
        call.reject("Termux could not start the command: " + e.getMessage(), "TERMUX_START_FAILED");
      }
    } catch (Exception e) {
      take(id);
      call.reject("Could not prepare the Termux command: " + e.getMessage(), "PREPARE_FAILED");
    }
  }

  private static PendingIntent resultIntent(Context context, String id) {
    Intent result = new Intent(context, TermuxResultReceiver.class);
    result.setAction(context.getPackageName() + ".TERMUX_RESULT");
    // Distinct data keeps concurrent executions from sharing one PendingIntent (extras are not part of identity).
    result.setData(Uri.parse("pothub-termux://exec/" + id));
    result.putExtra("pothubExecId", id);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT;
    // Termux must be able to add its result extras, so the PendingIntent has to be mutable on Android 12+.
    if (Build.VERSION.SDK_INT >= 31) flags |= PendingIntent.FLAG_MUTABLE;
    return PendingIntent.getBroadcast(context, REQUEST_CODES.incrementAndGet(), result, flags);
  }
}
