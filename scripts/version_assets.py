#!/usr/bin/env python3
"""Version local UI assets after configuration is generated; no secret values printed."""
import hashlib,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DOCS=ROOT/'docs'
def main():
    def replace(match):
        quote=match[2];relative=match[3].split('?',1)[0]
        if relative.startswith(('http:','https:','//')):return match[0]
        path=DOCS/relative
        if not path.is_file():raise ValueError(f'Missing local UI asset: {relative}')
        digest=hashlib.sha256(path.read_bytes()).hexdigest()[:16]
        return match[1]+quote+relative+'?v='+digest+quote
    for p in [DOCS/'index.html',DOCS/'newsletter.html']:
        if not p.exists():continue
        html=p.read_text()
        html=re.sub(r'((?:src|href)=)([\"\'])([^\"\']+\.(?:js|css)(?:\?[^\"\']*)?)\2',replace,html)
        p.write_text(html)
    print('Versioned local scripts/styles for cache-safe deployment.')
if __name__=='__main__':main()
