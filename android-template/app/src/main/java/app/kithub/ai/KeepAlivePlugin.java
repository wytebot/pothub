package app.kithub.ai;

import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "KeepAlive")
public class KeepAlivePlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), KeepAliveService.class);
            intent.putExtra("title", call.getString("title", "PotHub is working"));
            intent.putExtra("text", call.getString("text", "Generating your response…"));
            ContextCompat.startForegroundService(getContext(), intent);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), KeepAliveService.class));
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }
}
