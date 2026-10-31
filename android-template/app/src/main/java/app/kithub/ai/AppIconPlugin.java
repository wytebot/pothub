package app.kithub.ai;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.regex.Pattern;

/**
 * Switches the launcher icon by enabling exactly one of the generated
 * PotIcon_* activity-aliases (see scripts/android-app-icons.mjs).
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
  private static final String ALIAS_PREFIX = "PotIcon_";
  private static final Pattern ID = Pattern.compile("^[a-z]+-[a-z]+$");

  private String aliasClass(String id) {
    return AppIconPlugin.class.getPackage().getName() + "." + ALIAS_PREFIX + id.replace('-', '_');
  }

  @SuppressWarnings("deprecation")
  @PluginMethod
  public void setIcon(PluginCall call) {
    String id = call.getString("id");
    if (id == null || !ID.matcher(id).matches()) { call.reject("Invalid icon id."); return; }
    try {
      Context context = getContext();
      PackageManager pm = context.getPackageManager();
      String packageName = context.getPackageName();
      String targetClass = aliasClass(id);
      ComponentName target = new ComponentName(packageName, targetClass);
      try { pm.getActivityInfo(target, PackageManager.GET_DISABLED_COMPONENTS); }
      catch (PackageManager.NameNotFoundException missing) { call.reject("This icon is not part of the installed app."); return; }

      // Enable the new icon first so the app always has a launcher entry, then disable the rest.
      pm.setComponentEnabledSetting(target, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
      PackageInfo info = pm.getPackageInfo(packageName, PackageManager.GET_ACTIVITIES | PackageManager.GET_DISABLED_COMPONENTS);
      if (info.activities != null) {
        for (ActivityInfo activity : info.activities) {
          if (activity.name == null || !activity.name.contains("." + ALIAS_PREFIX) || activity.name.equals(targetClass)) continue;
          pm.setComponentEnabledSetting(new ComponentName(packageName, activity.name),
              PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
      }
      call.resolve();
    } catch (Exception error) {
      call.reject("Could not change the launcher icon: " + error.getMessage());
    }
  }
}
