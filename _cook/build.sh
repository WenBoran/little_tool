#!/bin/sh
# 拼成单文件：sh build.sh（需要 python3 + fonttools + brotli，用于把快乐体裁成只含游戏用到的字）
cd "$(dirname "$0")"
python3 - <<'PY'
import base64, io, re
from fontTools import subset
from fontTools.ttLib import TTFont
css = ''.join(open(f).read() for f in ['c1.css', 'c2.css', 'c3.css', 'c4.css', 'c5.css', 'c6.css', 'c7.css'])
html = open('u1.html').read()
js = ''.join(open(f).read() + '\n' for f in ['u_env.js', 'l1.js', 'l2.js', 'l3.js', 'u0.js', 'u3.js', 'u4.js', 'u5.js', 'u6.js', 'u7.js', 'u8.js', 'u9.js'])
chars = set(html + js + css) | set('0123456789+-×=/?!.%：，。、（）()「」…→ abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ')
def sub(path, text):
    f = TTFont(path); opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['*']
    s = subset.Subsetter(opt); s.populate(text=text); s.subset(f)
    buf = io.BytesIO(); f.flavor = 'woff2'; f.save(buf); return buf.getvalue()
latin = ''.join(chr(c) for c in range(32, 127)) + '×→…'
cjk = ''.join(c for c in chars if ord(c) > 127)
k = sub('font/ZCOOLKuaiLe.ttf', cjk); fr = sub('font/Fredoka.ttf', latin)
b = lambda x: base64.b64encode(x).decode()
font = ("@font-face { font-family: 'KuaiLe'; src: url(data:font/woff2;base64,%s) format('woff2'); font-display: block; }\n"
        "@font-face { font-family: 'Fred'; src: url(data:font/woff2;base64,%s) format('woff2'); font-display: block; }") % (b(k), b(fr))
print('font kb', len(k) // 1024, len(fr) // 1024)
out = html.replace('<style id="font"></style>', '<style>' + font + '</style>').replace('<style id="css2"></style>', '<style>\n' + css + '</style>')
open('../cooking-roguelike.html', 'w').write(out + '<script>\n' + js + '</script>\n</body>\n</html>\n')
PY
