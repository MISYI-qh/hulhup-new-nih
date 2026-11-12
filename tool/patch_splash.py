"""Setelah flutter_native_splash:create: buat bilah status dan navigasi saat splash terang/gelap serasi dengan latar
(tanpa bilah hitam di atas dan bawah), seperti splash aplikasi lain."""
import glob, re
for f in glob.glob('android/app/src/main/res/values*/styles.xml'):
    s = open(f).read()
    if 'LaunchTheme' not in s: continue
    dark = 'night' in f
    light = 'false' if dark else 'true'
    items = ('\n        <item name="android:windowDrawsSystemBarBackgrounds">true</item>'
             '\n        <item name="android:statusBarColor">@android:color/transparent</item>\n        <item name="android:navigationBarColor">@android:color/transparent</item>'
             '\n        <item name="android:enforceStatusBarContrast">false</item>\n        <item name="android:enforceNavigationBarContrast">false</item>'
             f'\n        <item name="android:windowLightStatusBar">{light}</item>\n        <item name="android:windowLightNavigationBar">{light}</item>\n    ')
    m = re.search(r'(<style name="LaunchTheme".*?)(</style>)', s, re.S)
    if m and 'statusBarColor' not in m.group(1):
        s = s[:m.end(1)] + items + s[m.start(2):]
        open(f, 'w').write(s); print('patched', f)
