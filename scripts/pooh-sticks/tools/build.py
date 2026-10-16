"""Inline the source files into one self-contained pooh-sticks.html (or, with --lab, pooh-sticks-lab.html)."""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
html = (src / 'template.html').read_text(encoding='utf-8')
if '--lab' in sys.argv[1:]:   # the lab page: same app, with the experimental Esri Trace Downstream engine switched on
    assert html.count('<script>/*__APP__*/</script>') == 1
    html = html.replace('<script>/*__APP__*/</script>', '<script>window.POOH_LAB = true;</script>\n<script>/*__APP__*/</script>')
parts = {
    '/*__FLOW__*/': (src / 'flow.js').read_text(encoding='utf-8'),
    '/*__LOGIC__*/': (src / 'logic.js').read_text(encoding='utf-8'),
    '/*__SEAS__*/': (src / 'seas.json').read_text(encoding='utf-8'),
    '/*__LAKES__*/': (src / 'lakes.json').read_text(encoding='utf-8'),
    '/*__PLACES__*/': (src / 'places.json').read_text(encoding='utf-8'),
    '/*__APP__*/': (src / 'app.js').read_text(encoding='utf-8'),
}
for k, v in parts.items():
    if '</script' in v.lower():
        sys.exit(f'refusing to inline {k}: contains </script')
    assert html.count(k) == 1, k
    html = html.replace(k, v)
args = [a for a in sys.argv[1:] if a != '--lab']
lab = '--lab' in sys.argv[1:]
out = pathlib.Path(args[0]) if args else root / 'dist' / ('pooh-sticks-lab.html' if lab else 'pooh-sticks.html')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding='utf-8')
print(out, f'{out.stat().st_size/1024:.0f} KB')
