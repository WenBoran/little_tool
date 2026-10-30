#!/bin/sh
# 小工具打包：sh build_minitool.sh → ../minitool/dist（目录）+ ../minitool/xiaozao-minitool.zip
# 与 build.sh 的单文件 HTML 不同：脚本外置（容器 CSP 禁止内联脚本）、字体为包内 woff2 文件（不内嵌 Base64）
cd "$(dirname "$0")"
python3 - <<'PY'
import io, os, shutil, zipfile
from fontTools import subset
from fontTools.ttLib import TTFont
CSS = ['c1.css', 'c2.css', 'c3.css', 'c4.css', 'c5.css', 'c6.css', 'c7.css']
JS = ['u_env.js', 'l1.js', 'l2.js', 'l3.js', 'u0.js', 'u3.js', 'u4.js', 'u5.js', 'u6.js', 'u7.js', 'u8.js', 'u9.js']
out = '../minitool/dist'
shutil.rmtree(out, ignore_errors=True); os.makedirs(out + '/assets/fonts')
css = ''.join(open(f).read() + '\n' for f in CSS)
js = ''.join(open(f).read() + '\n' for f in JS)
html = open('u1.html').read()
chars = set(html + js + css) | set('0123456789+-×=/?!.%：，。、（）()「」…→ ')
def sub(path, text, dst):
    f = TTFont(path); opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']
    s = subset.Subsetter(opt); s.populate(text=text); s.subset(f); f.flavor = 'woff2'; f.save(dst)
sub('font/ZCOOLKuaiLe.ttf', ''.join(c for c in chars if ord(c) > 127), out + '/assets/fonts/kuaile.woff2')
sub('font/Fredoka.ttf', ''.join(chr(c) for c in range(32, 127)) + '×→…', out + '/assets/fonts/fredoka.woff2')
font = ("@font-face { font-family: 'KuaiLe'; src: url(./fonts/kuaile.woff2) format('woff2'); font-display: block; }\n"
        "@font-face { font-family: 'Fred'; src: url(./fonts/fredoka.woff2) format('woff2'); font-display: block; }\n")
open(out + '/assets/style.css', 'w').write(font + css)
open(out + '/assets/main.js', 'w').write('/* 小灶：料理卡牌肉鸽（源码见 _cook/*.js，按依赖顺序拼接）*/\n' + js)
page = html.replace('<style id="font"></style>\n', '').replace('<style id="css2"></style>', '<link rel="stylesheet" href="./assets/style.css">')
page += '<script src="./assets/main.js"></script>\n</body>\n</html>\n'
open(out + '/index.html', 'w').write(page)
z = '../minitool/xiaozao-minitool.zip'
if os.path.exists(z): os.remove(z)
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, _, files in os.walk(out):
        for fn in sorted(files):
            p = os.path.join(root, fn); zf.write(p, os.path.relpath(p, out))
for root, _, files in os.walk(out):
    for fn in files: p = os.path.join(root, fn); print(os.path.relpath(p, out), os.path.getsize(p))
print('zip', os.path.getsize(z))
PY
