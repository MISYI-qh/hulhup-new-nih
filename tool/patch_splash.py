"""Setelah flutter_native_splash:create: jendela splash menjangkau area bilah status & navigasi (tembus), jadi latar splash
terlihat penuh tanpa bilah hitam di atas dan bawah, seperti splash aplikasi lain."""
import glob, re
for f in sorted(glob.glob('android/app/src/main/res/values*/styles.xml')):
    s = open(f).read()
    if 'LaunchTheme' not in s: continue
    dark = 'night' in f
    light = 'false' if dark else 'true'
    items = ('\n        <item name="android:windowTranslucentStatus">true</item>'
             '\n        <item name="android:windowTranslucentNavigation">true</item>'
             '\n        <item name="android:statusBarColor">@android:color/transparent</item>'
             '\n        <item name="android:navigationBarColor">@android:color/transparent</item>'
             '\n        <item name="android:enforceStatusBarContrast">false</item>'
             '\n        <item name="android:enforceNavigationBarContrast">false</item>'
             '\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>'
             f'\n        <item name="android:windowLightStatusBar">{light}</item>'
             f'\n        <item name="android:windowLightNavigationBar">{light}</item>\n    ')
    m = re.search(r'(<style name="LaunchTheme".*?)(</style>)', s, re.S)
    if m and 'windowTranslucentStatus' not in m.group(1):
        s = s[:m.end(1)] + items + s[m.start(2):]
        open(f, 'w').write(s); print('patched', f)
    print(open(f).read())
