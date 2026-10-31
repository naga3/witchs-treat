# 今の 64 色（番号と名前はそのまま）から、色だけ替えた候補を作る
import math, re
SRC = __file__.rsplit('/', 1)[0] + '/original.gpl'
OUT = __file__.rsplit('/', 1)[0] + '/'
rows = []
for l in open(SRC):
    m = re.match(r'\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)', l)
    if m: rows.append(([int(m[i]) for i in (1, 2, 3)], m[4]))
def lin(c): c /= 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def unlin(c): c = max(0, min(1, c)); return round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055))
def oklab(rgb):
    r, g, b = map(lin, rgb)
    l = (0.4122214708*r + 0.5363325363*g + 0.0514459929*b) ** (1/3); m = (0.2119034982*r + 0.6806995451*g + 0.1073969566*b) ** (1/3); s = (0.0883024619*r + 0.2817188376*g + 0.6299787005*b) ** (1/3)
    return (0.2104542553*l + 0.7936177850*m - 0.0040720468*s, 1.9779984951*l - 2.4285922050*m + 0.4505937099*s, 0.0259040371*l + 0.7827717662*m - 0.8086757660*s)
def rgb(L, a, b):
    l = (L + 0.3963377774*a + 0.2158037573*b) ** 3; m = (L - 0.1055613458*a - 0.0638541728*b) ** 3; s = (L - 0.0894841775*a - 1.2914855480*b) ** 3
    return [unlin(4.0767416621*l - 3.3077115913*m + 0.2309699292*s), unlin(-1.2684380046*l + 2.6097574011*m - 0.3413193965*s), unlin(-0.0041960863*l - 0.7034186147*m + 1.7076147010*s)]
def lch(c): L, a, b = oklab(c); return L, math.hypot(a, b), math.atan2(b, a)
def fromlch(L, C, h): return rgb(L, C * math.cos(h), C * math.sin(h))
def near(c, pal, wl=1):
    p = oklab(c)
    return min(pal, key=lambda q: sum((x - y) ** 2 * w for x, y, w in zip(p, oklab(q), (wl, 1.6, 1.6))))
def hexes(s): return [[int(h[i:i+2], 16) for i in (0, 2, 4)] for h in s.split()]
def write(name, title, cols):
    with open(OUT + name + '.gpl', 'w') as f:
        f.write(f'GIMP Palette\nName: {name}\nColumns: 8\n# {title}\n')
        for (c, n), (_, nm) in zip(zip(cols, range(64)), rows): f.write(f'{c[0]:3d} {c[1]:3d} {c[2]:3d}\t{nm}\n')

def fam(c, n):
    if oklab(c)[0] < 0.25: return [0, 0, 0]          # とても暗い色は黒（ファミコンの夜空は黒）
    pal = NES if n.startswith(('tl', 'cy', 'gr')) else [q for q in NES if q not in ([0, 64, 88], [0, 136, 136])]   # 青緑は元が青緑・緑の色だけ
    return near(c, pal, 4 if oklab(c)[0] < 0.45 else 1)
# A famicom: ファミコンの決まった色（約 54 色）からいちばん近い色。似た色はまとまる
NES = hexes('7C7C7C 0000FC 0000BC 4428BC 940084 A80020 A81000 881400 503000 007800 006800 005800 004058 000000 BCBCBC 0078F8 0058F8 6844FC D800CC E40058 F83800 E45C10 AC7C00 00B800 00A800 00A844 008888 F8F8F8 3CBCFC 6888FC 9878F8 F878F8 F85898 F87858 FCA044 F8B800 B8F818 58D854 58F898 00E8D8 787878 FCFCFC A4E4FC B8B8F8 D8B8F8 F8B8F8 F8A4C0 F0D0B0 FCE0A8 F8D878 D8F878 B8F8B8 B8F8D8 00FCFC F8D8F8')
write('famicom', 'ファミコンの色に寄せる（似た色はまとまる）', [fam(c, n) for c, n in rows])   # 暗い色は明るさを優先（夜空が青緑に飛ばないように）

# B hueshift: ドット絵描きの色の階段。暗い色は青紫へ、明るい色は黄色へ色相をずらし、中ほどだけ鮮やか、白と黒は純色にしない
def hs(c):
    L, C, h = lch(c)
    if C < 0.02: C = 0.02; h = math.radians(285) if L < 0.6 else math.radians(85)
    t = L                                                # 0 暗い … 1 明るい
    target = math.radians(280) if t < 0.5 else math.radians(90)
    k = abs(t - 0.5) * 0.7
    d = math.atan2(math.sin(target - h), math.cos(target - h)); h += d * k
    C *= 0.55 + 0.45 * math.sin(math.pi * min(1, max(0, t)))   # 端ほど鈍く
    L = 0.12 + L * 0.84                                  # 真っ黒・真っ白にしない
    return fromlch(L, C * 0.9, h)
write('hueshift', 'ドット絵の色の階段: 暗い色は青紫、明るい色は黄色寄り。中ほどだけ鮮やか。真っ白・真っ黒を使わない', [hs(c) for c, _ in rows])

# C storybook: 絵本のように彩度を落とした 20 色（手で選んだ色）に寄せる。紙の白、墨の黒、くすんだ橙と紫
SB = hexes('100c14 1c1622 2a2133 3d2e45 54405a 6f5a6e 8a7787 b3a2a6 e3d6c4 f4ecd8 5a2c1e 9c4a24 d27a32 e8ac52 f0d48a 2e3b2c 4f6a40 86a05a 7a2a32 c0544e d9908c 3c5a6a 6f98a0 a8c4bc 6a4a2e 9c7a52')
write('storybook', '絵本のように: 彩度を落とした手選びの 26 色に寄せる。紙の白・墨の黒・くすんだ橙と紫', [near(c, SB) for c, _ in rows])

# D pc98: 少ない色数で、群青の夜と橙の灯りだけ。冷たい青を土台に、暖色は目立つ所だけ
P8 = hexes('000000 0a0a1e 141838 22285a 34407e 5060a0 7888c0 a8b8e0 dce4f4 ffffff 3a1a10 7a3418 c05a20 f08a30 ffc060 ffe8a0 1a3a28 3a6a3a 70a050 6a1a2a b03040 f07080 ffb0c0 503070 8858a8 c090e0 20606a 40a0a0 90e0d0 806040 c0a070')
write('pc98', '群青の夜: 冷たい青を土台に、暖色は灯りとお菓子だけ。青寄りの 31 色に寄せる', [near(c, P8) for c, _ in rows])
print('ok')
