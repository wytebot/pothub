// Push notifications are managed by PotHub; Codelab only reports their state.
export const isMedianApp=()=>false;
export const getNotificationPermission=()=>typeof Notification==="undefined"?"unsupported":Notification.permission;
export const refreshNotificationPermission=async()=>getNotificationPermission();
export const isNotificationsEnabled=()=>false;
export const enableNotifications=async()=>{throw new Error("Notifications are managed by PotHub in this build.")};
export const disableNotifications=async()=>true;
export const initNotifications=async()=>{};
