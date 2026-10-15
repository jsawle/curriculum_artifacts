"""Inline the source files into one self-contained pooh-sticks.html."""
import pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'src'
html = (src / 'template.html').read_text(encoding='utf-8')
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
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist' / 'pooh-sticks.html'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding='utf-8')
print(out, f'{out.stat().st_size/1024:.0f} KB')
