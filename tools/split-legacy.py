# One-time split of the old single-file index.html into the Angular client (migration phase 1).
import sys, pathlib
src = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8').split('\n')
L = lambda a, b: '\n'.join(src[a-1:b])  # 1-based, inclusive
root = pathlib.Path('client')
head = L(1, 67)          # doctype .. gstats init (inside <head>)
loader = L(70, 91)       # loading screen markup + style + script
extra_head = L(92, 96)   # <title>, fonts
css = L(98, 198).replace('url(img/', 'url(/img/')  # Angular resolves relative CSS urls at build time
markup = L(201, 243)
js = L(245, 3623)
noscript = L(3626, 3626)
assert src[96] == '<style>' and src[198] == '</style>' and src[243] == '<script>' and src[3623] == '</script>'
index = head + '\n' + extra_head + '\n<base href="/">\n</head>\n<body>\n' + loader + '\n<app-root></app-root>\n' + noscript + '\n</body>\n</html>\n'
(root / 'src/index.html').write_text(index, encoding='utf-8')
(root / 'src/app/play/play.css').write_text(css + '\n', encoding='utf-8')
(root / 'src/app/play/play.html').write_text(markup + '\n', encoding='utf-8')
(root / 'public/game').mkdir(parents=True, exist_ok=True)
(root / 'public/game/legacy-game.js').write_text(js + '\n', encoding='utf-8')
print('ok', len(js.split('\n')), 'lines of game code')
