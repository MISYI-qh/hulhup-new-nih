"""Setelah flutter_native_splash:create: buat bilah status dan navigasi saat splash terang/gelap serasi dengan latar
(tanpa bilah hitam di atas dan bawah), seperti splash aplikasi lain."""
import glob, re
for f in glob.glob('android/app/src/main/res/values*/styles.xml'):
    s = open(f).read()
    if 'LaunchTheme' not in s: continue
    dark = 'night' in f
    bg, light = ('#0B0B0B', 'false') if dark else ('#FFFFFF', 'true')
    items = (f'\n        <item name="android:statusBarColor">{bg}</item>\n        <item name="android:navigationBarColor">{bg}</item>'
             f'\n        <item name="android:windowLightStatusBar">{light}</item>\n        <item name="android:windowLightNavigationBar">{light}</item>\n    ')
    m = re.search(r'(<style name="LaunchTheme".*?)(</style>)', s, re.S)
    if m and 'statusBarColor' not in m.group(1):
        s = s[:m.end(1)] + items + s[m.start(2):]
        open(f, 'w').write(s); print('patched', f)
