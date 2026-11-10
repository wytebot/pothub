package app.kithub.ai;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/** Foreground service that keeps PotHub alive while a response is being generated and the app is in the background. */
public class KeepAliveService extends Service {
    static final String CHANNEL = "pothub-working";
    static final int ID = 7310;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String title = intent != null && intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "PotHub is working";
        String text = intent != null && intent.getStringExtra("text") != null ? intent.getStringExtra("text") : "Generating your response…";
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Generation in progress", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shown while PotHub is generating a response in the background");
            nm.createNotificationChannel(channel);
        }
        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent open = launch != null ? PendingIntent.getActivity(this, 0, launch, piFlags) : null;
        Notification notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ID, notification);
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        stopForeground(true);
        super.onDestroy();
    }
}
